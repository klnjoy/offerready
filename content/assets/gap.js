/* OfferReady — Resume ↔ JD Gap Analysis.
 * ---------------------------------------------------------------------------
 * Mounts on #gap-app. Flow:
 *   paste JD  ->  upload resume (PDF/DOCX/TXT, extracted client-side)  ->
 *   POST /api/ai { action: "gap_analysis" }  ->  render match score, strengths,
 *   missing skills / keywords / experience, and 4 readiness bars.
 *
 * Job-rooted + persistent: the user picks a saved job; the gap result is saved
 * server-side to that job's gap_analysis row (source of truth) and shows on the
 * Dashboard on any device. The distilled RESULT (scores + gaps) is persisted;
 * the raw resume text is NEVER stored (parsed in-browser, sent transiently for
 * the single analysis call).
 *
 * All client-side UI. Degrades gracefully when the backend/sign-in is unavailable.
 */

(function () {
  "use strict";

  var API = (typeof window !== "undefined" && window.OFFERREADY_API_BASE) || "";

  function init() {
    var app = document.getElementById("gap-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";

    var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
    var baseHref = function () { return (window.__md_scope && window.__md_scope.pathname ? window.__md_scope.pathname.replace(/[^/]*$/, "") : "/"); };

    var state = { jd: "", role: "", resumeText: "", resumeMeta: null, jobId: "", jobs: [] };

    // Load the user's jobs first so gap analysis can attach to one (job-rooted,
    // persisted). If not signed in / no backend, fall back to a plain form.
    loadJobsThen(renderForm);

    function loadJobsThen(cb) {
      if (!API || !window.OfferReadyAuth) { cb(); return; }
      window.OfferReadyAuth.getAccessToken().then(function (tok) {
        if (!tok) { cb(); return; }
        fetch(API + "/api/jobs", { headers: { Authorization: "Bearer " + tok } })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (j) {
            state.jobs = (j && j.jobs) || [];
            // Preselect the active job (from the dashboard / a just-saved job) if
            // present AND still owned by the user. If the pointer is stale
            // (job deleted, different account), clear it so we don't preselect a
            // phantom.
            var active = window.OfferReadyReadiness && window.OfferReadyReadiness.getActiveJob
              ? window.OfferReadyReadiness.getActiveJob() : "";
            if (active && state.jobs.some(function (x) { return x.id === active; })) {
              state.jobId = active;
              // Auto-populate Target Role + JD from the preselected job so Check
              // My Fit opens ready to run (only the resume is still required).
              // Without this, preselect set jobId but left the role/JD fields
              // blank until the user manually re-picked the same job.
              prefillFromJob(state.jobId);
            } else if (active && window.OfferReadyReadiness && window.OfferReadyReadiness.clearActiveJob) {
              window.OfferReadyReadiness.clearActiveJob();
            }
            cb();
          })
          .catch(function () { cb(); });
      }).catch(function () { cb(); });
    }

    function activeJobTitle() {
      var j = state.jobs.filter(function (x) { return x.id === state.jobId; })[0];
      return j ? (j.title || "Untitled role") : "";
    }
    // Populate Target Role + JD into state from a saved job. Used both when the
    // active job is preselected on load AND when the user picks one from the
    // dropdown, so the two paths stay identical.
    function prefillFromJob(jobId) {
      var job = state.jobs.filter(function (x) { return x.id === jobId; })[0];
      if (!job) return;
      state.role = job.title || state.role;
      if (job.job_description) state.jd = job.job_description;
      else if (job.analysis && job.analysis.roleSummary) state.jd = job.analysis.roleSummary;
    }
    function currentJobBanner() {
      // "Current Job: <title>" header so the active job visibly follows the
      // user. If none is selected, prompt to choose one.
      var banner = el("div", "or-jobbanner");
      var title = activeJobTitle();
      if (title) {
        banner.innerHTML = '<span class="or-jobbanner-label">Current job</span> <strong>' + esc(title) + '</strong>';
      } else if (state.jobs.length) {
        banner.innerHTML = '<span class="or-jobbanner-label">No active job selected</span> \u2014 pick one below.';
      } else {
        banner.innerHTML = '<span class="or-jobbanner-label">No active job selected</span> ' +
          '<a class="or-btn or-btn-small" href="' + baseHref() + 'Analyze/index.html">Choose a job</a>';
      }
      return banner;
    }

    function renderForm(note) {
      app.innerHTML = "";
      var card = el("div", "or-card");
      card.appendChild(currentJobBanner());
      card.appendChild(el("h2", null, "Resume \u2194 Job Gap Analysis"));
      card.appendChild(el("p", "or-muted", "Compare your resume against a saved job. We show your match score, strengths, and exactly what's missing \u2014 and save the result to that job so it's on every device. Your resume is read in your browser; the file is never uploaded or stored."));

      // Persistent inline error slot. Validation errors update THIS element in
      // place — we never re-render the whole form on an error (that used to wipe
      // the selected resume file + JD text the user already entered).
      var err = el("p", "or-error");
      err.style.display = note ? "block" : "none";
      if (note) err.textContent = note;
      card.appendChild(err);

      // Job selector — gap analysis is job-rooted. If the user has jobs, they
      // pick one (and the JD prefills from it); otherwise they can still paste a
      // JD, but it won't be saved until they analyze/save a job first.
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
          prefillFromJob(state.jobId);
          renderForm();
        });
        card.appendChild(sel);
        card.appendChild(el("p", "or-muted or-small", "Pick a job to auto-fill its description below, or paste a job description manually. <a href=\"" + baseHref() + "Analyze/index.html\">Analyze &amp; save a new job</a>."));
      } else {
        // No saved jobs yet: gap analysis still works by pasting a JD, but the
        // result won't attach to a job until one is saved. Make that explicit so
        // the user isn't stuck expecting a dropdown that isn't here.
        card.appendChild(el("p", "or-muted or-small",
          "No saved jobs yet. Paste a job description below to run a one-off gap analysis, or <a href=\"" + baseHref() + "Analyze/index.html\">analyze &amp; save a job</a> first so the result is stored and tracked."));
      }

      // Role (optional) + JD
      var role = el("input", "or-input"); role.type = "text"; role.placeholder = "Target role (optional) \u2014 e.g. Senior Snowflake Architect";
      role.value = state.role || "";
      card.appendChild(el("label", "or-field-label", "Target role"));
      card.appendChild(role);

      var jd = el("textarea", "or-input or-textarea"); jd.rows = 9; jd.placeholder = "Paste the full job description here\u2026 (required \u2014 gap analysis compares your resume against it)";
      jd.value = state.jd || "";
      card.appendChild(el("label", "or-field-label", "Job description (required)"));
      card.appendChild(jd);

      // Resume upload
      card.appendChild(el("label", "or-field-label", "Your resume (PDF, DOCX, or TXT)"));
      var fileRow = el("div", "or-filerow");
      var file = el("input"); file.type = "file"; file.accept = ".pdf,.docx,.doc,.txt,application/pdf";
      file.className = "or-file";
      var fileStatus = el("span", "or-muted", "No file selected.");
      // Reflect an already-loaded resume so it visibly survives any re-render.
      if (state.resumeMeta) {
        fileStatus.innerHTML = "\u2713 " + esc(state.resumeMeta.fileName) + " \u00b7 " + state.resumeMeta.chars + " chars read (still loaded)";
      }
      fileRow.appendChild(file); fileRow.appendChild(fileStatus);
      card.appendChild(fileRow);
      card.appendChild(el("p", "or-muted or-small", "Or skip the file and paste your resume text below."));
      var resumeTa = el("textarea", "or-input or-textarea"); resumeTa.rows = 6; resumeTa.placeholder = "\u2026or paste your resume text here.";
      resumeTa.value = state.resumeText && !state.resumeMeta ? state.resumeText : "";
      card.appendChild(resumeTa);

      file.addEventListener("change", function () {
        var f = file.files && file.files[0];
        if (!f) return;
        if (!window.OfferReadyResume) { fileStatus.textContent = "Resume reader unavailable."; return; }
        fileStatus.textContent = "Reading " + f.name + "\u2026";
        window.OfferReadyResume.extract(f).then(function (res) {
          state.resumeText = res.text; state.resumeMeta = res.meta;
          fileStatus.innerHTML = "\u2713 " + esc(res.meta.fileName) + " \u00b7 " + res.meta.chars + " chars read";
          resumeTa.value = ""; resumeTa.placeholder = "Resume loaded from file. (Paste here only to override.)";
        }).catch(function (e) {
          state.resumeText = ""; state.resumeMeta = null;
          fileStatus.textContent = (e && e.message) || "Couldn't read that file.";
        });
      });

      var go = el("button", "or-btn or-btn-primary", "Analyze gap");
      go.addEventListener("click", function () {
        // Sync current field values into state (so nothing is read from a
        // stale render), then validate INLINE without rebuilding the form.
        state.role = role.value.trim();
        state.jd = jd.value.trim();
        // File text wins; else use pasted resume text.
        if (!state.resumeMeta) state.resumeText = resumeTa.value.trim();

        function showErr(msg) {
          err.textContent = msg; err.style.display = "block";
          try { err.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
        }
        if (state.jd.length < 30) { showErr("Please paste a fuller job description first (or pick a saved job above to fill it in)."); return; }
        if ((state.resumeText || "").length < 40) { showErr("Add your resume \u2014 upload a file or paste the text \u2014 so we can compare."); return; }
        err.style.display = "none";
        submit();
      });
      card.appendChild(go);
      app.appendChild(card);
    }

    function submit() {
      app.innerHTML = "";
      var loading = el("div", "or-card"); loading.appendChild(el("p", "or-muted", "Comparing your resume against the job\u2026"));
      app.appendChild(loading);

      resolveToken(function (headers) {
        fetch(API + "/api/ai", {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, headers),
          body: JSON.stringify({
            action: "gap_analysis",
            job_id: state.jobId || null,            // attach to the selected job (persist server-side)
            jobTitle: state.role, targetRole: state.role,
            jobDescription: state.jd, resumeText: state.resumeText,
          }),
        }).then(function (r) {
          return r.json().then(function (d) { return { status: r.status, body: d }; });
        }).then(function (res) {
          if (res.status === 200 && res.body && res.body.result) {
            // The DB is the source of truth. When a job was selected the result
            // is already persisted server-side (res.body.saved); we do NOT write
            // it to localStorage as an authority.
            renderResult(res.body.result, res.body.saved);
          } else if (res.status === 401) {
            renderForm("Sign in (top-right Account) to run gap analysis \u2014 then try again.");
          } else if (res.status === 503) {
            renderForm("Gap analysis isn't enabled on this deployment yet.");
          } else {
            renderForm((res.body && res.body.error) || "Couldn't complete the gap analysis. Please try again.");
          }
        }).catch(function () {
          renderForm("Couldn't reach the analysis service. Check your connection and try again.");
        });
      });
    }

    function bar(label, pct) {
      var band = pct >= 75 ? "or-good" : pct >= 50 ? "or-mid" : "or-weak";
      var row = el("div", "or-bar-row");
      row.appendChild(el("div", "or-bar-label", esc(label)));
      var track = el("div", "or-bar-track");
      var fill = el("div", "or-bar-fill " + band); fill.style.width = Math.max(3, pct) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("div", "or-bar-pct", pct + "%"));
      return row;
    }

    function chips(title, items, cls) {
      if (!(items || []).length) return null;
      var wrap = el("div", "or-chips-block");
      wrap.appendChild(el("div", "or-field-label", title));
      var chipwrap = el("div", "or-chips");
      items.forEach(function (x) { chipwrap.appendChild(el("span", "or-chip " + (cls || ""), esc(x))); });
      wrap.appendChild(chipwrap);
      return wrap;
    }

    function renderResult(r, saved) {
      app.innerHTML = "";
      var top = el("div", "or-card");
      var score = r.matchScore || 0;
      var band = score >= 75 ? "or-good" : score >= 50 ? "or-mid" : "or-weak";
      var head = el("div", "or-score-head");
      head.appendChild(el("div", "or-score-num " + band, score + "%"));
      head.appendChild(el("div", "or-score-label", "<strong>Resume match</strong><br><span class=\"or-muted\">" + esc(r.summary || "") + "</span>"));
      top.appendChild(head);
      app.appendChild(top);

      // Match-by-dimension bars. These show resume-to-job match per area; the
      // blended Interview Readiness score lives on the Dashboard.
      var bars = el("div", "or-card");
      bars.appendChild(el("h3", null, "Match by area"));
      bars.appendChild(bar("Technical", r.technicalScore || 0));
      bars.appendChild(bar("Behavioral", r.behavioralScore || 0));
      bars.appendChild(bar("Architecture", r.architectureScore || 0));
      bars.appendChild(bar("Domain", r.domainScore || 0));
      app.appendChild(bars);

      // Evidence found + evidence not found in the resume. Careful wording: a
      // "not found" item means the resume didn't show it — NOT that the
      // candidate lacks the ability.
      var detail = el("div", "or-card");
      var s = chips("\u2713 Evidence found in your resume", r.strengths, "or-chip-ok"); if (s) detail.appendChild(s);
      var ms = chips("\u26a0 Skills not found in your resume", r.missingSkills, "or-chip-warn"); if (ms) detail.appendChild(ms);
      var mk = chips("\u26a0 Keywords not found in your resume", r.missingKeywords, "or-chip-warn"); if (mk) detail.appendChild(mk);
      var me = chips("\u26a0 Experience not evidenced in your resume", r.missingExperience, "or-chip-warn"); if (me) detail.appendChild(me);
      detail.appendChild(el("p", "or-muted or-small", "\u201cNot found\u201d means this wasn\u2019t shown in your uploaded resume \u2014 it isn\u2019t a judgment of your ability. Treat these as recommended preparation areas."));
      app.appendChild(detail);

      // Persistence status — the DB is the source of truth.
      if (state.jobId && saved) {
        app.appendChild(el("div", "or-card", '<p class="or-muted">\u2713 Saved to this job. It\u2019s on your <a href="../Dashboard/index.html">dashboard</a> and any device you sign in from.</p>'));
      } else if (!state.jobId) {
        app.appendChild(el("div", "or-card", '<p class="or-muted">This result isn\u2019t saved yet \u2014 <a href="../Analyze/index.html">analyze &amp; save a job</a>, then re-run gap analysis against it to keep it.</p>'));
      }

      // Next recommended step — guide the user into Practice instead of making
      // them discover it. The active job is already set, so these destinations
      // operate on the same job (no re-selection).
      if (saved && state.jobId) {
        var focus = el("div", "or-card or-next");
        focus.appendChild(el("div", "or-field-label", "Your preparation focus"));
        focus.appendChild(el("p", "or-muted or-small", "Use the gaps identified for this job to focus your interview preparation. Your job stays selected \u2014 no need to pick it again."));

        focus.appendChild(el("div", "or-field-label", "Recommended next step"));
        var nrow = el("div", "or-actions");
        nrow.innerHTML =
          '<a class="or-btn or-btn-primary" href="' + baseHref() + 'Question-Bank/index.html">Prepare Practice Questions</a>' +
          '<a class="or-btn" href="' + baseHref() + 'Practice-Scenarios/index.html">Practice Decision Defense</a>';
        focus.appendChild(nrow);
        focus.appendChild(el("p", "or-muted or-small",
          "<strong>Prepare Practice Questions</strong> creates role-specific questions from this job and your identified gaps. " +
          "<strong>Practice Decision Defense</strong> practices explaining tradeoffs, alternatives, cost, scale, and failure modes."));
        app.appendChild(focus);
      }

      // Actions
      var actions = el("div", "or-card or-actions");
      var again = el("button", "or-btn", "Run another"); again.addEventListener("click", function () { renderForm(); });
      actions.appendChild(again);
      var dash = el("a", "or-btn or-btn-primary"); dash.textContent = "See readiness dashboard";
      dash.href = "../Dashboard/index.html";
      actions.appendChild(dash);
      app.appendChild(actions);
    }

    // Resolve a Supabase bearer token (or {}), then call back with headers.
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
