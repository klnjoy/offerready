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

      // Reinforce workflow continuity: name the job the rest of the app is
      // currently working on (marked "Active" in the list below). Only shown
      // when the active pointer resolves to a job in this list.
      var activeId = activeJobId();
      var activeJob = activeId ? jobs.filter(function (j) { return j && j.id === activeId; })[0] : null;
      if (activeJob) {
        var ctx = el("div", "or-jobbanner");
        ctx.innerHTML = '<span class="or-jobbanner-label">Current job</span> <strong>' +
          esc(displayTitle(activeJob)) + '</strong> \u00b7 <span class="or-small">this is what Check My Fit, Questions, Defend, and your Dashboard are working on</span>';
        app.appendChild(ctx);
      }

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
    // The My Jobs list IS the job switcher, so instead of a redundant banner we
    // mark the currently-active job (the one other pages are operating on) so
    // the user always knows "which job am I working on". Reads the shared
    // active-job pointer; never changes it.
    function activeJobId() {
      try {
        return (window.OfferReadyReadiness && window.OfferReadyReadiness.getActiveJob)
          ? (window.OfferReadyReadiness.getActiveJob() || "") : "";
      } catch (e) { return ""; }
    }

    var COMPANY_TITLE_HINT = /\b(is a|is an|we are|we're|company|startup|provides|focuses|founded|headquarter)\b/i;
    // Placeholder/junk values that must never render as a title.
    var TITLE_JUNK = { "": 1, "not specified": 1, unspecified: 1, "n/a": 1, na: 1, none: 1, unknown: 1, untitled: 1 };
    // Seniority levels — a title made ONLY of these (e.g. "Senior", "Lead",
    // "Principal") names a LEVEL, not a role, so it must not stand as a title.
    // Mirrors analyze.js isLevelOnly so every page agrees on what a title is.
    var SENIORITY_WORDS = { senior: 1, junior: 1, staff: 1, principal: 1, lead: 1, head: 1, chief: 1, mid: 1 };
    function isLevelOnly(s) {
      var words = String(s == null ? "" : s).trim().split(/[\s/]+/).filter(Boolean);
      if (!words.length) return false;
      for (var i = 0; i < words.length; i++) { if (!SENIORITY_WORDS[words[i].toLowerCase()]) return false; }
      return true;
    }
    // A value is usable as a title when it's present, not too long, not a
    // company blurb, not a junk placeholder, and not a bare seniority level.
    function usableTitle(v) {
      var s = (v == null ? "" : String(v)).trim();
      if (!s || s.length > 80) return "";
      if (COMPANY_TITLE_HINT.test(s)) return "";
      if (TITLE_JUNK[s.toLowerCase()]) return "";
      if (isLevelOnly(s)) return "";
      return s;
    }
    function displayTitle(j) {
      return usableTitle(j && j.title) || usableTitle(j && j.seniority) || "Untitled role";
    }

    // Derive the interview-pipeline stage from prep_progress, the one progress
    // signal the light list row carries (set server-side by touchJobStats:
    // 25 after gap analysis, 50 after questions, 75 after a practice completion).
    // No extra per-job fetch, no fabricated numbers — just a truthful "what's
    // done + what's next" read of the existing field.
    function pipeline(j) {
      var p = j && j.prep_progress || 0;
      var steps = [
        { label: "Analyzed", done: true },
        { label: "Fit checked", done: p >= 25 },
        { label: "Questions ready", done: p >= 50 },
        { label: "Practice started", done: p >= 75 },
      ];
      var next;
      if (p < 25)      next = { label: "Check My Fit",             href: "Gap-Analysis/index.html" };
      else if (p < 50) next = { label: "Prepare Practice Questions", href: "Question-Bank/index.html" };
      else if (p < 75) next = { label: "Start Recommended Practice", href: "Practice-Scenarios/index.html", carryJob: true };
      else             next = { label: "View My Readiness",         href: "Dashboard/index.html" };
      return { steps: steps, next: next };
    }

    function card(j, token) {
      var isActive = j && j.id && j.id === activeJobId();
      var c = el("div", "or-job-card" + (isActive ? " or-job-active" : ""));
      var titleRow = el("div", "or-job-titlerow");
      titleRow.appendChild(el("h3", null, esc(displayTitle(j))));
      // A quiet "Active" badge marks the job other pages are currently working
      // on, so the user never wonders which job is in context.
      if (isActive) titleRow.appendChild(el("span", "or-job-activebadge", "Active"));
      c.appendChild(titleRow);
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

      // Interview-pipeline progress: a compact checklist of the stages this job
      // has moved through, so each card reads as "where am I with this role".
      var pl = pipeline(j);
      var steps = el("div", "or-job-pipeline");
      pl.steps.forEach(function (s) {
        var chip = el("span", "or-job-step " + (s.done ? "or-job-step-done" : "or-job-step-todo"));
        chip.textContent = (s.done ? "\u2713 " : "\u25cb ") + s.label;
        steps.appendChild(chip);
      });
      c.appendChild(steps);

      // Per-card Next Action — the single most useful step for THIS job. Sets
      // the job active (so the destination operates on it), then navigates.
      // Mirrors openJob's active-pointer behavior without the full restore.
      var nextWrap = el("div", "or-job-next");
      nextWrap.appendChild(el("span", "or-job-next-label", "Next"));
      var nextBtn = el("a", "or-job-nextlink"); nextBtn.href = "#";
      nextBtn.textContent = pl.next.label;
      nextBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        try {
          if (window.OfferReadyReadiness && window.OfferReadyReadiness.setActiveJob) {
            window.OfferReadyReadiness.setActiveJob(j.id);
          }
        } catch (e) {}
        var href = base + pl.next.href;
        if (pl.next.carryJob) href += "?job=" + encodeURIComponent(j.id);
        window.location.href = href;
      });
      nextWrap.appendChild(nextBtn);
      c.appendChild(nextWrap);

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

    // In-DOM delete confirmation (replaces window.confirm/alert): the card's
    // action row is swapped for an inline "Delete this job? [Delete] [Cancel]"
    // prompt styled like the app, so confirmation and any error stay in place —
    // no blocking native dialogs, no jarring alerts.
    function confirmDelete(j, cardEl, token) {
      var row = cardEl.querySelector(".or-job-actions");
      if (!row) return;
      if (cardEl.querySelector(".or-job-delconfirm")) return;   // already confirming
      row.style.display = "none";

      var box = el("div", "or-job-delconfirm");
      box.appendChild(el("div", "or-job-delq",
        "Delete \u201c" + esc(displayTitle(j)) + "\u201d? This also removes its gap analysis, questions, and practice \u2014 and can\u2019t be undone."));
      var btns = el("div", "or-job-delbtns");
      var yes = el("button", "ip-btn or-btn-danger"); yes.type = "button"; yes.textContent = "Delete";
      var no = el("button", "ip-btn ip-ghost"); no.type = "button"; no.textContent = "Cancel";
      btns.append(yes, no);
      box.appendChild(btns);
      var errSlot = el("div", "or-job-delerr"); box.appendChild(errSlot);
      cardEl.appendChild(box);

      var cancel = function () { box.remove(); row.style.display = ""; };
      no.addEventListener("click", cancel);

      var showErr = function (m) { errSlot.textContent = m; errSlot.className = "or-job-delerr or-error"; };

      yes.addEventListener("click", function () {
        yes.disabled = true; no.disabled = true; errSlot.className = "or-job-delerr"; errSlot.textContent = "Deleting\u2026";
        // Use a FRESH token (the list token may have expired since load) so an
        // expired session surfaces as a clear auth error, not a generic failure.
        var proceed = function (tok) {
          if (!tok) { showErr("Your session has expired. Sign in again, then retry."); yes.disabled = false; no.disabled = false; return; }
          fetch(API_BASE.replace(/\/$/, "") + "/api/jobs/" + encodeURIComponent(j.id), {
            method: "DELETE", headers: authHeaders(tok),
          }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; });
          }).then(function (res) {
            if (res.status === 200 || res.status === 404) {
              // 200 = deleted; 404 = already gone — both mean "remove it".
              // Deleting the active job clears the active-job pointer so other
              // pages stop operating on a dead id. Server CASCADE-deletes the
              // job's gap analyses, question sets, snapshots, practice sessions.
              try {
                if (window.OfferReadyReadiness && window.OfferReadyReadiness.getActiveJob
                  && window.OfferReadyReadiness.getActiveJob() === j.id
                  && window.OfferReadyReadiness.clearActiveJob) {
                  window.OfferReadyReadiness.clearActiveJob();
                }
              } catch (e) {}
              removeCard(cardEl, tok);
              return;
            }
            // Inline, status-specific errors (no window.alert, no reload flash).
            if (res.status === 401) { showErr("Your session isn\u2019t valid. Sign in again and retry."); }
            else if (res.status === 403) { showErr("You don\u2019t have access to delete this job."); }
            else if (res.status >= 500) { showErr("The server couldn\u2019t delete this job right now. Please try again."); }
            else { showErr((res.body && res.body.error) || "Couldn\u2019t delete that job. Please try again."); }
            yes.disabled = false; no.disabled = false;
          }).catch(function () {
            showErr("Couldn\u2019t reach the server. Check your connection and try again.");
            yes.disabled = false; no.disabled = false;
          });
        };
        if (window.OfferReadyAuth && window.OfferReadyAuth.getAccessToken) {
          window.OfferReadyAuth.getAccessToken().then(proceed).catch(function () { proceed(token); });
        } else {
          proceed(token);
        }
      });
    }

    // Remove a deleted job's card in place (no full-list reload flash). Only
    // re-fetch when the list becomes empty, so the correct empty state renders.
    function removeCard(cardEl, tok) {
      var grid = cardEl.parentNode;
      cardEl.remove();
      if (grid && grid.querySelectorAll(".or-job-card").length === 0) {
        loadJobs(tok);   // authoritative empty-state (and clears header/controls)
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
