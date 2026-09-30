/* My Jobs — the job-centered dashboard (spec §5/§9).
   Lists the signed-in user's saved job analyses, lets them reopen, resume prep,
   or delete. Talks to the OfferReady backend (/api/jobs) with the user's
   Supabase access token. Fails gracefully when not signed in or backend is
   unconfigured. Mounts on #jobs-app, survives navigation.instant. */
(function () {
  "use strict";

  var API_BASE = (typeof window !== "undefined" && window.OFFERREADY_API_BASE) || "";

  function init() {
    var app = document.getElementById("jobs-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";

    var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
    var base = (window.__md_scope && window.__md_scope.pathname ? window.__md_scope.pathname.replace(/[^/]*$/, "") : "/");

    if (!API_BASE) { renderNote("Saved jobs aren\u2019t enabled on this site yet."); return; }
    if (!window.OfferReadyAuth) { renderNote("Sign-in isn\u2019t available yet, so saved jobs can\u2019t load."); return; }

    boot();

    function boot() {
      window.OfferReadyAuth.getAccessToken().then(function (token) {
        if (!token) { renderSignedOut(); return; }
        loadJobs(token);
      }).catch(function () { renderSignedOut(); });
    }

    function authHeaders(token) {
      return { "Content-Type": "application/json", Authorization: "Bearer " + token };
    }

    function loadJobs(token) {
      renderLoading();
      fetch(API_BASE.replace(/\/$/, "") + "/api/jobs", { headers: authHeaders(token) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
        .then(function (res) {
          if (res.status === 401) { renderSignedOut(); return; }
          if (res.status !== 200 || !res.body || !res.body.ok) { renderNote("Couldn\u2019t load your jobs right now. Please try again."); return; }
          renderList(res.body.jobs || [], token);
        })
        .catch(function () { renderNote("Couldn\u2019t reach the server. Check your connection and try again."); });
    }

    function renderLoading() { app.innerHTML = ""; app.appendChild(el("p", "ip-ai-hint", "Loading your jobs\u2026")); }

    function renderNote(msg) { app.innerHTML = ""; app.appendChild(el("p", "ip-ai-hint", esc(msg))); }

    function renderSignedOut() {
      app.innerHTML = "";
      var c = el("div", "ip-card");
      c.appendChild(el("div", "ip-q", "Sign in to see your jobs"));
      c.appendChild(el("p", null, "My Jobs keeps each role you analyze \u2014 requirements, gaps, and prep progress \u2014 in one place."));
      var slot = el("div"); slot.id = "or-auth-slot"; c.appendChild(slot);
      app.appendChild(c);
      // Let auth.js render its form into the slot, then reload on sign-in.
      if (window.OfferReadyAuth && window.OfferReadyAuth.onChange) {
        window.OfferReadyAuth.onChange(function (session) { if (session) boot(); });
      }
    }

    function renderList(jobs, token) {
      app.innerHTML = "";
      var head = el("div", "or-jobs-head");
      head.appendChild(el("h2", null, "My Jobs"));
      var add = el("a", "ip-btn"); add.href = base + "Analyze/index.html"; add.textContent = "+ Analyze a new job";
      head.appendChild(add);
      app.appendChild(head);

      if (!jobs.length) {
        var empty = el("div", "ip-card");
        empty.appendChild(el("div", "ip-q", "No saved jobs yet"));
        empty.appendChild(el("p", null, "Analyze a job description, then save it here to track your preparation."));
        var go = el("a", "ip-btn"); go.href = base + "Analyze/index.html"; go.textContent = "Analyze My Job";
        empty.appendChild(go);
        app.appendChild(empty);
        return;
      }

      var grid = el("div", "or-jobs-grid");
      jobs.forEach(function (j) { grid.appendChild(card(j, token)); });
      app.appendChild(grid);
    }

    function card(j, token) {
      var c = el("div", "or-job-card");
      c.appendChild(el("h3", null, esc(j.title || "Untitled role")));
      var meta = [];
      if (j.company) meta.push(esc(j.company));
      if (j.seniority) meta.push(esc(j.seniority));
      if (meta.length) c.appendChild(el("div", "or-job-meta", meta.join(" \u00b7 ")));

      var stats = el("div", "or-job-stats");
      stats.appendChild(el("span", "ip-topic", esc(j.skills_count || 0) + " skills"));
      stats.appendChild(el("span", "ip-topic", esc(j.gaps_count || 0) + " gaps"));
      stats.appendChild(el("span", "ip-topic", "Prep " + esc(j.prep_progress || 0) + "%"));
      c.appendChild(stats);

      var when = j.created_at ? new Date(j.created_at) : null;
      if (when && !isNaN(when.getTime())) c.appendChild(el("div", "or-job-date", "Analyzed " + when.toLocaleDateString()));

      var row = el("div", "or-job-actions");
      var open = el("button", "ip-btn"); open.type = "button"; open.textContent = "Open";
      open.addEventListener("click", function () { openJob(j.id, token); });
      var del = el("button", "ip-btn ip-ghost"); del.type = "button"; del.textContent = "Delete";
      del.addEventListener("click", function () { confirmDelete(j, c, token); });
      row.append(open, del);
      c.appendChild(row);
      return c;
    }

    function confirmDelete(j, cardEl, token) {
      if (!window.confirm("Delete \u201c" + (j.title || "this job") + "\u201d? This can\u2019t be undone.")) return;
      fetch(API_BASE.replace(/\/$/, "") + "/api/jobs/" + encodeURIComponent(j.id), {
        method: "DELETE", headers: authHeaders(token),
      }).then(function (r) {
        if (r.ok) { cardEl.remove(); if (!app.querySelector(".or-job-card")) boot(); }
        else window.alert("Couldn\u2019t delete that job. Please try again.");
      }).catch(function () { window.alert("Couldn\u2019t reach the server. Please try again."); });
    }

    function openJob(id, token) {
      renderLoading();
      // Remember which job is active so Gap Analysis / Questions / Dashboard
      // all operate on the same job.
      if (window.OfferReadyReadiness && window.OfferReadyReadiness.setActiveJob) {
        window.OfferReadyReadiness.setActiveJob(id);
      }
      fetch(API_BASE.replace(/\/$/, "") + "/api/jobs/" + encodeURIComponent(id), { headers: authHeaders(token) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
        .then(function (res) {
          if (res.status !== 200 || !res.body || !res.body.job) { renderNote("Couldn\u2019t open that job."); return; }
          renderJob(res.body, token);
        })
        .catch(function () { renderNote("Couldn\u2019t reach the server."); });
    }

    // Render the FULL restored job state from the DB: analysis + persisted gap
    // (match score), generated questions, and readiness/progress. This is what
    // makes a job resumable on any device.
    function renderJob(payload, token) {
      var job = payload.job || payload;   // tolerate old {job} shape
      var gap = payload.gap || null;
      var questions = payload.questions || [];
      var progress = payload.progress || [];

      app.innerHTML = "";
      var backBtn = el("button", "ip-btn ip-ghost"); backBtn.type = "button"; backBtn.textContent = "\u2190 Back to My Jobs";
      backBtn.addEventListener("click", function () { loadJobs(token); });
      app.appendChild(backBtn);

      var a = job.analysis || {};
      app.appendChild(el("h2", null, esc(job.title || a.seniority || "Saved job")));
      if (a.roleSummary) app.appendChild(el("p", null, esc(a.roleSummary)));

      // Restored readiness snapshot (from persisted gap + progress). Use the
      // SINGLE shared readiness formula (window.OfferReadyReadiness.weightedOverall)
      // so a job's score here is IDENTICAL to the Dashboard — no duplicate math.
      var latest = progress[0] || null;
      var practiceAvg = latest ? (latest.avg_answer_score || 0) : 0;
      var completion = Math.min((latest && latest.questions_practiced) || 0, 10) * 10;
      var overall = latest && latest.overall_readiness
        ? latest.overall_readiness
        : (gap && window.OfferReadyReadiness && window.OfferReadyReadiness.weightedOverall
            ? window.OfferReadyReadiness.weightedOverall(gap, practiceAvg, completion)
            : null);
      var statsGrid = el("div", "or-grid");
      if (overall != null) statsGrid.appendChild(stat(overall + "%", "Readiness"));
      if (gap) statsGrid.appendChild(stat((gap.match_score || 0) + "%", "Resume match"));
      statsGrid.appendChild(stat(questions.length, "Questions ready"));
      statsGrid.appendChild(stat((job.gaps_count || (a.potentialGaps || []).length || 0), "Gaps"));
      app.appendChild(statsGrid);

      // Continue-where-you-left-off actions (job stays active via setActiveJob).
      var cont = el("div", "or-actions");
      var gapBtn = el("a", "ip-btn"); gapBtn.href = base + "Gap-Analysis/index.html"; gapBtn.textContent = gap ? "Re-run gap analysis" : "Run gap analysis";
      var qBtn = el("a", "ip-btn"); qBtn.href = base + "Question-Bank/index.html"; qBtn.textContent = questions.length ? "Review / regenerate questions" : "Generate questions";
      var dashBtn = el("a", "ip-btn ip-ghost"); dashBtn.href = base + "Dashboard/index.html"; dashBtn.textContent = "Readiness dashboard";
      cont.append(gapBtn, qBtn, dashBtn);
      app.appendChild(cont);

      // Persisted gap detail.
      if (gap && gap.result) {
        var gr = gap.result;
        if ((gr.missingSkills || []).concat(gr.missingKeywords || []).length) {
          app.appendChild(el("h3", null, "Gaps to close"));
          var gwrap = el("div", "or-chips");
          (gr.missingSkills || []).concat(gr.missingKeywords || []).slice(0, 14).forEach(function (x) {
            gwrap.appendChild(el("span", "or-chip or-chip-warn", esc(x)));
          });
          app.appendChild(gwrap);
        }
      }

      if ((a.potentialGaps || []).length) {
        app.appendChild(el("h3", null, "Priority gaps"));
        var ul = el("ul");
        a.potentialGaps.forEach(function (g) { ul.appendChild(el("li", null, esc(g.requirement))); });
        app.appendChild(ul);
      }

      if ((a.preparationPlan || []).length) {
        app.appendChild(el("h3", null, "Preparation plan"));
        var w = el("div");
        a.preparationPlan.forEach(function (p) {
          var pc = el("div", "ip-model");
          pc.appendChild(el("h4", null, "Priority " + esc(p.priority) + " \u2014 " + esc(p.title)));
          if (p.why) pc.appendChild(el("p", null, esc(p.why)));
          if (p.resource && p.resource.path) {
            var link = el("a", "or-reslink"); link.href = base + p.resource.path; link.textContent = "\u2192 " + p.resource.label;
            pc.appendChild(link);
          }
          w.appendChild(pc);
        });
        app.appendChild(w);
      }

      app.appendChild(el("p", "ip-ai-hint", "Preparation guidance only \u2014 not a prediction of interview or offer outcomes."));
    }

    // Small stat tile (matches the dashboard's or-stat).
    function stat(num, label) {
      return el("div", "or-stat", '<div class="or-stat-num">' + esc(String(num)) + '</div><div class="or-stat-label">' + esc(label) + "</div>");
    }
  }

  // Never leave the user stuck on "Loading your jobs…": on any init error,
  // show a clear reload prompt instead of an indefinite loading state.
  function safeInit() {
    try { init(); }
    catch (e) {
      var app = document.getElementById("jobs-app");
      if (app && !app.dataset.mounted) {
        app.dataset.mounted = "1";
        app.innerHTML =
          '<div class="ip-card"><div class="ip-q">Couldn\u2019t load My Jobs</div>' +
          '<p>Please reload the page to try again.</p>' +
          '<button class="ip-btn" type="button" onclick="location.reload()">Reload</button></div>';
      }
    }
  }

  if (document.readyState !== "loading") safeInit();
  else document.addEventListener("DOMContentLoaded", safeInit);
  if (window.document$) { try { window.document$.subscribe(safeInit); } catch (e) {} }

  // Belt-and-suspenders against a stuck "Loading your jobs…" placeholder.
  function sweep() {
    var app = document.getElementById("jobs-app");
    if (app && !app.dataset.mounted) safeInit();
  }
  setTimeout(sweep, 800);
  setTimeout(sweep, 2500);
})();
