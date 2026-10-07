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
    // Clear the active-job pointer. Called when the pointer is found to be
    // stale (deleted / unowned job) so other pages don't keep operating on a
    // dead id. The pointer is a convenience cache, never the source of truth.
    clearActiveJob: function () { try { localStorage.removeItem(ACTIVE_JOB_KEY); } catch (e) {} },
  };

  function init() {
    var root = document.getElementById("dashboard-app");
    if (!root || root.dataset.mounted) return;
    root.dataset.mounted = "1";

    var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
    // Guard a stored title before display: skip company blurbs, junk
    // placeholders, and bare seniority levels, falling back to seniority then
    // "Untitled role". Mirrors jobs.js displayTitle for cross-page consistency.
    var TITLE_HINT_RE = /\b(is a|is an|we are|we're|company|startup|provides|focuses|founded|headquarter)\b/i;
    var LEVEL_WORDS = { senior: 1, junior: 1, staff: 1, principal: 1, lead: 1, head: 1, chief: 1, mid: 1 };
    var TITLE_JUNK = { "": 1, "not specified": 1, unspecified: 1, "n/a": 1, na: 1, none: 1, unknown: 1, untitled: 1 };
    var usableTitle = function (v) {
      var s = (v == null ? "" : String(v)).trim();
      if (!s || s.length > 80 || TITLE_HINT_RE.test(s) || TITLE_JUNK[s.toLowerCase()]) return "";
      var words = s.split(/[\s/]+/).filter(Boolean), levelOnly = words.length > 0;
      for (var i = 0; i < words.length; i++) { if (!LEVEL_WORDS[words[i].toLowerCase()]) { levelOnly = false; break; } }
      return levelOnly ? "" : s;
    };
    // j may be a job row (title+seniority) or a plain title string.
    var cleanJobTitle = function (j) {
      if (j && typeof j === "object") return usableTitle(j.title) || usableTitle(j.seniority) || "Untitled role";
      return usableTitle(j) || "Untitled role";
    };

    // Friendly labels for the Recent Practice table so users never see raw
    // enum keys or machine slugs. MODE_LABEL mirrors progress.js's map.
    var MODE_LABEL = {
      practice: "Practice", flashcard: "Flashcards", exam: "Timed Exam",
      why: "Keep Asking Why", scenario: "Defend Decisions", weak: "Weak Areas",
    };
    var modeLabel = function (m) {
      var k = String(m == null ? "" : m).trim().toLowerCase();
      if (!k) return "Practice";
      return MODE_LABEL[k] || humanize(k);
    };
    // Turn a slug/enum ("rag-assistant", "system_design") into readable words.
    var humanize = function (s) {
      var t = String(s == null ? "" : s).trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
      if (!t) return "";
      return t.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    };
    // Activity cell: prefer a human category, humanize a slug fallback, else
    // a generic label — never a raw machine slug.
    var activityLabel = function (s) {
      if (s && s.category) return humanize(s.category);
      if (s && s.content_slug) return humanize(s.content_slug);
      return "Practice";
    };
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
          // If the remembered id is stale (job deleted / not owned), clear the
          // pointer so other pages stop operating on a dead id; loadJob() below
          // then re-points it to the job we actually show.
          var activeId = window.OfferReadyReadiness.getActiveJob();
          var active = jobs.filter(function (j) { return j.id === activeId; })[0];
          if (!active) { if (activeId) window.OfferReadyReadiness.clearActiveJob(); active = jobs[0]; }
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
                          questions: res.body.questions || [], progress: res.body.progress || [],
                          practice: res.body.practice || [] };
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
          practice: (payload.practice || []).slice(0, 10),
        }));
      } catch (e) {}
    }
    function renderFromCache(reason) {
      var c = null;
      try { c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
      if (!c) { signedOut(); return; }
      root.innerHTML = "";
      root.appendChild(el("div", "or-card", '<p class="or-muted">' + esc(reason) + "</p>"));
      renderScoreBlocks(c.gap, c.progress, c.questionCount, cleanJobTitle(c.jobTitle), c.practice || []);
    }

    // ---- dashboard --------------------------------------------------------
    function renderDashboard(p, token) {
      root.innerHTML = "";

      // Current Job banner — the active job that follows the user. When more
      // than one job exists it doubles as the switcher.
      var sw = el("div", "or-card or-jobswitch");
      sw.appendChild(el("span", "or-jobbanner-label", "Current job"));
      if ((p.jobs || []).length > 1) {
        var sel = el("select", "or-input");
        p.jobs.forEach(function (j) {
          var o = document.createElement("option"); o.value = j.id;
          o.textContent = cleanJobTitle(j); if (j.id === p.job.id) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener("change", function () { loadJob(token, p.jobs, sel.value); });
        sw.appendChild(sel);
      } else {
        sw.appendChild(el("strong", null, esc(cleanJobTitle(p.job))));
      }
      root.appendChild(sw);

      // Context before metrics: a quiet row of status chips that answers
      // "where am I in the workflow?" before any score is shown.
      var qCount = (p.questions || []).length;
      var completedPractice = (p.practice || []).filter(function (s) { return s && s.completed !== false && s.score != null; });
      var chips = el("div", "or-contextchips");
      var chip = function (txt, on) {
        var c = el("span", "or-chip" + (on ? " or-chip-ok" : ""));
        c.textContent = (on ? "\u2713 " : "") + txt;
        return c;
      };
      if (p.gap) chips.appendChild(chip((p.gap.match_score || 0) + "% match", true));
      else chips.appendChild(chip("No gap analysis yet", false));
      chips.appendChild(chip(qCount ? qCount + " questions ready" : "No questions yet", qCount > 0));
      chips.appendChild(chip(completedPractice.length ? completedPractice.length + " practice done" : "Practice not started", completedPractice.length > 0));
      root.appendChild(chips);

      // One primary next action (not a wall of buttons). Pick the next
      // uncompleted step in Job -> Analysis -> Practice -> Readiness.
      // Carry the current job id to Defend (?job=) so the scenario + completed
      // practice attribute to THIS job (spec §10).
      var jobQ = (p.job && p.job.id) ? ("?job=" + encodeURIComponent(p.job.id)) : "";
      var nextHref, nextLabel, nextWhy;
      if (!p.gap) {
        nextHref = "Gap-Analysis/index.html"; nextLabel = "Check My Fit";
        nextWhy = "Compare your resume to this role to see your match and gaps.";
      } else if (!qCount) {
        nextHref = "Question-Bank/index.html"; nextLabel = "Prepare Practice Questions";
        nextWhy = "Generate role-specific questions from your job and gaps.";
      } else {
        nextHref = "Practice-Scenarios/index.html" + jobQ;
        nextLabel = completedPractice.length ? "Continue Practice" : "Practice Decision Defense";
        nextWhy = completedPractice.length
          ? "Keep defending decisions under follow-ups to raise readiness."
          : "Defend your decisions under pressure to raise Interview Readiness.";
      }
      // Prominent "Next recommended action" block (UI pass): a labeled, framed
      // panel with a one-line rationale + a single primary CTA. Same next-step
      // logic/targets; richer presentation so the one thing to do next is obvious.
      var nextWrap = el("div", "or-nextaction");
      nextWrap.appendChild(el("div", "or-nextaction-label", "Next recommended action"));
      var nextRow = el("div", "or-nextaction-row");
      var cta = el("a", "or-btn or-btn-primary or-cta-primary"); cta.href = base + nextHref; cta.textContent = nextLabel;
      nextRow.appendChild(cta);
      nextRow.appendChild(el("span", "or-nextaction-why", nextWhy));
      nextWrap.appendChild(nextRow);
      root.appendChild(nextWrap);

      renderScoreBlocks(p.gap, p.progress, (p.questions || []).length, cleanJobTitle(p.job), p.practice || []);

      // Secondary paths, de-emphasized (the ONE primary action is the CTA at
      // the top of the page). Quiet text links, not a wall of buttons.
      var more = el("div", "or-actions");
      more.style.marginTop = "0.4rem";
      more.innerHTML =
        '<a class="or-btn" href="' + base + 'Gap-Analysis/index.html">' + (p.gap ? "Re-check my fit" : "Check my fit") + '</a>' +
        '<a class="or-btn" href="' + base + 'Question-Bank/index.html">' + ((p.questions || []).length ? "Review questions" : "Prepare questions") + '</a>';
      root.appendChild(more);
    }

    // Shared score UI used by both live + cached renders.
    function renderScoreBlocks(gap, progress, questionCount, jobTitle, practice) {
      progress = progress || [];
      practice = practice || [];
      // Latest snapshot (progress rows come newest-first from the API).
      var latest = progress[0] || null;

      // Factor presence — distinguish "0 / low" from "not assessed yet".
      var hasGap = !!gap;
      var completedPractice = practice.filter(function (s) { return s && s.completed !== false && s.score != null; });
      var hasPractice = completedPractice.length > 0;

      var practiceAvg = latest ? (latest.avg_answer_score || 0) : 0;
      var completion = Math.min((latest && latest.questions_practiced) || 0, 10) * 10;
      // Respect a persisted overall of 0 — only fall back to the computed score
      // when there is genuinely no persisted value (null/undefined).
      var hasPersistedOverall = latest && latest.overall_readiness != null;
      var overall = hasPersistedOverall
        ? latest.overall_readiness
        : weightedOverall(gap, practiceAvg, completion);

      var sub = function (base) {
        if (!gap && !latest) return 0;
        var b = base || 0;
        return clampInt(practiceAvg ? 0.7 * b + 0.3 * practiceAvg : b, 0, 100);
      };
      var has = function (v) { return v != null; };
      var technical = latest && has(latest.technical_score) ? latest.technical_score : sub(gap && gap.technical_score);
      var behavioral = latest && has(latest.behavioral_score) ? latest.behavioral_score : sub(gap && gap.behavioral_score);
      var architecture = latest && has(latest.architecture_score) ? latest.architecture_score : sub(gap && gap.architecture_score);
      var domain = latest && has(latest.domain_score) ? latest.domain_score : sub(gap && gap.domain_score);

      // Header — Interview Readiness (the blended score).
      var band = overall >= 75 ? "or-good" : overall >= 50 ? "or-mid" : "or-weak";
      var head = el("div", "or-card");
      var hrow = el("div", "or-score-head");
      hrow.appendChild(el("div", "or-score-num " + band, overall + "%"));
      var lbl = "<strong>Interview readiness</strong><br><span class=\"or-muted\">";
      lbl += jobTitle ? "For: " + esc(jobTitle) + "</span>" : "A blended score</span>";
      hrow.appendChild(el("div", "or-score-label", lbl));
      head.appendChild(hrow);

      // Explanation: WHAT the blended score is based on, with honest "Not
      // assessed" states so a missing input never reads as a silent deduction.
      var ex = el("div", "or-readiness-factors");
      ex.appendChild(el("div", "or-field-label", "Based on"));
      var factor = function (label, present, detailTxt) {
        var mark = present ? "\u2713" : "\u2014";
        var cls = present ? "or-factor-on" : "or-factor-off";
        return el("div", "or-factor " + cls,
          '<span class="or-factor-mark">' + mark + '</span> <strong>' + esc(label) + '</strong>' +
          ' <span class="or-muted or-small">' + esc(detailTxt) + '</span>');
      };
      ex.appendChild(factor("Resume match", hasGap,
        hasGap ? (gap.match_score + "% \u2014 how your resume lines up with the job") : "Not assessed \u2014 run a gap analysis"));
      ex.appendChild(factor("Practice activity", hasPractice,
        hasPractice ? (completedPractice.length + " completed \u00b7 avg " + practiceAvg + "%") : "Practice: Not assessed"));
      ex.appendChild(factor("Preparation completion", (latest && (latest.questions_practiced || 0) > 0),
        (latest && (latest.questions_practiced || 0) > 0) ? (completion + "% of a 10-rep target") : "Preparation completion: Not assessed"));
      if (!hasPractice) {
        ex.appendChild(el("p", "or-muted or-small",
          "Practice hasn\u2019t been completed yet, so it isn\u2019t counting toward readiness. " +
          "<a href=\"" + base + "Practice-Scenarios/index.html\">Start practice</a> to raise this score."));
      }
      head.appendChild(ex);
      root.appendChild(head);

      // Resume Match vs Interview Readiness — stated side by side so the two
      // numbers aren't confusing (addresses "80% match but 40% readiness").
      var mm = el("div", "or-card");
      var mrow = el("div", "or-grid");
      mrow.appendChild(stat(hasGap ? gap.match_score + "%" : "\u2014", "Resume match"));
      mrow.appendChild(stat(overall + "%", "Interview readiness"));
      mm.appendChild(mrow);
      mm.appendChild(el("p", "or-muted or-small",
        "<strong>Resume match</strong> is how closely the evidence in your resume aligns with this job. " +
        "<strong>Interview readiness</strong> is a blended measure based on the preparation inputs currently available for this job. " +
        "Interview readiness can differ from resume match because it also reflects supported practice and preparation activity."));
      root.appendChild(mm);

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
      g.appendChild(stat(completedPractice.length, "Practice sessions"));
      g.appendChild(stat(progress.length, "Readiness snapshots"));
      root.appendChild(g);

      // Recent Practice — real persisted, job-scoped sessions (newest first).
      var rp = el("div", "or-card");
      rp.appendChild(el("h3", null, "Recent practice"));
      if (!practice.length) {
        rp.appendChild(el("p", "or-muted", "No completed practice yet."));
        rp.appendChild(el("a", "or-btn or-btn-primary", "Start practice")).href = base + "Practice-Scenarios/index.html";
      } else {
        var tbl = '<table class="or-practice-table"><thead><tr><th>Activity</th><th>Mode</th><th>Score</th><th>When</th></tr></thead><tbody>';
        practice.slice(0, 8).forEach(function (s) {
          var when = s.completed_at ? new Date(s.completed_at) : null;
          var whenTxt = (when && !isNaN(when.getTime())) ? when.toLocaleDateString() : "";
          tbl += "<tr><td>" + esc(activityLabel(s)) + "</td><td>" +
            esc(modeLabel(s.mode)) + "</td><td>" + (s.score != null ? esc(String(s.score)) + "%" : "\u2014") +
            "</td><td>" + esc(whenTxt) + "</td></tr>";
        });
        tbl += "</tbody></table>";
        rp.appendChild(el("div", null, tbl));
      }
      root.appendChild(rp);

      // Trend — only with >= 2 real snapshots; otherwise a truthful message.
      var tcard = el("div", "or-card");
      tcard.appendChild(el("div", "or-field-label", "Readiness trend"));
      if (progress.length > 1) {
        var trend = progress.slice().reverse().map(function (s) { return s.overall_readiness || 0; });
        tcard.appendChild(sparkline(trend));
      } else {
        tcard.appendChild(el("p", "or-muted or-small", "Complete more readiness activities to build your trend."));
      }
      root.appendChild(tcard);

      // Gaps recap (from the persisted gap result)
      var res = gap && gap.result ? gap.result : null;
      if (res && ((res.missingSkills || []).length || (res.missingKeywords || []).length)) {
        var gaps = el("div", "or-card");
        gaps.appendChild(el("h3", null, "Top skill gaps"));
        var list = (res.missingSkills || []).concat(res.missingKeywords || []).slice(0, 12);
        var wrap = el("div", "or-chips");
        list.forEach(function (x) { wrap.appendChild(el("span", "or-chip or-chip-warn", esc(x))); });
        gaps.appendChild(wrap);
        root.appendChild(gaps);
      }

      // Last Updated — the most recent of the persisted signals we have.
      var lastTs = null;
      if (latest && latest.recorded_at) lastTs = new Date(latest.recorded_at);
      else if (practice[0] && practice[0].completed_at) lastTs = new Date(practice[0].completed_at);
      else if (gap && gap.created_at) lastTs = new Date(gap.created_at);
      if (lastTs && !isNaN(lastTs.getTime())) {
        root.appendChild(el("p", "or-muted or-small", "Last updated " + lastTs.toLocaleString()));
      }
    }

    boot();
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch (e) {} }
})();
