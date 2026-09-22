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

  function init() {
    const app = document.getElementById("analyze-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";

    const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // site base for resolving OfferReady resource links (…/offerready/)
    const base = (window.__md_scope && window.__md_scope.pathname ? window.__md_scope.pathname.replace(/[^/]*$/, "") : "/");

    renderForm();

    function renderForm(prefill) {
      app.innerHTML = "";
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
        renderResult(d.analysis, { model: d.model });
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

      // NEXT STEP + CTA
      const cta = el("div", "ip-card or-next");
      cta.appendChild(el("div", "ip-progress", "Next step"));
      cta.appendChild(el("div", "ip-q", esc(a.nextStep || "Start with your Priority 1 preparation area.")));
      const start = el("button", "ip-btn"); start.textContent = "Start preparation";
      const firstLink = (a.preparationPlan || []).map((p) => p.resource).find((r) => r && r.path);
      start.addEventListener("click", () => { if (firstLink) location.href = base + firstLink.path; else location.href = base + "Interview_Guide_Overview.html".replace(/^/, "Personal-SourceCode/"); });
      cta.appendChild(start);
      const again = el("button", "ip-btn ip-ghost"); again.textContent = "Analyze another job";
      again.addEventListener("click", () => renderForm());
      cta.appendChild(again);
      app.appendChild(cta);

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

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch (e) {} }
})();
