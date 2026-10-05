/* OfferReady — JD-driven Interview Question Generator.
 * ---------------------------------------------------------------------------
 * Mounts on #questions-app. Paste a job description -> POST /api/ai
 * { action: "generate_questions" } -> render a categorized question set:
 *   Technical (10) · Behavioral (10) · System Design (5) · Leadership (5)
 * each with an Easy / Medium / Hard difficulty badge.
 *
 * Job-rooted + persistent: the user picks a saved job and the generated set is
 * saved server-side to that job's `questions` rows (source of truth), so it's
 * available on any device. Grouped by category with difficulty badges.
 * Requires sign-in (the endpoint enforces it).
 */

(function () {
  "use strict";

  var API = (typeof window !== "undefined" && window.OFFERREADY_API_BASE) || "";

  var CATEGORY_LABEL = {
    technical: "Technical",
    behavioral: "Behavioral",
    system_design: "System Design",
    leadership: "Leadership",
  };
  var CATEGORY_ORDER = ["technical", "behavioral", "system_design", "leadership"];

  function init() {
    var app = document.getElementById("questions-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";

    var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };

    var state = { jd: "", role: "", jobId: "", jobs: [] };
    var base = (window.__md_scope && window.__md_scope.pathname ? window.__md_scope.pathname.replace(/[^/]*$/, "") : "/");

    // Load the user's jobs so generated questions attach to one (job-rooted,
    // persisted server-side). Falls back to a plain form if signed out.
    // If the preselected job already has a saved set, we RESTORE it first
    // (regenerate is then an explicit choice) rather than forcing a new run.
    loadJobsThen(function () { restoreOrForm(); });

    function loadJobsThen(cb) {
      if (!API || !window.OfferReadyAuth) { cb(); return; }
      window.OfferReadyAuth.getAccessToken().then(function (tok) {
        if (!tok) { cb(); return; }
        fetch(API + "/api/jobs", { headers: { Authorization: "Bearer " + tok } })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (j) {
            state.jobs = (j && j.jobs) || [];
            var active = window.OfferReadyReadiness && window.OfferReadyReadiness.getActiveJob
              ? window.OfferReadyReadiness.getActiveJob() : "";
            if (active && state.jobs.some(function (x) { return x.id === active; })) state.jobId = active;
            cb();
          })
          .catch(function () { cb(); });
      }).catch(function () { cb(); });
    }

    // Restore any saved question set for the selected job before offering a
    // (re)generation. The DB is the source of truth: GET /api/jobs/:id returns
    // the job's existing `questions`. If a set exists, show it with a
    // Regenerate option; otherwise fall back to the generate form.
    function restoreOrForm() {
      if (!state.jobId || !API || !window.OfferReadyAuth) { renderForm(); return; }
      app.innerHTML = "";
      var loading = el("div", "or-card"); loading.appendChild(el("p", "or-muted", "Loading this job\u2019s saved questions\u2026"));
      app.appendChild(loading);
      window.OfferReadyAuth.getAccessToken().then(function (tok) {
        if (!tok) { renderForm(); return; }
        fetch(API + "/api/jobs/" + encodeURIComponent(state.jobId), { headers: { Authorization: "Bearer " + tok } })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (j) {
            var existing = (j && Array.isArray(j.questions)) ? j.questions : [];
            if (existing.length) renderRestored(existing);
            else renderForm();
          })
          .catch(function () { renderForm(); });
      }).catch(function () { renderForm(); });
    }

    function activeJobTitle() {
      var j = state.jobs.filter(function (x) { return x.id === state.jobId; })[0];
      return j ? (j.title || "Untitled role") : "";
    }
    function currentJobBanner() {
      var banner = el("div", "or-jobbanner");
      var title = activeJobTitle();
      if (title) {
        banner.innerHTML = '<span class="or-jobbanner-label">Current job</span> <strong>' + esc(title) + '</strong>';
      } else if (state.jobs.length) {
        banner.innerHTML = '<span class="or-jobbanner-label">No active job selected</span> \u2014 pick one below.';
      } else {
        banner.innerHTML = '<span class="or-jobbanner-label">No active job selected</span> ' +
          '<a class="or-btn or-btn-small" href="' + base + 'Analyze/index.html">Choose a job</a>';
      }
      return banner;
    }

    function renderForm(note) {
      app.innerHTML = "";
      var card = el("div", "or-card");
      card.appendChild(currentJobBanner());
      card.appendChild(el("h2", null, "Practice Questions"));
      card.appendChild(el("p", "or-muted", "Prepare role-specific interview questions based on the current job and its identified gaps \u2014 saved to that job so they're on every device."));
      if (note) card.appendChild(el("p", "or-error", esc(note)));

      if (state.jobs.length) {
        card.appendChild(el("label", "or-field-label", "Which job?"));
        var sel = el("select", "or-input");
        var ph = document.createElement("option"); ph.value = ""; ph.textContent = "\u2014 Select a saved job \u2014"; sel.appendChild(ph);
        state.jobs.forEach(function (j) {
          var o = document.createElement("option"); o.value = j.id;
          o.textContent = j.title || "Untitled role"; if (j.id === state.jobId) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener("change", function () {
          state.jobId = sel.value;
          var job = state.jobs.filter(function (x) { return x.id === state.jobId; })[0];
          if (job) {
            state.role = job.title || state.role;
            if (job.job_description) state.jd = job.job_description;
            else if (job.analysis && job.analysis.roleSummary) state.jd = job.analysis.roleSummary;
          }
          // Picking a job restores its saved set first (if any); regenerate
          // stays an explicit action.
          if (state.jobId) restoreOrForm(); else renderForm();
        });
        card.appendChild(sel);
        card.appendChild(el("p", "or-muted or-small", "No job here yet? <a href=\"" + base + "Analyze/index.html\">Analyze &amp; save a job</a> first."));
      }

      var role = el("input", "or-input"); role.type = "text"; role.placeholder = "Target role (optional)"; role.value = state.role || "";
      card.appendChild(el("label", "or-field-label", "Target role")); card.appendChild(role);

      var jd = el("textarea", "or-input or-textarea"); jd.rows = 9; jd.placeholder = "Paste the full job description here\u2026"; jd.value = state.jd || "";
      card.appendChild(el("label", "or-field-label", "Job description")); card.appendChild(jd);

      var go = el("button", "or-btn or-btn-primary", "Prepare Practice Questions");
      go.addEventListener("click", function () {
        state.role = role.value.trim(); state.jd = jd.value.trim();
        submit();
      });
      card.appendChild(go);
      app.appendChild(card);
    }

    function submit() {
      if (state.jd.length < 30) { renderForm("Please paste a fuller job description first (or pick a saved job)."); return; }

      app.innerHTML = "";
      var loading = el("div", "or-card"); loading.appendChild(el("p", "or-muted", "Generating your question set\u2026"));
      app.appendChild(loading);

      resolveToken(function (headers) {
        fetch(API + "/api/ai", {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, headers),
          body: JSON.stringify({
            action: "generate_questions",
            job_id: state.jobId || null,          // attach + persist to the selected job
            jobTitle: state.role, targetRole: state.role, jobDescription: state.jd,
          }),
        }).then(function (r) {
          return r.json().then(function (d) { return { status: r.status, body: d }; });
        }).then(function (res) {
          if (res.status === 200 && res.body && res.body.questions) {
            // DB is source of truth; res.body.saved reflects server persistence
            // when a job was selected. No localStorage cache-as-authority.
            renderResult(res.body.questions, res.body.counts, res.body.saved);
          } else if (res.status === 401) {
            renderForm("Sign in (top-right Account) to generate questions \u2014 then try again.");
          } else if (res.status === 503) {
            renderForm("Question generation isn't enabled on this deployment yet.");
          } else {
            renderForm((res.body && res.body.error) || "Couldn't generate the question set. Please try again.");
          }
        }).catch(function () {
          renderForm("Couldn't reach the generator. Check your connection and try again.");
        });
      });
    }

    function diffBadge(d) {
      var cls = d === "hard" ? "or-diff-hard" : d === "easy" ? "or-diff-easy" : "or-diff-med";
      return '<span class="or-diff ' + cls + '">' + esc(d || "medium") + "</span>";
    }

    // Shared: render the categorized question cards + the Practice/Dashboard
    // footer. Used by both the freshly-generated and the restored views.
    function renderQuestionCards(questions) {
      var byCat = {};
      questions.forEach(function (q) { (byCat[q.category] = byCat[q.category] || []).push(q); });

      CATEGORY_ORDER.forEach(function (cat) {
        var list = byCat[cat];
        if (!list || !list.length) return;
        var card = el("div", "or-card");
        card.appendChild(el("h3", null, esc(CATEGORY_LABEL[cat] || cat) + " <span class=\"or-muted or-small\">(" + list.length + ")</span>"));
        var ol = el("ol", "or-qlist");
        list.forEach(function (q) {
          var li = el("li", "or-qitem");
          li.innerHTML = diffBadge(q.difficulty) + " " + esc(q.prompt);
          ol.appendChild(li);
        });
        card.appendChild(ol);
        app.appendChild(card);
      });

      var foot = el("div", "or-card or-actions");
      foot.innerHTML =
        '<a class="or-btn or-btn-primary" href="../Practice-Scenarios/index.html">\uD83D\uDDE1\ufe0f Practice & defend answers</a>' +
        '<a class="or-btn" href="../Dashboard/index.html">\uD83D\uDCCA Readiness dashboard</a>';
      app.appendChild(foot);
    }

    // Format the "Last generated" timestamp from the saved rows. All rows in a
    // set share created_at (saveQuestions replaces the whole set), so the first
    // row's created_at is the generation time. Degrades gracefully if absent.
    function lastGenerated(questions) {
      var ts = null;
      questions.forEach(function (q) { if (q && q.created_at && (!ts || q.created_at > ts)) ts = q.created_at; });
      if (!ts) return "";
      try {
        var d = new Date(ts);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      } catch (e) { return ""; }
    }

    // Restored view — this job already has a saved question set. The saved set
    // is shown first; the primary action is Continue Practice. Regenerate is a
    // secondary action that REPLACES the set, so it requires explicit
    // confirmation (never a silent overwrite).
    function restartGeneration() {
      var job = state.jobs.filter(function (x) { return x.id === state.jobId; })[0];
      if (job) {
        state.role = job.title || state.role;
        if (job.job_description) state.jd = job.job_description;
        else if (job.analysis && job.analysis.roleSummary) state.jd = job.analysis.roleSummary;
      }
      renderForm("Regenerating replaces your saved questions for this job. Review the job description, then generate to confirm the replacement.");
    }

    function renderRestored(questions) {
      app.innerHTML = "";
      var head = el("div", "or-card");
      head.appendChild(currentJobBanner());
      head.appendChild(el("h2", null, "Your practice questions are ready"));
      head.appendChild(el("p", "or-qcount", questions.length + " saved questions for this job"));
      var when = lastGenerated(questions);
      if (when) head.appendChild(el("p", "or-muted or-small", "Last generated: " + esc(when)));
      head.appendChild(el("p", "or-muted or-small", "Continue preparing with the saved questions for this job \u2014 available on any device."));

      var actions = el("div", "or-actions");
      var cont = el("a", "or-btn or-btn-primary", "Continue Practice");
      cont.href = "../Practice-Scenarios/index.html";
      actions.appendChild(cont);
      var regen = el("button", "or-btn", "Regenerate Questions");
      regen.addEventListener("click", function () {
        var ok = window.confirm(
          "Regenerating will replace the current saved question set for this job.\n\nThis can\u2019t be undone.");
        if (ok) restartGeneration();
      });
      actions.appendChild(regen);
      head.appendChild(actions);
      app.appendChild(head);

      renderQuestionCards(questions);
    }

    function renderResult(questions, counts, saved) {
      app.innerHTML = "";
      var head = el("div", "or-card");
      head.appendChild(el("h2", null, "Your interview question set"));
      var total = questions.length;
      var savedNote = (saved && state.jobId) ? " \u00b7 \u2713 saved to this job" : (state.jobId ? "" : " \u00b7 not saved (pick a saved job to keep it)");
      head.appendChild(el("p", "or-muted", total + " questions generated" + savedNote + " \u00b7 answer them out loud, then practice defending your decisions."));
      var again = el("button", "or-btn", "Generate for another job");
      again.addEventListener("click", function () { renderForm(); });
      head.appendChild(again);
      app.appendChild(head);

      renderQuestionCards(questions);
    }

    function resolveToken(cb) {
      if (window.OfferReadyAuth && window.OfferReadyAuth.getAccessToken) {
        window.OfferReadyAuth.getAccessToken().then(function (tok) {
          cb(tok ? { Authorization: "Bearer " + tok } : {});
        }).catch(function () { cb({}); });
      } else { cb({}); }
    }
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch (e) {} }
})();
