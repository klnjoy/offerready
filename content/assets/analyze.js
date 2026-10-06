/* Analyze My Job — frontend for the OfferReady MVP.
   Static (GitHub Pages). Calls the serverless AI router at API_BASE/api/ai
   with { action: "analyze_jd" }.
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
    "Preparing your role overview\u2026",
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
    // AI SECURITY is for AI/LLM security roles (prompt injection, model
    // guardrails, agent threats) — NOT general data/infra security. A plain
    // data-security JD (Snowflake RBAC, data masking, CyberArk, audit,
    // compliance) was wrongly matching the bare word "security" here and
    // skipping the data rules below. So require either an unmistakable
    // AI-security phrase, OR the generic security word TOGETHER with an AI/LLM
    // signal. Otherwise fall through to the data/cloud/architecture rules.
    var aiSignal = /\b(ai|a\.i\.|genai|gen ai|llm|ml|machine learning|rag|agent|prompt|model|nlp)\b/.test(hay);
    var strongAiSec = /\bprompt injection|jailbreak|guardrail|owasp\s*(llm|top\s*10)?|model (security|poisoning)|adversarial|red.?team(ing)?\b/.test(hay);
    var genericSec = /\bsecurity|threat|zero.?trust\b/.test(hay);
    if (strongAiSec || (genericSec && aiSignal)) return "ai-security";
    if (/\bforward deployed|forward-deployed|\bfde\b|customer-facing|client-facing|solutions engineer\b/.test(hay)) return "fde";
    // DATA ENGINEERING first (spec): Data Engineer / Azure Data Engineer / Data
    // Platform Engineer and the pipeline/ETL/Spark/Databricks/streaming/quality
    // signals map to the Data Engineering family BEFORE Data Architecture. Only
    // genuinely architecture-leaning data roles fall through to data-architect.
    if (/\bdata engineer|data engineering|azure data|data platform engineer|databricks|spark|pipeline|data pipeline|etl|elt|ingestion|streaming|real-?time|data quality|lakehouse|airflow|dbt\b/.test(hay)) return "data-engineer";
    // Role-noun tiebreaker for data-PLATFORM roles (Snowflake/warehouse/data
    // platform): the family follows the ROLE NOUN, not the tech. A "Snowflake
    // (Data) Engineer" is Data Engineering; only an explicit "architect" (or
    // modeling-centric) role is Data Architecture. This stops a Snowflake
    // Engineer from being mislabeled "Data Architect" just because Snowflake
    // was historically an architect-only signal.
    var dataPlatformSignal = /\bsnowflake|warehouse|warehousing|cortex|data platform|redshift|bigquery\b/.test(hay);
    var saysArchitect = /\barchitect|architecture|data model|dimensional\b/.test(hay);
    var saysEngineer = /\bengineer\b/.test(hay);
    if (dataPlatformSignal && saysEngineer && !saysArchitect) return "data-engineer";
    if (/\bdata architect|analytics architect|snowflake|warehouse|warehousing|cortex|data platform|analytics engineer|data modeling|dimensional\b/.test(hay)) return "data-architect";
    // AI roles: decide engineer-vs-architect by the ROLE NOUN, not by the word
    // "architecture" appearing as a SKILL. "AI Engineer" with a skill like
    // "Multi-Agent / A2A architectures" is AI Engineering; only an explicit
    // ARCHITECT role noun (bounded \barchitect\b — doesn't match "architectures")
    // or an architecture-scope phrase (system design / multi-tenant) is AI
    // Architecture. These AI rules run before the generic cloud/platform rule so
    // an "AI ... platform" role isn't mislabeled Cloud/Platform.
    var aiEngSignal = /\bai engineer|genai|gen ai|ml engineer|rag|agent|agentic|langchain|langgraph|llm|nlp|prompt\b/.test(hay);
    var archRoleNoun = /\barchitect\b/.test(hay);
    var archScope = /\bsystem design|multi-?tenant|reference architecture\b/.test(hay);
    if (aiEngSignal) {
      if (archRoleNoun || archScope) return "ai-architect";
      return "ai-engineer";
    }
    if (/\bcloud|platform|devops|kubernetes|infrastructure|sre|reliability|terraform\b/.test(hay)) return "cloud-platform";
    if (/\barchitect|architecture|system design|multi-tenant|enterprise\b/.test(hay)) return "ai-architect";
    return null; // no confident match → don't force a filter
  }

  // Placeholder/junk role values that must NEVER be shown as the analyzed role.
  // The AI returns "Not specified"/"Unspecified" for seniority when it can't
  // determine a level; passing that through made the Defend page show
  // "Showing scenarios matched to your analyzed role: Not specified".
  var JUNK_ROLES = {
    "": 1, "not specified": 1, unspecified: 1, "n/a": 1, na: 1,
    none: 1, unknown: 1, untitled: 1,
  };
  function cleanRole(v) {
    var s = (v == null ? "" : String(v)).trim();
    if (!s) return "";
    return JUNK_ROLES[s.toLowerCase()] ? "" : s;
  }

  // Role-noun vocabulary + company-description hint, mirroring the server's
  // extractRoleFromSummary (api/_lib/jobs.js). The analysis.roleSummary is a
  // paragraph that often OPENS with a company blurb ("Datavations is a data and
  // AI software company..."), so we extract an actual role phrase instead of
  // blindly taking the first clause.
  var ROLE_NOUNS_SET = {
    engineer: 1, architect: 1, developer: 1, scientist: 1, analyst: 1,
    administrator: 1, consultant: 1, designer: 1, specialist: 1, manager: 1,
    lead: 1, director: 1, programmer: 1, strategist: 1, researcher: 1,
  };
  var COMPANY_HINT = /\b(is a|is an|we are|we're|company|startup|founded|headquarter|our mission|our team|about us|organization|organisation)\b/i;
  var ROLE_STOP = {
    a: 1, an: 1, the: 1, our: 1, their: 1, your: 1, this: 1, that: 1, for: 1,
    of: 1, to: 1, and: 1, or: 1, as: 1, with: 1, is: 1, are: 1, be: 1,
    seeking: 1, hiring: 1, seeks: 1, looking: 1, need: 1, needs: 1, wants: 1,
    want: 1, join: 1, company: 1, startup: 1, team: 1, role: 1, position: 1,
    who: 1, experienced: 1, strong: 1,
  };
  var SENIORITY_WORDS = { senior: 1, junior: 1, staff: 1, principal: 1, lead: 1, head: 1, chief: 1, mid: 1 };
  function isQualifier(tok) {
    if (!tok) return false;
    var bare = tok.replace(/[^A-Za-z0-9+/.#-]/g, "");
    if (!bare) return false;
    if (ROLE_STOP[bare.toLowerCase()]) return false;
    if (/^[A-Z]/.test(bare)) return true;
    if (SENIORITY_WORDS[bare.toLowerCase()]) return true;
    return false;
  }
  // Mirror of the server extractRoleFromSummary (api/_lib/jobs.js): find a role
  // noun, walk LEFT over qualifier tokens, stop at articles/verbs/company words.
  function extractRoleFromSummary(summary) {
    var text = (summary == null ? "" : String(summary)).trim();
    if (!text) return "";
    function fromClause(clause) {
      var raw = clause.trim();
      if (!raw) return "";
      var tokens = raw.split(/\s+/);
      for (var i = 0; i < tokens.length; i++) {
        var bare = tokens[i].replace(/[^A-Za-z]/g, "").toLowerCase();
        var singular = bare.replace(/s$/, "");
        if (ROLE_NOUNS_SET[bare] || ROLE_NOUNS_SET[singular]) {
          var start = i;
          while (start - 1 >= 0 && isQualifier(tokens[start - 1])) start--;
          if (start === i) continue;
          var phrase = tokens.slice(start, i + 1).join(" ").replace(/[^A-Za-z0-9+/.#\- ]/g, "").trim();
          var cand = cleanRole(phrase);
          if (cand) return cand.slice(0, 120);
        }
      }
      return "";
    }
    var clauses = text.split(/[.;:\n\u2014]|,\s(?=[A-Z])/);
    for (var j = 0; j < clauses.length; j++) {
      if (COMPANY_HINT.test(clauses[j])) continue;
      var r = fromClause(clauses[j]);
      if (r) return r;
    }
    for (var k = 0; k < clauses.length; k++) {
      var r2 = fromClause(clauses[k]);
      if (r2) return r2;
    }
    return "";
  }

  function hasRoleNoun(s) {
    var words = String(s == null ? "" : s).toLowerCase().split(/[^a-z]+/);
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (w && (ROLE_NOUNS_SET[w] || ROLE_NOUNS_SET[w.replace(/s$/, "")])) return true;
    }
    return false;
  }
  // Every word is a seniority level (handles "lead" being both a level and a
  // role noun) — so "Lead"/"Senior"/"Principal" alone is never a title.
  function isLevelOnly(s) {
    var words = String(s == null ? "" : s).trim().split(/[\s/]+/).filter(Boolean);
    if (!words.length) return false;
    for (var i = 0; i < words.length; i++) {
      if (!SENIORITY_WORDS[words[i].toLowerCase()]) return false;
    }
    return true;
  }
  function bareSeniority(s) {
    if (!isLevelOnly(s)) return "";
    var lvl = String(s).trim().split(/[\s/]+/).filter(Boolean)[0];
    return lvl.charAt(0).toUpperCase() + lvl.slice(1).toLowerCase();
  }

  // Derive a meaningful role title, mirroring the server's deriveJobTitle
  // (api/_lib/jobs.js) priority so the Defend page and the saved job agree:
  //   a. explicit targetRole the candidate provided
  //   b. analysis.seniority ONLY if it contains a role noun (not a bare level)
  //   c. a role phrase from analysis.roleSummary, prefixed with the bare level
  //      if seniority was just "Senior" etc. (-> "Senior Data Engineer")
  //   d. "" (caller decides the final fallback) — never "Not specified"
  // Conservative role from JD-derived signals (technologies/skills/responsi-
  // bilities) when no explicit role phrase exists. Mirrors the server's
  // deriveTitleFromSignals so a Snowflake/ETL/warehouse JD becomes e.g.
  // "Snowflake Data Engineer" instead of nothing.
  function signalText(a) {
    var parts = [];
    (a.technologies || []).forEach(function (t) { parts.push(String(t || "")); });
    (a.coreSkills || []).forEach(function (s) { parts.push(typeof s === "string" ? s : (s && s.name) || ""); });
    (a.preferredSkills || []).forEach(function (s) { parts.push(typeof s === "string" ? s : (s && s.name) || ""); });
    (a.responsibilities || []).forEach(function (r) { parts.push(typeof r === "string" ? r : (r && (r.title || r.requirement)) || ""); });
    if (a.roleSummary) parts.push(String(a.roleSummary));
    return parts.join(" ").toLowerCase();
  }
  function deriveTitleFromSignals(a, levelPrefix) {
    var hay = signalText(a || {});
    if (!hay.trim()) return "";
    var roleNoun = "";
    if (/\bdata engineer|etl|elt|data pipeline|pipeline|ingestion|data warehous|warehousing|lakehouse|spark|databricks\b/.test(hay)) roleNoun = "Data Engineer";
    else if (/\bdata architect|dimensional model|data modeling\b/.test(hay)) roleNoun = "Data Architect";
    else if (/\banalytics|tableau|power bi|looker|bi\b/.test(hay) && /\bsql|warehouse|etl|elt\b/.test(hay)) roleNoun = "Analytics Engineer";
    else if (/\brag|llm|genai|gen ai|agent|prompt|embedding|vector\b/.test(hay)) roleNoun = "AI Engineer";
    else if (/\bml engineer|machine learning|model training|mlops\b/.test(hay)) roleNoun = "ML Engineer";
    else if (/\bkubernetes|terraform|devops|infrastructure|sre|ci\/cd|platform\b/.test(hay)) roleNoun = "Platform Engineer";
    else if (/\bsql|snowflake|bigquery|redshift|analytics|reporting\b/.test(hay)) roleNoun = "Data Engineer";
    if (!roleNoun) return "";
    var qualifier = "";
    if (/data engineer|data architect/i.test(roleNoun)) {
      if (/\bsnowflake\b/.test(hay)) qualifier = "Snowflake";
      else if (/\bdatabricks\b/.test(hay)) qualifier = "Databricks";
      else if (/\bazure\b/.test(hay)) qualifier = "Azure";
      else if (/\baws\b/.test(hay)) qualifier = "AWS";
    }
    var parts = [];
    if (levelPrefix) parts.push(levelPrefix);
    if (qualifier) parts.push(qualifier);
    parts.push(roleNoun);
    return parts.join(" ");
  }

  function deriveRoleTitle(targetRole, analysis) {
    var a = analysis || {};
    // Explicit role ONLY when it names a role; a bare level ("Senior") is a
    // prefix, never a title on its own.
    var explicit = cleanRole(targetRole);
    if (explicit && hasRoleNoun(explicit) && !isLevelOnly(explicit)) return explicit.slice(0, 200);
    var parsed = cleanRole(a.seniority);
    if (parsed && hasRoleNoun(parsed) && !isLevelOnly(parsed)) return parsed.slice(0, 200);
    var levelPrefix = bareSeniority(explicit) || bareSeniority(a.seniority);
    var role = extractRoleFromSummary(a.roleSummary);
    if (role) {
      var alreadyLeveled = levelPrefix && role.toLowerCase().indexOf(levelPrefix.toLowerCase()) === 0;
      var full = (levelPrefix && !alreadyLeveled) ? (levelPrefix + " " + role) : role;
      return full.slice(0, 120);
    }
    var fromSignals = deriveTitleFromSignals(a, levelPrefix);
    if (fromSignals) return fromSignals.slice(0, 120);
    return "";
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
      // Seniority is stored ONLY as supplementary context, never as a role. A
      // BARE level ("Senior"/"Lead"/"Principal") is scrubbed to "" here so the
      // Defend page can never fall back to showing just "Senior" as the role —
      // the complete role already lives in `role` (deriveRoleTitle).
      var sen = cleanRole(analysis && analysis.seniority);
      if (sen && bareSeniority(sen)) sen = "";
      localStorage.setItem("offerready.defendRole.v1",
        JSON.stringify({
          category: category,
          role: role || "",
          seniority: sen,
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
        const resp = await fetch(API_BASE.replace(/\/$/, "") + "/api/ai", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({ action: "analyze_jd" }, payload)),
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
        // Use the derived role title (never the raw "Not specified" seniority).
        saveDefendRole(inferScenarioCategory(d.analysis, payload.targetRole), deriveRoleTitle(payload.targetRole, d.analysis), d.analysis);
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

      // Tracks whether THIS analyzed role is already saved as a job. If it was
      // saved (here or earlier this render), Check My Fit routes straight to the
      // existing Gap Analysis page without asking the user to save again.
      var checkFitState = { savedJobId: (meta.savedJobId || null) };

      // Save-first Check My Fit: if already saved, set active + route to the
      // existing Gap-Analysis page. If not saved, POST to the existing /api/jobs
      // (same contract as the Save-to-My-Jobs button), set the new job active,
      // then route. Never routes on failure; never claims success before the
      // server confirms; preserves the free-tier/entitlement behavior (403).
      function goToCheckFit() {
        if (window.OfferReadyReadiness && window.OfferReadyReadiness.setActiveJob && checkFitState.savedJobId) {
          window.OfferReadyReadiness.setActiveJob(checkFitState.savedJobId);
        }
        location.href = base + "Gap-Analysis/index.html";
      }
      function saveThenCheckFit(analysis, m, btn, msg) {
        // Already saved → no duplicate save; go straight to Check My Fit.
        if (checkFitState.savedJobId) { goToCheckFit(); return; }
        if (!API_BASE) { msg.textContent = "Saving isn't enabled on this site yet."; return; }
        if (!window.OfferReadyAuth) { msg.textContent = "Sign-in isn't available yet."; return; }
        btn.disabled = true; msg.textContent = "Saving\u2026";
        window.OfferReadyAuth.getAccessToken().then((token) => {
          if (!token) { btn.disabled = false; msg.innerHTML = 'Please <a href="' + base + 'My-Jobs/index.html">sign in</a> to save this job and check your fit.'; return; }
          const inp = m.input || {};
          const payload = {
            analysis: analysis,
            title: inp.targetRole || analysis.seniority || "",
            jobDescription: inp.jobDescription || "",
            model: m.model || "",
          };
          fetch(API_BASE.replace(/\/$/, "") + "/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify(payload),
          }).then((r) => r.json().catch(() => ({})).then((j) => ({ status: r.status, body: j })))
            .then((res) => {
              if (res.status === 201) {
                var savedJob = res.body && res.body.job;
                if (savedJob && savedJob.id) {
                  checkFitState.savedJobId = savedJob.id;
                  if (window.OfferReadyReadiness && window.OfferReadyReadiness.setActiveJob) {
                    window.OfferReadyReadiness.setActiveJob(savedJob.id);
                  }
                }
                msg.textContent = "Saved \u2713 \u2014 opening Check My Fit\u2026";
                goToCheckFit();
              } else if (res.status === 403 && res.body && res.body.upgrade) {
                // Free-tier limit reached — preserve existing entitlement message; do NOT route.
                btn.disabled = false;
                msg.innerHTML = "Free includes one saved job. <a href='" + base + "assets/pricing.html'>Upgrade to Pro</a> to save more, or open <a href='" + base + "My-Jobs/index.html'>My Jobs</a> to Check My Fit on an existing job.";
              } else if (res.status === 401) {
                btn.disabled = false;
                msg.innerHTML = 'Please <a href="' + base + 'My-Jobs/index.html">sign in</a> to save this job and check your fit.';
              } else {
                btn.disabled = false;
                msg.textContent = (res.body && res.body.error) || "Couldn't save this job. Please try again.";
              }
            }).catch(() => { btn.disabled = false; msg.textContent = "Couldn't reach the server. Please try again."; });
        }).catch(() => { btn.disabled = false; msg.textContent = "Couldn't check your sign-in. Please try again."; });
      }

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
        // Show the FULL derived role title (level + role noun, e.g. "Senior
        // Snowflake Data Engineer"), never a bare level word like "Senior".
        // deriveRoleTitle combines the explicit target role, analysis.seniority,
        // the role phrase in roleSummary, and JD signals the same way the saved
        // job + Defend page do, so this chip agrees with the rest of the app.
        var roleTitle = deriveRoleTitle((meta.input && meta.input.targetRole) || "", a);
        if (roleTitle) {
          w.appendChild(el("span", "ip-topic", esc(roleTitle)));
        } else if (a.seniority && !isLevelOnly(a.seniority)) {
          // Only fall back to raw seniority when it names a role (not a bare level).
          w.appendChild(el("span", "ip-topic", esc(a.seniority)));
        }
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

      // INITIAL ALIGNMENT (only if resume provided). This is a first-pass,
      // resume-optional view on the Analyze page. The blended "Interview
      // Readiness" lives on the Dashboard; Resume Match lives in Gap Analysis.
      if (a.resumeProvided && (a.alignment || []).length) {
        section("Initial alignment", () => tableRows(
          ["Requirement", "Status", "Evidence in resume"],
          a.alignment.map((r) => [esc(r.requirement), statusPill(r.status, true), esc(r.evidence)])
        ));
      }

      // ROLE EXPECTATIONS BY DIMENSION (not a readiness score — Analyze explains
      // what the role expects across the four dimensions; it does not blend a
      // readiness number here).
      if ((a.readiness || []).length) {
        section("What the role expects", () => {
          const tbl = tableRows(
            ["Dimension", "Status", "Role requires", "Found in resume", "Gap"],
            a.readiness.map((r) => [esc(r.dimension), statusPill(r.status, a.resumeProvided), esc(r.roleRequires), esc(r.candidateHas), esc(r.gap)])
          );
          // When no resume was in this analysis, explain the "Resume not
          // compared" rows so they don't read as a negative assessment.
          if (!a.resumeProvided) {
            const wrap = el("div");
            wrap.appendChild(el("p", "ip-ai-hint",
              "A resume was not included in this analysis. Save the role and use <strong>Check My Fit</strong> to compare your resume evidence with the job requirements."));
            wrap.appendChild(tbl);
            return wrap;
          }
          return tbl;
        });
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

      // NEXT STEP: CHECK MY FIT — the primary action after understanding the
      // role. Placed BEFORE Resources and Defend so the recommended next step is
      // the most prominent thing after the analysis. Save-first: it saves the
      // role (if not already saved), sets it active, then routes to the existing
      // Gap Analysis (Check My Fit) page. No new route/feature — reuses
      // /api/jobs + the active-job pointer + the Gap-Analysis page.
      if (!meta.shared && !meta.demo) {
        section("Next step", () => {
          const w = el("div", "or-next-fit");
          w.appendChild(el("h3", null, "Check My Fit"));
          w.appendChild(el("p", null,
            "Compare your resume evidence with this role to identify your strengths, missing evidence, and highest-priority preparation areas."));
          const row = el("div", "or-actions");
          const fitBtn = el("button", "ip-btn or-cta-primary"); fitBtn.type = "button";
          fitBtn.textContent = checkFitState.savedJobId ? "Check My Fit" : "Save Job and Check My Fit";
          const fitMsg = el("span", "or-save-msg");
          fitBtn.addEventListener("click", () => saveThenCheckFit(a, meta, fitBtn, fitMsg));
          row.appendChild(fitBtn);
          w.appendChild(row);
          w.appendChild(fitMsg);
          // Future steps — brief supporting text only (NOT equal primary buttons).
          w.appendChild(el("p", "ip-ai-hint",
            "After you check your fit: prepare role-specific questions, practice decision defense, then measure Interview Readiness."));
          return w;
        });
      }

      // RELEVANT OFFERREADY RESOURCES
      // DEFEND A DECISION FOR THIS ROLE — route the analyzed job straight into
      // the matching defend-your-decision scenarios (the paid differentiator).
      // Defend stays visible but comes AFTER the primary Check My Fit next step.
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

      // RELEVANT OFFERREADY RESOURCES — supporting material, after the primary
      // next step and Defend (lower visual priority than Check My Fit).
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

      // Secondary control: analyze another job (the primary next step is the
      // Check My Fit section above). Kept as a quiet action, not a rival CTA.
      const cta = el("div", "ip-card or-actions");
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
                  // Make this the active job so Gap Analysis / Questions /
                  // Dashboard all operate on it (job-rooted, cross-device).
                  var savedJob = res.body && res.body.job;
                  if (savedJob && savedJob.id) {
                    // Keep the Check My Fit CTA in sync so it won't save again.
                    checkFitState.savedJobId = savedJob.id;
                    if (window.OfferReadyReadiness && window.OfferReadyReadiness.setActiveJob) {
                      window.OfferReadyReadiness.setActiveJob(savedJob.id);
                    }
                  }
                  saveMsg.innerHTML = "Saved \u2713 \u2014 next: <a href='" + base + "Gap-Analysis/index.html'>Check My Fit</a> \u00b7 <a href='" + base + "Question-Bank/index.html'>questions</a> \u00b7 <a href='" + base + "My-Jobs/index.html'>My Jobs</a>";
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
    function statusPill(s, resumeProvided) {
      const map = {
        MATCHED: "or-ok", STRONG_MATCH: "or-ok",
        PARTIAL: "or-warn", PARTIAL_MATCH: "or-warn",
        POTENTIAL_GAP: "or-gap", PREPARATION_NEEDED: "or-gap",
        NOT_ENOUGH_INFO: "or-info", INSUFFICIENT_INFO: "or-info",
      };
      const cls = map[s] || "or-info";
      // When no resume was supplied, an insufficient-info status means no
      // comparison was performed — show user-centered "Resume not compared"
      // instead of a negative-looking "INSUFFICIENT INFO". We only relabel the
      // DISPLAY; the underlying AI status enum is unchanged. A resume that WAS
      // provided keeps its real status (e.g. a genuine gap), so "evidence not
      // found" stays distinct from "resume not provided".
      const insufficient = s === "INSUFFICIENT_INFO" || s === "NOT_ENOUGH_INFO";
      if (insufficient && !resumeProvided) {
        return `<span class="or-pill or-info">Resume not compared</span>`;
      }
      const label = esc(String(s || "").replace(/_/g, " "));
      return `<span class="or-pill ${cls}">${label}</span>`;
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
