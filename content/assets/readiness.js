/* OfferReady — Readiness / Progress engine (single, job-scoped, DB-backed).
 * ---------------------------------------------------------------------------
 * This is the ONE readiness+progress engine (it replaces the split between the
 * old localStorage-only dashboard and progress.js). SOURCE OF TRUTH IS THE
 * DATABASE, not localStorage:
 *
 *   - The dashboard loads the signed-in user's jobs from GET /api/jobs, lets
 *     them pick the active job, then loads that job's persisted readiness from
 *     GET /api/jobs/:id  ->  { job, gap, questions, progress }.
 *   - Overall + area scores come from the persisted gap_analysis and
 *     progress_metrics rows for that job. Open it on any device and it's there.
 *   - localStorage is used ONLY as an offline convenience cache and for the
 *     signed-out/no-backend states — never as the authority for core data.
 *
 * Also exposes a small compute helper window.OfferReadyReadiness.score() so
 * other modules can render the same weighted number consistently.
 *
 * Mounts on #dashboard-app.
 */

(function () {
  "use strict";

  var API = (typeof window !== "undefined" && window.OFFERREADY_API_BASE) || "";
  var ACTIVE_JOB_KEY = "offerready.activeJob.v1";   // remembers last-opened job id (a pointer, not data)
  var CACHE_KEY = "offerready.readiness.cache.v1";  // offline cache ONLY (not source of truth)

  function clampInt(n, lo, hi) {
    n = Math.round(Number(n)); if (!isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }

  // Weighted overall from a gap row (+ optional practice avg / completion).
  function weightedOverall(gap, practiceAvg, completion) {
    var match = gap ? (gap.match_score || 0) : 0;
    if (!gap && !practiceAvg) return 0;
    return clampInt(0.5 * match + 0.3 * (practiceAvg || 0) + 0.2 * (completion || 0), 0, 100);
  }

  // Public compute helper (kept small + pure).
  window.OfferReadyReadiness = {
    weightedOverall: weightedOverall,
    setActiveJob: function (id) { try { localStorage.setItem(ACTIVE_JOB_KEY, id || ""); } catch (e) {} },
    getActiveJob: function () { try { return localStorage.getItem(ACTIVE_JOB_KEY) || ""; } catch (e) { return ""; } },
  };

  function init() {
    var root = document.getElementById("dashboard-app");
    if (!root || root.dataset.mounted) return;
    root.dataset.mounted = "1";

    var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
    var base = (window.__md_scope && window.__md_scope.pathname ? window.__md_scope.pathname.replace(/[^/]*$/, "") : "/");

    // ---- render helpers ---------------------------------------------------
    function bar(label, pct) {
      var band = pct >= 75 ? "or-good" : pct >= 50 ? "or-mid" : "or-weak";
      var row = el("div", "or-bar-row");
      row.appendChild(el("div", "or-bar-label", esc(label)));
      var track = el("div", "or-bar-track");
      var fill = el("div", "or-bar-fill " + band); fill.style.width = Math.max(3, pct) + "%";
      track.appendChild(fill); row.appendChild(track);
      row.appendChild(el("div", "or-bar-pct", pct + "%"));
      return row;
    }
    function stat(num, label) {
      return el("div", "or-stat", '<div class="or-stat-num">' + esc(String(num)) + '</div><div class="or-stat-label">' + esc(label) + "</div>");
    }
    function sparkline(scores) {
      var W = 220, H = 46, P = 4, n = scores.length;
      if (n < 2) return el("div", "or-muted or-small", "Complete a couple of readiness snapshots to see your trend.");
      var x = function (i) { return P + (i * (W - 2 * P)) / (n - 1); };
      var y = function (v) { return H - P - (v / 100) * (H - 2 * P); };
      var pts = scores.map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
      var last = scores[n - 1];
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="or-spark" role="img" aria-label="Readiness trend">' +
        '<polyline points="' + pts + '" fill="none" stroke="var(--md-primary-fg-color)" stroke-width="2.5"></polyline>' +
        '<circle cx="' + x(n - 1) + '" cy="' + y(last) + '" r="3.2" fill="var(--md-accent-fg-color)"></circle></svg>';
      return el("div", null, svg);
    }

    // ---- states -----------------------------------------------------------
    function note(msg) { root.innerHTML = ""; root.appendChild(el("div", "or-card", "<p class=\"or-muted\">" + esc(msg) + "</p>")); }

    function signedOut() {
      root.innerHTML = "";
      var c = el("div", "or-card");
      c.appendChild(el("h2", null, "Your interview readiness"));
      c.appendChild(el("p", "or-muted", "Sign in to see your readiness across every job you're preparing for \u2014 saved to your account and available on any device."));
      var slot = el("div"); slot.id = "or-auth-slot"; c.appendChild(slot);
      root.appendChild(c);
      if (window.OfferReadyAuth && window.OfferReadyAuth.onChange) {
        window.OfferReadyAuth.onChange(function (session) { if (session) boot(); });
      }
    }

    function emptyJobs() {
      root.innerHTML = "";
      var c = el("div", "or-card");
      c.appendChild(el("h2", null, "No jobs yet"));
      c.appendChild(el("p", "or-muted", "Readiness is tracked per job. Add your target role, then analyze the gap and practice \u2014 your score builds here."));
      var row = el("div", "or-actions");
      row.innerHTML =
        '<a class="or-btn or-btn-primary" href="' + base + 'Analyze/index.html">\uD83C\uDFAF Analyze a job</a>' +
        '<a class="or-btn" href="' + base + 'Gap-Analysis/index.html">\u2696\ufe0f Run a gap analysis</a>';
      c.appendChild(row);
      root.appendChild(c);
    }

    // ---- data flow (DB is source of truth) --------------------------------
    function authHeaders(token) { return { "Content-Type": "application/json", Authorization: "Bearer " + token }; }

    function boot() {
      if (!API) { renderFromCache("Live sync isn\u2019t enabled on this site, so this is your last saved snapshot."); return; }
      if (!window.OfferReadyAuth) { renderFromCache("Sign-in isn\u2019t available, so this is your last saved snapshot."); return; }
      note("Loading your readiness\u2026");
      window.OfferReadyAuth.getAccessToken().then(function (token) {
        if (!token) { signedOut(); return; }
        loadJobs(token);
      }).catch(function () { signedOut(); });
    }

    function loadJobs(token) {
      fetch(API.replace(/\/$/, "") + "/api/jobs", { headers: authHeaders(token) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
        .then(function (res) {
          if (res.status === 401) { signedOut(); return; }
          if (res.status !== 200 || !res.body || !res.body.ok) { renderFromCache("Couldn\u2019t reach your account, so this is your last saved snapshot."); return; }
          var jobs = res.body.jobs || [];
          if (!jobs.length) { emptyJobs(); return; }
          // Pick the active job: remembered id if still present, else newest.
          var activeId = window.OfferReadyReadiness.getActiveJob();
          var active = jobs.filter(function (j) { return j.id === activeId; })[0] || jobs[0];
          loadJob(token, jobs, active.id);
        })
        .catch(function () { renderFromCache("Couldn\u2019t reach your account, so this is your last saved snapshot."); });
    }

    function loadJob(token, jobs, jobId) {
      window.OfferReadyReadiness.setActiveJob(jobId);
      fetch(API.replace(/\/$/, "") + "/api/jobs/" + encodeURIComponent(jobId), { headers: authHeaders(token) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
        .then(function (res) {
          if (res.status !== 200 || !res.body || !res.body.job) { note("Couldn\u2019t load that job\u2019s readiness."); return; }
          var payload = { jobs: jobs, job: res.body.job, gap: res.body.gap || null,
                          questions: res.body.questions || [], progress: res.body.progress || [] };
          cache(payload);
          renderDashboard(payload, token);
        })
        .catch(function () { note("Couldn\u2019t reach the server."); });
    }

    // ---- cache (offline convenience ONLY) ---------------------------------
    function cache(payload) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          when: Date.now(), jobTitle: payload.job.title,
          gap: payload.gap, progress: payload.progress, questionCount: (payload.questions || []).length,
        }));
      } catch (e) {}
    }
    function renderFromCache(reason) {
      var c = null;
      try { c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
      if (!c) { signedOut(); return; }
      root.innerHTML = "";
      root.appendChild(el("div", "or-card", '<p class="or-muted">' + esc(reason) + "</p>"));
      renderScoreBlocks(c.gap, c.progress, c.questionCount, c.jobTitle);
    }

    // ---- dashboard --------------------------------------------------------
    function renderDashboard(p, token) {
      root.innerHTML = "";

      // Job switcher (only if more than one job).
      if ((p.jobs || []).length > 1) {
        var sw = el("div", "or-card or-jobswitch");
        sw.appendChild(el("span", "or-field-label", "Readiness for"));
        var sel = el("select", "or-input");
        p.jobs.forEach(function (j) {
          var o = document.createElement("option"); o.value = j.id;
          o.textContent = j.title || "Untitled role"; if (j.id === p.job.id) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener("change", function () { loadJob(token, p.jobs, sel.value); });
        sw.appendChild(sel);
        root.appendChild(sw);
      }

      renderScoreBlocks(p.gap, p.progress, (p.questions || []).length, p.job.title);

      // Next-step actions, job-aware.
      var actions = el("div", "or-card or-actions");
      actions.innerHTML =
        '<a class="or-btn or-btn-primary" href="' + base + 'Gap-Analysis/index.html">\u2696\ufe0f ' + (p.gap ? "Re-run gap analysis" : "Run gap analysis") + '</a>' +
        '<a class="or-btn" href="' + base + 'Question-Bank/index.html">\u2753 ' + ((p.questions || []).length ? "Regenerate questions" : "Generate questions") + '</a>' +
        '<a class="or-btn" href="' + base + 'Practice-Scenarios/index.html">\uD83D\uDDE1\ufe0f Practice &amp; defend</a>';
      root.appendChild(actions);
    }

    // Shared score UI used by both live + cached renders.
    function renderScoreBlocks(gap, progress, questionCount, jobTitle) {
      progress = progress || [];
      // Latest snapshot (progress rows come newest-first from the API).
      var latest = progress[0] || null;
      var practiceAvg = latest ? (latest.avg_answer_score || 0) : 0;
      var completion = Math.min((latest && latest.questions_practiced) || 0, 10) * 10;
      // Respect a persisted overall of 0 — only fall back to the computed score
      // when there is genuinely no persisted value (null/undefined), not when
      // the stored readiness legitimately rounds to 0.
      var hasPersistedOverall = latest && latest.overall_readiness != null;
      var overall = hasPersistedOverall
        ? latest.overall_readiness
        : weightedOverall(gap, practiceAvg, completion);

      var sub = function (base) {
        if (!gap && !latest) return 0;
        var b = base || 0;
        return clampInt(practiceAvg ? 0.7 * b + 0.3 * practiceAvg : b, 0, 100);
      };
      // Same presence check for each persisted sub-score (respect a stored 0).
      var has = function (v) { return v != null; };
      var technical = latest && has(latest.technical_score) ? latest.technical_score : sub(gap && gap.technical_score);
      var behavioral = latest && has(latest.behavioral_score) ? latest.behavioral_score : sub(gap && gap.behavioral_score);
      var architecture = latest && has(latest.architecture_score) ? latest.architecture_score : sub(gap && gap.architecture_score);
      var domain = latest && has(latest.domain_score) ? latest.domain_score : sub(gap && gap.domain_score);

      // Header
      var band = overall >= 75 ? "or-good" : overall >= 50 ? "or-mid" : "or-weak";
      var head = el("div", "or-card");
      var hrow = el("div", "or-score-head");
      hrow.appendChild(el("div", "or-score-num " + band, overall + "%"));
      var lbl = "<strong>Overall interview readiness</strong><br><span class=\"or-muted\">";
      lbl += jobTitle ? "For: " + esc(jobTitle) + " \u00b7 " : "";
      lbl += "Blend of resume match, practice, and completed reps.</span>";
      hrow.appendChild(el("div", "or-score-label", lbl));
      head.appendChild(hrow);
      root.appendChild(head);

      // Area bars
      var cards = el("div", "or-card");
      cards.appendChild(el("h3", null, "Readiness by area"));
      cards.appendChild(bar("Technical", technical));
      cards.appendChild(bar("Behavioral", behavioral));
      cards.appendChild(bar("Architecture", architecture));
      cards.appendChild(bar("Domain", domain));
      if (!gap) cards.appendChild(el("p", "or-muted or-small", "Run a gap analysis for this job to sharpen these area scores."));
      root.appendChild(cards);

      // Stat grid
      var g = el("div", "or-grid");
      g.appendChild(stat(gap ? gap.match_score + "%" : "\u2014", "Resume match"));
      g.appendChild(stat(questionCount || 0, "Questions ready"));
      g.appendChild(stat(latest ? (latest.questions_practiced || 0) : 0, "Questions practiced"));
      g.appendChild(stat(progress.length, "Readiness snapshots"));
      root.appendChild(g);

      // Trend (oldest->newest for the sparkline)
      if (progress.length > 1) {
        var trend = progress.slice().reverse().map(function (s) { return s.overall_readiness || 0; });
        var tcard = el("div", "or-card");
        tcard.appendChild(el("div", "or-field-label", "Readiness trend"));
        tcard.appendChild(sparkline(trend));
        root.appendChild(tcard);
      }

      // Gaps recap (from the persisted gap result)
      var res = gap && gap.result ? gap.result : null;
      if (res && ((res.missingSkills || []).length || (res.missingKeywords || []).length)) {
        var gaps = el("div", "or-card");
        gaps.appendChild(el("h3", null, "Close these gaps"));
        var list = (res.missingSkills || []).concat(res.missingKeywords || []).slice(0, 12);
        var wrap = el("div", "or-chips");
        list.forEach(function (x) { wrap.appendChild(el("span", "or-chip or-chip-warn", esc(x))); });
        gaps.appendChild(wrap);
        root.appendChild(gaps);
      }
    }

    boot();
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch (e) {} }
})();
