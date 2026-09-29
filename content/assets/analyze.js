/* Analyze My Job — frontend for the OfferReady MVP.
   Static (GitHub Pages). Calls the serverless API at API_BASE_URL/api/analyze-job.
   The API base is configurable (window.OFFERREADY_API_BASE) so it can change
   without touching logic. No API key ever lives here. If the API is missing or
   unconfigured, a clearly-labeled Sample Demo is shown instead of crashing.
   Mounts on #analyze-app, survives navigation.instant. */
(function () {
  // Configure the deployed Vercel URL here (or set window.OFFERREADY_API_BASE
  // before this script loads). Empty string => demo-only mode.
  const API_BASE = (typeof window !== "undefined" && window.OFFERREADY_API_BASE) || "";

  const LOADING_STEPS = [
    "Analyzing role\u2026",
    "Identifying requirements\u2026",
    "Checking preparation areas\u2026",
    "Building your preparation plan\u2026",
  ];

  // ---- persistence + share (no backend) --------------------------------------
  const STORE_KEY = "offerready.analysis.v1";   // last saved analysis (+ input)
  const FEEDBACK_KEY = "offerready.feedback.v1"; // aggregate helpful/not counts
  const SHARE_PREFIX = "#a=";                    // shareable URL-hash marker

  // Save the most recent analysis so a returning visitor can resume it.
  function saveAnalysis(record) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(record)); } catch (e) {}
  }
  function loadAnalysis() {
    try { const raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function clearAnalysis() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} }

  // Log the analysis as a Progress activity: role + top gap labels, so the
  // dashboard can recommend the next reps (reuse of the shared store).
  function logAnalyzeActivity(analysis, role) {
    try {
      if (!window.OfferReadyProgress || !analysis) return;
      var gaps = [];
      (analysis.potentialGaps || []).forEach(function (g) { if (g && g.requirement) gaps.push(g.requirement); });
      (analysis.preparationPlan || []).forEach(function (p) { if (p && p.title) gaps.push(p.title); });
      window.OfferReadyProgress.logActivity({
        type: "analyze",
        role: role || analysis.seniority || "target role",
        gaps: gaps,
      });
    } catch (e) {}
  }

  // Map an analysis to the best-matching Defend scenario category (matches
  // scenario.js CATEGORY_LABELS). Used to route the user from their analyzed
  // job straight into the relevant defend-your-decision scenarios.
  function inferScenarioCategory(analysis, role) {
    var hay = ((role || "") + " " + ((analysis && analysis.seniority) || "") + " " +
      ((analysis && analysis.roleSummary) || "") + " " +
      (((analysis && analysis.coreSkills) || []).map(function (s) { return typeof s === "string" ? s : (s && s.name); }).join(" ")) + " " +
      (((analysis && analysis.technologies) || []).join(" "))).toLowerCase();
    // Order matters: most specific role signals first.
    if (/\bsecurity|prompt injection|guardrail|threat|owasp|zero.?trust\b/.test(hay)) return "ai-security";
    if (/\bforward deployed|forward-deployed|\bfde\b|customer-facing|client-facing|solutions engineer\b/.test(hay)) return "fde";
    if (/\bdata architect|snowflake|databricks|warehouse|lakehouse|cortex|etl|data platform|analytics engineer\b/.test(hay)) return "data-architect";
    if (/\bcloud|platform|devops|kubernetes|infrastructure|sre|reliability|terraform\b/.test(hay)) return "cloud-platform";
    if (/\barchitect|architecture|system design|multi-tenant|enterprise\b/.test(hay)) return "ai-architect";
    if (/\bai engineer|genai|ml engineer|rag|agent|llm|nlp\b/.test(hay)) return "ai-engineer";
    return null; // no confident match → don't force a filter
  }

  // Persist a small "defend role" signal so the Defend page can auto-filter to
  // the analyzed job AND lightly personalize the scenario prompts to it.
  // Stores only distilled signals (role, top technologies, top gaps) derived
  // from the structured analysis — NOT the raw JD/resume text (spec: no JD text
  // at rest).
  function saveDefendRole(category, role, analysis) {
    try {
      if (!category) return;
      var techs = [];
      (analysis && analysis.technologies || []).forEach(function (t) {
        if (typeof t === "string" && t.trim()) techs.push(t.trim());
      });
      (analysis && analysis.coreSkills || []).forEach(function (s) {
        var name = typeof s === "string" ? s : (s && s.name);
        if (name && techs.indexOf(name) === -1) techs.push(name);
      });
      var gaps = [];
      (analysis && analysis.potentialGaps || []).forEach(function (g) {
        if (g && g.requirement) gaps.push(g.requirement);
      });
      (analysis && analysis.preparationPlan || []).forEach(function (p) {
        if (p && p.title && gaps.indexOf(p.title) === -1) gaps.push(p.title);
      });
      localStorage.setItem("offerready.defendRole.v1",
        JSON.stringify({
          category: category,
          role: role || "",
          seniority: (analysis && analysis.seniority) || "",
          technologies: techs.slice(0, 8),
          gaps: gaps.slice(0, 5),
          when: Date.now(),
        }));
    } catch (e) {}
  }

  // Unicode-safe base64 for the shareable hash.
  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decode(str) { return decodeURIComponent(escape(atob(str))); }

  // Encode just the analysis (not the resume) into a shareable link.
  function buildShareUrl(analysis) {
    try {
      const payload = b64encode(JSON.stringify(analysis));
      return location.origin + location.pathname + SHARE_PREFIX + payload;
    } catch (e) { return null; }
  }
  function readSharedAnalysis() {
    const h = location.hash || "";
    if (h.indexOf(SHARE_PREFIX) !== 0) return null;
    try { return JSON.parse(b64decode(h.slice(SHARE_PREFIX.length))); } catch (e) { return null; }
  }

  function init() {
    const app = document.getElementById("analyze-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";

    const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // site base for resolving OfferReady resource links (…/offerready/)
    const base = (window.__md_scope && window.__md_scope.pathname ? window.__md_scope.pathname.replace(/[^/]*$/, "") : "/");

    // 1) A shared link (URL hash) always wins — re-render that analysis read-only-ish.
    const shared = readSharedAnalysis();
    if (shared && shared.roleSummary) { renderResult(shared, { shared: true }); return; }

    // Onboarding hand-off: /Analyze/?role=AI%20Engineer prefills the target role
    // so the "pick a role → analyze" flow lands ready to paste a JD.
    let onboardPrefill = null;
    try {
      const qs = new URLSearchParams(location.search || "");
      const r = qs.get("role");
      if (r) onboardPrefill = { targetRole: r.slice(0, 200) };
    } catch (e) {}

    renderForm(onboardPrefill);

    function renderForm(prefill) {
      app.innerHTML = "";

      // Offer to resume the last saved analysis (unless we're prefilling the form).
      if (!prefill) {
        const saved = loadAnalysis();
        if (saved && saved.analysis && saved.analysis.roleSummary) {
          const banner = el("div", "or-resume-banner");
          const when = saved.savedAt ? new Date(saved.savedAt) : null;
          const whenTxt = when ? " (" + when.toLocaleDateString() + ")" : "";
          banner.appendChild(el("span", null,
            "\uD83D\uDD16 You have a saved analysis" +
            (saved.input && saved.input.targetRole ? " for <strong>" + esc(saved.input.targetRole) + "</strong>" : "") +
            whenTxt + "."));
          const resume = el("button", "ip-btn"); resume.type = "button"; resume.textContent = "Resume it";
          resume.addEventListener("click", () => renderResult(saved.analysis, { model: saved.model, restored: true }));
          const discard = el("button", "ip-btn ip-ghost"); discard.type = "button"; discard.textContent = "Start fresh";
          discard.addEventListener("click", () => { clearAnalysis(); banner.remove(); });
          banner.append(resume, discard);
          app.appendChild(banner);
        }
      }

      app.appendChild(el("p", "ip-ai-hint",
        "OfferReady analyzes the role requirements and creates a preparation path based on <strong>this specific job</strong>. Paste a job description below."));

      const form = el("form", "or-analyze-form");
      form.appendChild(fieldLabel("Target role (optional)"));
      const role = el("input", "or-input"); role.type = "text"; role.placeholder = "e.g. AI Solutions Architect"; role.maxLength = 200;
      if (prefill) role.value = prefill.targetRole || "";
      form.appendChild(role);

      form.appendChild(fieldLabel("Job description (required)"));
      const jd = el("textarea", "ip-answerbox"); jd.placeholder = "Paste the full job description here\u2026"; jd.rows = 8; jd.maxLength = 12000;
      if (prefill) jd.value = prefill.jobDescription || "";
      form.appendChild(jd);

      form.appendChild(fieldLabel("Resume (optional \u2014 enables alignment)"));
      const cv = el("textarea", "ip-answerbox"); cv.placeholder = "Paste your resume text (optional). Not stored."; cv.rows = 5; cv.maxLength = 16000;
      if (prefill) cv.value = prefill.resume || "";
      form.appendChild(cv);

      const row = el("div", "ip-controls");
      const go = el("button", "ip-btn"); go.type = "submit"; go.textContent = "Analyze My Job";
      const demo = el("button", "ip-btn ip-ghost"); demo.type = "button"; demo.textContent = "See a sample analysis";
      row.append(go, demo); form.appendChild(row);

      const err = el("div", "or-error"); form.appendChild(err);
      app.appendChild(form);

      demo.addEventListener("click", () => renderResult(SAMPLE, { demo: true }));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        err.textContent = "";
        const jobDescription = jd.value.trim();
        if (jobDescription.length < 30) { err.textContent = "Please paste a job description (at least a few sentences)."; return; }
        if (!API_BASE) { // no backend configured on this build → show labeled demo
          renderResult(SAMPLE, { demo: true, note: "Live analysis isn't configured on this site yet, so here's a sample." });
          return;
        }
        analyze({ jobDescription, targetRole: role.value.trim(), resume: cv.value.trim() });
      });
    }

    function fieldLabel(t) { return el("div", "or-field-label", esc(t)); }

    function renderLoading() {
      app.innerHTML = "";
      const card = el("div", "ip-card");
      card.appendChild(el("div", "ip-q", "Analyzing this job\u2026"));
      const list = el("ul", "or-steps");
      LOADING_STEPS.forEach((s) => list.appendChild(el("li", null, esc(s))));
      card.appendChild(list);
      app.appendChild(card);
      // Progressive highlight of steps (purely cosmetic; single API call underneath).
      const items = list.querySelectorAll("li");
      let i = 0; items[0].classList.add("or-step-on");
      const iv = setInterval(() => { i++; if (i < items.length) items[i].classList.add("or-step-on"); else clearInterval(iv); }, 900);
      return () => clearInterval(iv);
    }

    async function analyze(payload) {
      const stop = renderLoading();
      try {
        const resp = await fetch(API_BASE.replace(/\/$/, "") + "/api/analyze-job", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        stop && stop();
        if (resp.status === 503) { const d = await safeJson(resp); renderResult(SAMPLE, { demo: true, note: "Live analysis isn't enabled on this deployment yet \u2014 showing a sample." }); return; }
        if (!resp.ok) { const d = await safeJson(resp); renderError((d && d.error) || "Analysis failed. Please try again.", payload); return; }
        const d = await resp.json();
        if (!d || !d.analysis) { renderError("The analysis came back empty. Please try again.", payload); return; }
        // Persist the result (store the role only, not the full JD/resume text).
        saveAnalysis({
          analysis: d.analysis,
          model: d.model,
          input: { targetRole: payload.targetRole || "" },
          savedAt: Date.now(),
        });
        // Log an activity so the Progress dashboard can close the loop:
        // "you analyzed X — drill these gaps". No JD/resume text is stored.
        logAnalyzeActivity(d.analysis, payload.targetRole);
        // Remember the matched Defend role so the Defend page filters to this job.
        saveDefendRole(inferScenarioCategory(d.analysis, payload.targetRole), payload.targetRole || (d.analysis && d.analysis.seniority) || "", d.analysis);
        renderResult(d.analysis, { model: d.model, input: { targetRole: payload.targetRole, jobDescription: payload.jobDescription } });
      } catch (e) {
        stop && stop();
        renderError("Couldn't reach the analysis service. Check your connection and try again.", payload);
      }
    }

    async function safeJson(resp) { try { return await resp.json(); } catch (_) { return null; } }

    function renderError(msg, prefill) {
      app.innerHTML = "";
      const card = el("div", "ip-card");
      card.appendChild(el("div", "or-error", "\u26a0\ufe0f " + esc(msg)));
      const back = el("button", "ip-btn"); back.textContent = "Back to the form";
      back.addEventListener("click", () => renderForm(prefill));
      card.appendChild(back);
      app.appendChild(card);
    }

    // ---- result rendering (order per spec) ----
    function renderResult(a, meta) {
      app.innerHTML = "";
      meta = meta || {};
      if (meta.demo) {
        app.appendChild(el("div", "or-demo-banner",
          "\uD83E\uDDEA <strong>Sample analysis</strong> \u2014 illustrative demo data for a fictional role. " +
          esc(meta.note || "This was not generated from your resume.")));
      }
      app.appendChild(el("p", "ip-ai-hint",
        "Preparation guidance only \u2014 <strong>not a prediction</strong> of interview or offer outcomes."));

      // ROLE SUMMARY
      section("Role summary", () => {
        const w = el("div");
        if (a.seniority) w.appendChild(el("span", "ip-topic", esc(a.seniority)));
        w.appendChild(el("p", null, esc(a.roleSummary)));
        return w;
      });

      // WHAT THIS JOB REQUIRES
      section("What this job requires", () => {
        const w = el("div");
        w.appendChild(chips("Core skills", (a.coreSkills || []).map(skillLabel)));
        w.appendChild(chips("Technologies", (a.technologies || []).map(esc)));
        if ((a.experienceRequirements || []).length) w.appendChild(bullets("Experience", a.experienceRequirements));
        return w;
      });

      // YOUR ALIGNMENT (only if resume provided)
      if (a.resumeProvided && (a.alignment || []).length) {
        section("Your alignment", () => tableRows(
          ["Requirement", "Status", "Evidence"],
          a.alignment.map((r) => [esc(r.requirement), statusPill(r.status), esc(r.evidence)])
        ));
      }

      // READINESS
      if ((a.readiness || []).length) {
        section("Your readiness", () => tableRows(
          ["Dimension", "Status", "Role requires", "You have", "Gap"],
          a.readiness.map((r) => [esc(r.dimension), statusPill(r.status), esc(r.roleRequires), esc(r.candidateHas), esc(r.gap)])
        ));
      }

      // POTENTIAL GAPS
      if ((a.potentialGaps || []).length) {
        section("Potential gaps", () => {
          const w = el("div");
          a.potentialGaps.forEach((g) => {
            const c = el("div", "ip-model");
            c.appendChild(el("h4", null, esc(g.requirement)));
            if (g.whatIsMissing) c.appendChild(el("p", null, "<strong>Missing:</strong> " + esc(g.whatIsMissing)));
            if (g.whyItMatters) c.appendChild(el("p", null, "<strong>Why it matters:</strong> " + esc(g.whyItMatters)));
            if ((g.whatToStudy || []).length) c.appendChild(bullets("Study", g.whatToStudy));
            if ((g.whatToBuild || []).length) c.appendChild(bullets("Build", g.whatToBuild));
            if ((g.whatToPractice || []).length) c.appendChild(bullets("Practice", g.whatToPractice));
            if (g.interviewExpectation) c.appendChild(el("p", null, "<strong>In the interview:</strong> " + esc(g.interviewExpectation)));
            w.appendChild(c);
          });
          return w;
        });
      }

      // INTERVIEW SIGNALS
      if ((a.interviewSignals || []).length) {
        section("Interview signals", () => bullets(null, a.interviewSignals.map((s) =>
          (s.area ? esc(s.area) : esc(String(s))) + (s.type ? ` <span class="or-tag">${esc(s.type)}</span>` : "") + (s.note ? " \u2014 " + esc(s.note) : "")
        ), true));
      }

      // PERSONALIZED PREPARATION PLAN
      if ((a.preparationPlan || []).length) {
        section("Your preparation plan", () => {
          const w = el("div");
          a.preparationPlan.forEach((p) => {
            const c = el("div", "ip-model");
            c.appendChild(el("h4", null, "Priority " + esc(p.priority) + " \u2014 " + esc(p.title)));
            if (p.why) c.appendChild(el("p", null, esc(p.why)));
            if (p.resource && p.resource.path) {
              const link = el("a", "or-reslink"); link.href = base + p.resource.path; link.textContent = "\u2192 " + p.resource.label;
              c.appendChild(link);
            }
            w.appendChild(c);
          });
          return w;
        });
      }

      // RELEVANT OFFERREADY RESOURCES
      if ((a.offerReadyResources || []).length) {
        section("Relevant OfferReady resources", () => {
          const w = el("div", "or-reslist");
          a.offerReadyResources.forEach((r) => {
            const link = el("a", "or-reslink"); link.href = base + r.path; link.textContent = r.label;
            w.appendChild(link);
          });
          return w;
        });
      } else {
        section("Relevant OfferReady resources", () => el("p", "ip-ai-hint", "No matching OfferReady resource found for this role's skills."));
      }

      // DEFEND A DECISION FOR THIS ROLE — route the analyzed job straight into
      // the matching defend-your-decision scenarios (the paid differentiator).
      if (!meta.shared) {
        const CAT_LABELS = {
          "ai-engineer": "AI / GenAI Engineer", "ai-architect": "AI Architect",
          "data-architect": "Data Architect", "cloud-platform": "Cloud / Platform",
          "ai-security": "AI Security", "fde": "Forward Deployed",
        };
        const cat = inferScenarioCategory(a, (meta.input && meta.input.targetRole) || "");
        section("Defend your decisions for this role", () => {
          const w = el("div", "ip-model");
          w.appendChild(el("p", null,
            "The interview that decides the offer is where you <strong>defend</strong> your design under follow-ups. " +
            (cat ? "We matched this job to the <strong>" + esc(CAT_LABELS[cat] || cat) + "</strong> scenarios." :
                   "Pick a scenario for your target role.")));
          const go = el("a", "ip-btn");
          go.href = base + "Practice-Scenarios/index.html" + (cat ? "?role=" + encodeURIComponent(cat) : "");
          go.textContent = cat ? "Defend a " + (CAT_LABELS[cat] || cat) + " scenario \u2192" : "Open Defend scenarios \u2192";
          w.appendChild(go);
          return w;
        });
      }

      // NEXT STEP + CTA
      const cta = el("div", "ip-card or-next");
      cta.appendChild(el("div", "ip-progress", "Next step"));
      cta.appendChild(el("div", "ip-q", esc(a.nextStep || "Start with your Priority 1 preparation area.")));
      const start = el("button", "ip-btn"); start.textContent = "Start preparation";
      const firstLink = (a.preparationPlan || []).map((p) => p.resource).find((r) => r && r.path);
      start.addEventListener("click", () => { if (firstLink) location.href = base + firstLink.path; else location.href = base + "Interview_Guide_Overview.html".replace(/^/, "Personal-SourceCode/"); });
      cta.appendChild(start);
      const again = el("button", "ip-btn ip-ghost"); again.textContent = "Analyze another job";
      again.addEventListener("click", () => { if (location.hash) { try { history.replaceState(null, "", location.pathname); } catch (e) {} } renderForm(); });
      cta.appendChild(again);
      app.appendChild(cta);

      // ---- export + share toolbar (works offline, no backend) ----
      if (!meta.demo) {
        const tools = el("div", "or-toolbar");
        tools.appendChild(el("div", "or-field-label", "Save & share this plan"));
        const btnRow = el("div", "or-toolbar-row");

        // Save to My Jobs (requires sign-in + backend). Persists this analysis
        // to the user's account so it appears on the My Jobs dashboard.
        const saveBtn = el("button", "ip-btn"); saveBtn.type = "button"; saveBtn.textContent = "\uD83D\uDCBE Save to My Jobs";
        const saveMsg = el("span", "or-save-msg");
        saveBtn.addEventListener("click", () => {
          if (!API_BASE) { saveMsg.textContent = "Saving isn't enabled on this site yet."; return; }
          if (!window.OfferReadyAuth) { saveMsg.textContent = "Sign-in isn't available yet."; return; }
          saveBtn.disabled = true; saveMsg.textContent = "Saving\u2026";
          window.OfferReadyAuth.getAccessToken().then((token) => {
            if (!token) { saveBtn.disabled = false; saveMsg.innerHTML = 'Please <a href="' + base + 'My-Jobs/index.html">sign in</a> to save this job.'; return; }
            const inp = meta.input || {};
            const payload = {
              analysis: a,
              title: inp.targetRole || a.seniority || "",
              jobDescription: inp.jobDescription || "",
              model: meta.model || "",
            };
            fetch(API_BASE.replace(/\/$/, "") + "/api/jobs", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
              body: JSON.stringify(payload),
            }).then((r) => r.json().catch(() => ({})).then((j) => ({ status: r.status, body: j })))
              .then((res) => {
                if (res.status === 201) {
                  saveMsg.innerHTML = "Saved \u2713 \u2014 <a href='" + base + "My-Jobs/index.html'>View My Jobs</a>";
                } else if (res.status === 403 && res.body && res.body.upgrade) {
                  saveBtn.disabled = false;
                  saveMsg.innerHTML = "Free includes one saved job. <a href='" + base + "assets/pricing.html'>Upgrade to Pro</a> to save more.";
                } else if (res.status === 401) {
                  saveBtn.disabled = false;
                  saveMsg.innerHTML = 'Please <a href="' + base + 'My-Jobs/index.html">sign in</a> to save this job.';
                } else {
                  saveBtn.disabled = false;
                  saveMsg.textContent = (res.body && res.body.error) || "Couldn't save this job. Please try again.";
                }
              }).catch(() => { saveBtn.disabled = false; saveMsg.textContent = "Couldn't reach the server. Please try again."; });
          }).catch(() => { saveBtn.disabled = false; saveMsg.textContent = "Couldn't check your sign-in. Please try again."; });
        });

        const copyBtn = el("button", "ip-btn ip-ghost"); copyBtn.type = "button"; copyBtn.textContent = "Copy plan (Markdown)";
        copyBtn.addEventListener("click", () => {
          const md = toMarkdown(a);
          const done = () => { const t = copyBtn.textContent; copyBtn.textContent = "Copied \u2713"; setTimeout(() => { copyBtn.textContent = t; }, 1600); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(md).then(done, () => fallbackCopy(md, done));
          else fallbackCopy(md, done);
        });

        const dlBtn = el("button", "ip-btn ip-ghost"); dlBtn.type = "button"; dlBtn.textContent = "Download .md";
        dlBtn.addEventListener("click", () => {
          const md = toMarkdown(a);
          const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          const slug = (a.seniority || a.roleSummary || "offerready").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "offerready";
          link.href = url; link.download = "offerready-plan-" + slug + ".md";
          document.body.appendChild(link); link.click();
          setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 0);
        });

        const printBtn = el("button", "ip-btn ip-ghost"); printBtn.type = "button"; printBtn.textContent = "Print / PDF";
        printBtn.addEventListener("click", () => window.print());

        const shareBtn = el("button", "ip-btn ip-ghost"); shareBtn.type = "button"; shareBtn.textContent = "Copy shareable link";
        shareBtn.addEventListener("click", () => {
          const url = buildShareUrl(a);
          if (!url) { shareBtn.textContent = "Couldn't build link"; return; }
          const done = () => { shareBtn.textContent = "Link copied \u2713"; setTimeout(() => { shareBtn.textContent = "Copy shareable link"; }, 1800); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => fallbackCopy(url, done));
          else fallbackCopy(url, done);
        });

        btnRow.append(saveBtn, copyBtn, dlBtn, printBtn, shareBtn);
        tools.appendChild(btnRow);
        tools.appendChild(saveMsg);
        tools.appendChild(el("p", "ip-ai-hint",
          meta.shared ? "You're viewing a shared plan. Nothing here is stored on a server."
                      : "Saved to this browser \u2014 it'll be here when you come back. The shareable link contains only the plan, not your resume."));
        app.appendChild(tools);
      }

      // ---- "Was this helpful?" feedback (local-only signal) ----
      if (!meta.shared) {
        const fb = el("div", "or-feedback");
        fb.appendChild(el("span", "or-feedback-q", "Was this analysis helpful?"));
        const yes = el("button", "ip-btn ip-ghost"); yes.type = "button"; yes.textContent = "\uD83D\uDC4D Yes";
        const no = el("button", "ip-btn ip-ghost"); no.type = "button"; no.textContent = "\uD83D\uDC4E Not really";
        const thanks = el("span", "or-feedback-thanks"); thanks.style.display = "none"; thanks.textContent = "Thanks \u2014 noted.";
        function record(v) {
          try {
            const raw = localStorage.getItem(FEEDBACK_KEY);
            const f = raw ? JSON.parse(raw) : { up: 0, down: 0 };
            if (v === "up") f.up++; else f.down++;
            f.updatedAt = Date.now();
            localStorage.setItem(FEEDBACK_KEY, JSON.stringify(f));
          } catch (e) {}
          yes.disabled = no.disabled = true;
          yes.style.display = no.style.display = "none";
          thanks.style.display = "";
        }
        yes.addEventListener("click", () => record("up"));
        no.addEventListener("click", () => record("down"));
        fb.append(yes, no, thanks);
        app.appendChild(fb);
      }

      if (meta.model) app.appendChild(el("p", "ip-ai-hint", "Analyzed with model: " + esc(meta.model) + "."));
    }

    // ---- small render helpers ----
    function section(title, build) {
      app.appendChild(el("h2", null, esc(title)));
      app.appendChild(build());
    }
    function skillLabel(s) { return typeof s === "string" ? esc(s) : (esc(s.name) + (s.type ? ` <span class="or-tag">${esc(s.type)}</span>` : "")); }
    function chips(label, items) {
      const w = el("div", "or-chips");
      if (label) w.appendChild(el("div", "or-field-label", esc(label)));
      (items || []).forEach((it) => w.appendChild(el("span", "ip-topic", it)));
      return w;
    }
    function bullets(label, items, rawHtml) {
      const w = el("div");
      if (label) w.appendChild(el("div", "or-field-label", esc(label)));
      const ul = el("ul");
      (items || []).forEach((it) => ul.appendChild(el("li", null, rawHtml ? it : esc(it))));
      w.appendChild(ul); return w;
    }
    function tableRows(headers, rows) {
      let t = "<table><thead><tr>" + headers.map((h) => `<th>${esc(h)}</th>`).join("") + "</tr></thead><tbody>";
      rows.forEach((r) => { t += "<tr>" + r.map((c) => `<td>${c}</td>`).join("") + "</tr>"; });
      t += "</tbody></table>";
      return el("div", null, t);
    }
    function statusPill(s) {
      const map = {
        MATCHED: "or-ok", STRONG_MATCH: "or-ok",
        PARTIAL: "or-warn", PARTIAL_MATCH: "or-warn",
        POTENTIAL_GAP: "or-gap", PREPARATION_NEEDED: "or-gap",
        NOT_ENOUGH_INFO: "or-info", INSUFFICIENT_INFO: "or-info",
      };
      const cls = map[s] || "or-info";
      return `<span class="or-pill ${cls}">${esc(String(s || "").replace(/_/g, " "))}</span>`;
    }

    // ---- export helpers ----
    function fallbackCopy(text, done) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand("copy"); done && done(); } catch (e) {}
      ta.remove();
    }

    // Serialize an analysis object to clean, portable Markdown.
    function toMarkdown(a) {
      const L = [];
      const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
      L.push("# OfferReady \u2014 Preparation Plan");
      if (a.seniority) L.push("", "**Seniority:** " + clean(a.seniority));
      L.push("", "_Preparation guidance only \u2014 not a prediction of interview or offer outcomes._");

      if (a.roleSummary) L.push("", "## Role summary", "", clean(a.roleSummary));

      const core = (a.coreSkills || []).map((s) => typeof s === "string" ? s : s.name).filter(Boolean);
      if (core.length || (a.technologies || []).length) {
        L.push("", "## What this job requires");
        if (core.length) L.push("", "**Core skills:** " + core.join(", "));
        if ((a.technologies || []).length) L.push("", "**Technologies:** " + a.technologies.join(", "));
        (a.experienceRequirements || []).length && L.push("", "**Experience:**", ...a.experienceRequirements.map((e) => "- " + clean(e)));
      }

      if ((a.readiness || []).length) {
        L.push("", "## Your readiness", "", "| Dimension | Status | Role requires | You have | Gap |", "|---|---|---|---|---|");
        a.readiness.forEach((r) => L.push("| " + [r.dimension, String(r.status || "").replace(/_/g, " "), r.roleRequires, r.candidateHas, r.gap].map(clean).join(" | ") + " |"));
      }

      if ((a.potentialGaps || []).length) {
        L.push("", "## Potential gaps");
        a.potentialGaps.forEach((g) => {
          L.push("", "### " + clean(g.requirement));
          g.whatIsMissing && L.push("", "**Missing:** " + clean(g.whatIsMissing));
          g.whyItMatters && L.push("", "**Why it matters:** " + clean(g.whyItMatters));
          (g.whatToStudy || []).length && L.push("", "**Study:** " + g.whatToStudy.map(clean).join(", "));
          (g.whatToBuild || []).length && L.push("**Build:** " + g.whatToBuild.map(clean).join(", "));
          (g.whatToPractice || []).length && L.push("**Practice:** " + g.whatToPractice.map(clean).join(", "));
          g.interviewExpectation && L.push("", "**In the interview:** " + clean(g.interviewExpectation));
        });
      }

      if ((a.preparationPlan || []).length) {
        L.push("", "## Your preparation plan");
        a.preparationPlan.forEach((p) => {
          L.push("", "### Priority " + clean(p.priority) + " \u2014 " + clean(p.title));
          p.why && L.push("", clean(p.why));
          p.resource && p.resource.label && L.push("", "- Resource: " + clean(p.resource.label));
        });
      }

      if (a.nextStep) L.push("", "## Next step", "", clean(a.nextStep));
      L.push("", "---", "Generated by OfferReady \u00b7 https://klnjoy.github.io/offerready/");
      return L.join("\n") + "\n";
    }
  }

  // ---- Sample demo data (fictional AI Solutions Architect) ----
  const SAMPLE = {
    roleSummary: "Design and ship production GenAI systems for enterprise customers \u2014 RAG and agent applications on AWS, owning reliability and cost at scale, working directly with customers.",
    seniority: "Staff / Principal \u00b7 Forward-Deployed",
    coreSkills: [
      { name: "Python", type: "EXPLICIT" }, { name: "AWS", type: "EXPLICIT" },
      { name: "RAG", type: "EXPLICIT" }, { name: "Agents", type: "EXPLICIT" },
      { name: "System design", type: "EXPLICIT" },
    ],
    technologies: ["AWS Bedrock", "Kubernetes", "Snowflake"],
    experienceRequirements: ["Production AI applications", "Reliability + cost at scale", "Customer-facing delivery"],
    responsibilities: ["Architect RAG/agent apps", "Own reliability and cost", "Set patterns for teams"],
    interviewSignals: [
      { area: "System design (production RAG/agent platform)", type: "INFERRED", note: "expect an end-to-end design round" },
      { area: "Defend-your-decisions follow-ups", type: "INFERRED", note: "why this model / retrieval / tool" },
    ],
    resumeProvided: false,
    alignment: [],
    readiness: [
      { dimension: "Technical Skills", status: "PARTIAL_MATCH", roleRequires: "Python, AWS Bedrock, RAG, agents", candidateHas: "(sample) Python, AWS, RAG", gap: "Bedrock + agent production depth" },
      { dimension: "System Design", status: "PREPARATION_NEEDED", roleRequires: "Design GenAI platforms at scale", candidateHas: "component-level design", gap: "end-to-end + trade-offs at Staff level" },
      { dimension: "Resume Alignment", status: "INSUFFICIENT_INFO", roleRequires: "GenAI architect outcomes", candidateHas: "(no resume provided)", gap: "add a resume to see alignment" },
    ],
    potentialGaps: [
      { requirement: "AWS Bedrock agent development", whatIsMissing: "Evidence of production Bedrock agent implementation.",
        whyItMatters: "The role explicitly requires production GenAI and agent experience.",
        whatToStudy: ["Agent architecture", "Tool calling", "Security controls"], whatToBuild: ["A small agent workflow with guardrails"],
        whatToPractice: ["Architecture explanation", "Production troubleshooting"], interviewExpectation: "Expect to design and defend an agent architecture." },
    ],
    preparationPlan: [
      { priority: 1, title: "AWS Bedrock + production agents", why: "Biggest gap vs the JD's explicit GenAI/agent requirement.", skills: ["AWS Bedrock", "Agents"], resource: { label: "Amazon Bedrock", path: "GenAI-Topics/bedrock/index.html" } },
      { priority: 2, title: "System design at Staff level", why: "Architect roles are graded on end-to-end design + trade-offs.", skills: ["System Design"], resource: { label: "Requirements \u2192 Production", path: "Personal-SourceCode/Interview_Requirements_to_Production.html" } },
    ],
    offerReadyResources: [
      { label: "Amazon Bedrock", path: "GenAI-Topics/bedrock/index.html" },
      { label: "Building Agents \u2014 Deep Dive", path: "GenAI-Topics/agent-principles/index.html" },
      { label: "RAG", path: "GenAI-Topics/rag/index.html" },
    ],
    nextStep: "Start with: Amazon Bedrock + production agents (Priority 1).",
  };

  // Never leave the user staring at "Loading the analyzer…": if init() throws
  // for any reason, replace the placeholder with a clear, usable message and a
  // reload action instead of an indefinite loading state.
  function safeInit() {
    try { init(); }
    catch (e) {
      var app = document.getElementById("analyze-app");
      if (app && !app.dataset.mounted) {
        app.dataset.mounted = "1";
        app.innerHTML =
          '<div class="ip-card">' +
          '<div class="ip-q">The analyzer had trouble starting</div>' +
          '<p>Please reload the page to try again. Your saved analyses are not affected.</p>' +
          '<button class="ip-btn" type="button" onclick="location.reload()">Reload</button>' +
          "</div>";
      }
    }
  }

  if (document.readyState !== "loading") safeInit();
  else document.addEventListener("DOMContentLoaded", safeInit);
  if (window.document$) { try { window.document$.subscribe(safeInit); } catch (e) {} }

  // Belt-and-suspenders: if, for any timing/instant-nav reason, the placeholder
  // is still on the page shortly after load, force the mount. This guarantees
  // the user never sees an indefinite "Loading the analyzer…" state.
  function sweep() {
    var app = document.getElementById("analyze-app");
    if (app && !app.dataset.mounted) safeInit();
  }
  setTimeout(sweep, 800);
  setTimeout(sweep, 2500);
})();
