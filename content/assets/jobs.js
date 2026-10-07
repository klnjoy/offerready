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

      // Empty state: ONE primary CTA, no competing buttons (no header "+ Analyze
      // New Job" here — that secondary action only makes sense once jobs exist).
      if (!jobs.length) {
        var head0 = el("div", "or-jobs-head");
        head0.appendChild(el("h2", null, "My Jobs"));
        app.appendChild(head0);
        var empty = el("div", "ip-card");
        empty.appendChild(el("div", "ip-q", "No saved jobs yet"));
        empty.appendChild(el("p", null, "Analyze a job description to create your first preparation plan."));
        var go = el("a", "ip-btn"); go.href = base + "Analyze/index.html"; go.textContent = "Analyze a Job";
        empty.appendChild(go);
        app.appendChild(empty);
        return;
      }

      // Non-empty state: job list is primary; "+ Analyze New Job" is the single
      // secondary creation action, in the header.
      var head = el("div", "or-jobs-head");
      head.appendChild(el("h2", null, "My Jobs"));
      var add = el("a", "ip-btn ip-ghost"); add.href = base + "Analyze/index.html"; add.textContent = "+ Analyze New Job";
      head.appendChild(add);
      app.appendChild(head);

      // For a handful of jobs, a plain grid is clearest. Once the list grows,
      // a wall of cards is hard to scan — so we add a lightweight control bar
      // (search + sort) and reveal cards in pages ("Show more"). All of this is
      // client-side over the already-fetched list; no new endpoints or data.
      var SHOW_CONTROLS_AT = 6; // below this, keep the UI minimal
      var PAGE_SIZE = 9;        // cards revealed per "Show more" (3 rows of 3)

      var grid = el("div", "or-jobs-grid");

      if (jobs.length < SHOW_CONTROLS_AT) {
        jobs.forEach(function (j) { grid.appendChild(card(j, token)); });
        app.appendChild(grid);
        return;
      }

      // ---- Controls (search + sort) --------------------------------------
      var state = { q: "", sort: "recent", shown: PAGE_SIZE };

      var controls = el("div", "or-jobs-controls");

      var searchWrap = el("div", "or-jobs-search");
      var search = el("input", "or-input or-jobs-search-input");
      search.type = "search";
      search.placeholder = "Search jobs by title or company\u2026";
      search.setAttribute("aria-label", "Search jobs");
      searchWrap.appendChild(search);
      controls.appendChild(searchWrap);

      var sortWrap = el("div", "or-jobs-sort");
      var sortLabel = el("label", "or-jobs-sort-label", "Sort");
      sortLabel.htmlFor = "or-jobs-sort-select";
      var sort = el("select", "or-input or-jobs-sort-select");
      sort.id = "or-jobs-sort-select";
      [
        ["recent", "Most recent"],
        ["oldest", "Oldest first"],
        ["title", "Title (A\u2013Z)"],
        ["prep", "Prep (high\u2192low)"],
        ["gaps", "Gaps (high\u2192low)"],
      ].forEach(function (opt) {
        var o = el("option"); o.value = opt[0]; o.textContent = opt[1]; sort.appendChild(o);
      });
      sortWrap.append(sortLabel, sort);
      controls.appendChild(sortWrap);

      app.appendChild(controls);

      var count = el("div", "or-jobs-count or-muted or-small");
      app.appendChild(count);

      app.appendChild(grid);

      var more = el("div", "or-jobs-more");
      var moreBtn = el("button", "ip-btn ip-ghost"); moreBtn.type = "button"; moreBtn.textContent = "Show more";
      more.appendChild(moreBtn);
      app.appendChild(more);

      var timeOf = function (j) { var d = j && j.created_at ? new Date(j.created_at).getTime() : 0; return isNaN(d) ? 0 : d; };

      function filtered() {
        var q = state.q.trim().toLowerCase();
        var list = jobs.filter(function (j) {
          if (!q) return true;
          var hay = (displayTitle(j) + " " + (j.company || "") + " " + (j.seniority || "")).toLowerCase();
          return hay.indexOf(q) !== -1;
        });
        list.sort(function (a, b) {
          switch (state.sort) {
            case "oldest": return timeOf(a) - timeOf(b);
            case "title": return displayTitle(a).localeCompare(displayTitle(b));
            case "prep": return (b.prep_progress || 0) - (a.prep_progress || 0);
            case "gaps": return (b.gaps_count || 0) - (a.gaps_count || 0);
            case "recent":
            default: return timeOf(b) - timeOf(a);
          }
        });
        return list;
      }

      function paint() {
        var list = filtered();
        var shown = Math.min(state.shown, list.length);
        grid.innerHTML = "";
        for (var i = 0; i < shown; i++) grid.appendChild(card(list[i], token));

        if (!list.length) {
          grid.appendChild(el("p", "ip-ai-hint", "No jobs match \u201c" + esc(state.q) + "\u201d."));
          count.textContent = "";
        } else {
          count.textContent = "Showing " + shown + " of " + list.length +
            (list.length === 1 ? " job" : " jobs");
        }
        more.style.display = shown < list.length ? "" : "none";
      }

      var debounce;
      search.addEventListener("input", function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () { state.q = search.value; state.shown = PAGE_SIZE; paint(); }, 120);
      });
      sort.addEventListener("change", function () { state.sort = sort.value; state.shown = PAGE_SIZE; paint(); });
      moreBtn.addEventListener("click", function () { state.shown += PAGE_SIZE; paint(); });

      paint();
    }

    // Defensive display guard: the server repairs weak titles on reopen, but a
    // legacy list row may still carry a company-description sentence (it hasn't
    // been reopened yet). Never render a paragraph/company blurb as the card
    // title — fall back to seniority or "Untitled role". (Opening the job then
    // repairs + persists a real title via the detail endpoint.)
    var COMPANY_TITLE_HINT = /\b(is a|is an|we are|we're|company|startup|provides|focuses|founded|headquarter)\b/i;
    function displayTitle(j) {
      var t = (j && j.title ? String(j.title) : "").trim();
      if (t && t.length <= 80 && !COMPANY_TITLE_HINT.test(t)) return t;
      var sen = (j && j.seniority ? String(j.seniority) : "").trim();
      if (sen && sen.length <= 80 && !COMPANY_TITLE_HINT.test(sen) && sen.toLowerCase() !== "not specified") return sen;
      return "Untitled role";
    }

    function card(j, token) {
      var c = el("div", "or-job-card");
      c.appendChild(el("h3", null, esc(displayTitle(j))));
      var meta = [];
      if (j.company) meta.push(esc(j.company));
      if (j.seniority) meta.push(esc(j.seniority));
      if (meta.length) c.appendChild(el("div", "or-job-meta", meta.join(" \u00b7 ")));

      // Stat tiles for the fields the list row carries (value + label), so the
      // card scans cleanly on desktop and mobile. Same data; clearer layout.
      var stats = el("div", "or-job-stats");
      var statTile = function (num, label) {
        var t = el("div", "or-jobstat");
        t.appendChild(el("div", "or-jobstat-num", esc(num)));
        t.appendChild(el("div", "or-jobstat-label", esc(label)));
        return t;
      };
      stats.appendChild(statTile(j.skills_count || 0, "Skills"));
      stats.appendChild(statTile(j.gaps_count || 0, "Gaps"));
      stats.appendChild(statTile((j.prep_progress || 0) + "%", "Prep"));
      c.appendChild(stats);

      var when = j.created_at ? new Date(j.created_at) : null;
      if (when && !isNaN(when.getTime())) c.appendChild(el("div", "or-job-date", "Analyzed " + when.toLocaleDateString()));

      // Open is the primary next action (sets this job active + restores full
      // context); Delete is a quiet secondary.
      var row = el("div", "or-job-actions");
      var open = el("button", "ip-btn or-cta-primary"); open.type = "button"; open.textContent = "Open & continue";
      open.addEventListener("click", function () { openJob(j.id, token); });
      var del = el("button", "ip-btn ip-ghost"); del.type = "button"; del.textContent = "Delete";
      del.addEventListener("click", function () { confirmDelete(j, c, token); });
      row.append(open, del);
      c.appendChild(row);
      return c;
    }

    function confirmDelete(j, cardEl, token) {
      if (!window.confirm("Delete \u201c" + (j.title || "this job") + "\u201d? This can\u2019t be undone.")) return;
      // Use a FRESH token (the list token may have expired since load) so an
      // expired session surfaces as a clear auth error, not a generic failure.
      var proceed = function (tok) {
        if (!tok) {
          window.alert("Your session has expired. Please sign in again, then retry the delete.");
          renderSignedOut();
          return;
        }
        fetch(API_BASE.replace(/\/$/, "") + "/api/jobs/" + encodeURIComponent(j.id), {
          method: "DELETE", headers: authHeaders(tok),
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; });
        }).then(function (res) {
          if (res.status === 200) {
            // Deleting the active job must clear the active-job pointer so other
            // pages (Gap / Questions / Dashboard / Defend) stop operating on a
            // dead id. The server CASCADE-deletes the job's gap analyses,
            // question sets, readiness snapshots, and practice sessions.
            try {
              if (window.OfferReadyReadiness && window.OfferReadyReadiness.getActiveJob
                && window.OfferReadyReadiness.getActiveJob() === j.id
                && window.OfferReadyReadiness.clearActiveJob) {
                window.OfferReadyReadiness.clearActiveJob();
              }
            } catch (e) {}
            cardEl.remove();
            // Refresh My Jobs immediately (re-fetch authoritative list).
            loadJobs(tok);
            return;
          }
          // Status-specific, meaningful errors (spec).
          var msg;
          if (res.status === 401) { msg = "Authentication issue \u2014 your session isn\u2019t valid. Sign in again and retry."; renderSignedOut(); }
          else if (res.status === 403) { msg = "Permission issue \u2014 you don\u2019t have access to delete this job."; }
          else if (res.status === 404) { msg = "This job no longer exists (it may already be deleted). Refreshing your list."; cardEl.remove(); loadJobs(tok); }
          else if (res.status >= 500) { msg = "The server couldn\u2019t delete this job right now (server error). Please try again."; }
          else { msg = (res.body && res.body.error) || "Couldn\u2019t delete that job. Please try again."; }
          if (res.status !== 404) window.alert(msg);
        }).catch(function () {
          window.alert("Request failed \u2014 couldn\u2019t reach the server. Check your connection and try again.");
        });
      };
      if (window.OfferReadyAuth && window.OfferReadyAuth.getAccessToken) {
        window.OfferReadyAuth.getAccessToken().then(proceed).catch(function () { proceed(token); });
      } else {
        proceed(token);
      }
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
      app.appendChild(el("h2", null, esc(displayTitle(job) !== "Untitled role" ? displayTitle(job) : (job.title || a.seniority || "Saved job"))));
      if (a.roleSummary) app.appendChild(el("p", null, esc(a.roleSummary)));

      // Restored readiness snapshot (from persisted gap + progress). Use the
      // SINGLE shared readiness formula (window.OfferReadyReadiness.weightedOverall)
      // so a job's score here is IDENTICAL to the Dashboard — no duplicate math.
      var latest = progress[0] || null;
      var practiceAvg = latest ? (latest.avg_answer_score || 0) : 0;
      var completion = Math.min((latest && latest.questions_practiced) || 0, 10) * 10;
      // Respect a persisted overall of 0 (presence check, not truthiness) so a
      // legitimate zero readiness isn't replaced by the computed fallback.
      var hasPersistedOverall = latest && latest.overall_readiness != null;
      var overall = hasPersistedOverall
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
