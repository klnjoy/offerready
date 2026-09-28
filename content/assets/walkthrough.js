/* Sample Readiness Walkthrough — interactive guided step-through (GitHub Pages,
   no backend). Turns the static worked example into a product experience: step
   through Job → Analyze → Readiness → Prepare → Track, one stage at a time, with
   a live progress bar. The prep plan is a real checklist persisted to
   localStorage; completing steps records to the shared Progress store. Mounts on
   #walkthrough-app, survives navigation.instant. Sample data is clearly labeled. */
(function () {
  "use strict";

  var STORE = "walkthrough_plan_v1";

  // The five stages of the OfferReady flow, as guided steps.
  var STAGES = [
    { key: "job", tag: "1 · The job", title: "Start with the job, not the content",
      body:
        "<p><strong>Sample role — AI Solutions Architect (Staff/Principal, Forward-Deployed).</strong></p>" +
        "<blockquote>Design and ship production GenAI systems for enterprise customers. Architect RAG and agent applications on <strong>AWS (Bedrock)</strong>, own reliability and cost at scale, work directly with customers to turn ambiguous needs into shipped solutions. Requires <strong>Python, AWS, RAG/agents, system design</strong>, and production experience. Snowflake and Kubernetes a plus.</blockquote>" +
        "<p class=\"wt-note\">The idea: most prep starts with \u201cstudy everything.\u201d OfferReady starts with <em>this</em> role — what it requires, where the gaps are, and what to prepare specifically.</p>" },

    { key: "analyze", tag: "2 · Job analysis", title: "Extract what the description actually signals",
      body:
        "<div class=\"wt-grid\">" +
        "<div><h4>Core skills</h4><ul><li>Python (production-grade)</li><li>AWS (esp. Bedrock)</li><li>RAG — retrieval design + tuning</li><li>Agents — tool use, orchestration</li><li>System design (GenAI at scale)</li></ul></div>" +
        "<div><h4>Technology signals</h4><ul><li>AWS Bedrock — managed models, guardrails</li><li>Kubernetes — serving / scaling</li><li>Snowflake — governed data (a plus)</li><li>Observability / LLMOps</li></ul></div>" +
        "<div><h4>Experience signals</h4><ul><li>Production AI apps, not prototypes</li><li>Reliability + cost ownership at scale</li><li>Customer-facing delivery (FDE)</li><li>Setting patterns (Staff/Principal)</li></ul></div>" +
        "<div><h4>Interview signals</h4><ul><li>System-design rounds</li><li>\u201cDefend your decisions\u201d follow-ups</li><li>Production-incident troubleshooting</li><li>Behavioral: ambiguity, influence</li></ul></div>" +
        "</div>" },

    { key: "readiness", tag: "3 · Readiness", title: "Score honestly across six dimensions",
      body:
        "<p class=\"wt-note\">Descriptive, not predictive — it shows what a strong candidate for <em>this</em> role demonstrates, so you know where to focus. Sample profile: strong Python + AWS + RAG; lighter on Bedrock production, K8s serving, Staff-level system design.</p>" +
        "<table class=\"wt-table\"><thead><tr><th>Dimension</th><th>Status</th><th>Likely gap</th></tr></thead><tbody>" +
        "<tr><td>Resume alignment</td><td>\uD83D\uDFE1 Partial</td><td>Bedrock/agent production wording, scale metrics</td></tr>" +
        "<tr><td>Technical skills</td><td>\uD83D\uDFE1 Partial</td><td>Bedrock + agent production depth</td></tr>" +
        "<tr><td>Relevant experience</td><td>\uD83D\uDFE2 Strong</td><td>Frame at architect scope</td></tr>" +
        "<tr><td>System design</td><td>\uD83D\uDD34 Gap</td><td>End-to-end + trade-offs at Staff level</td></tr>" +
        "<tr><td>Interview preparation</td><td>\uD83D\uDFE1 Partial</td><td>Role-specific banks</td></tr>" +
        "<tr><td>Behavioral / FDE</td><td>\uD83D\uDFE1 Partial</td><td>FDE customer framing</td></tr>" +
        "</tbody></table>" },

    { key: "prepare", tag: "4 · Prepare", title: "Turn gaps into an ordered plan",
      isPlan: true,
      body: "<p class=\"wt-note\">Tick these off as you go — saved in your browser. Each links to real study material on this site.</p>" },

    { key: "track", tag: "5 · Track", title: "Watch readiness move as you work the plan",
      body:
        "<p>In this sample, readiness moves from mostly \uD83D\uDFE1/\uD83D\uDD34 to \uD83D\uDFE2 as you complete the plan. Your ticked steps are saved and reflected on the <a href=\"../Personal-SourceCode/Interview_Progress.html\">Progress dashboard</a>.</p>" +
        "<p class=\"wt-note\">This walkthrough uses fixed <strong>sample data</strong>. A future Pro version would take <em>your</em> pasted job description and resume and generate <em>your</em> readiness and plan automatically.</p>" },
  ];

  // The prep plan checklist (stage 4). Links are site-relative from the
  // Sample-Walkthrough page (which lives one level under the site root).
  var PLAN = [
    { id: "p1", label: "Priority 1 — AWS Bedrock + production agents",
      why: "The biggest gap: the role explicitly requires production GenAI on Bedrock and agents.",
      links: [["Bedrock", "../GenAI-Topics/bedrock/index.html"], ["Agents deep-dive", "../GenAI-Topics/agent-principles/index.html"]] },
    { id: "p2", label: "Priority 2 — System design at Staff level",
      why: "Architect roles are graded on end-to-end design and named trade-offs, not components.",
      links: [["Requirements \u2192 Production", "../Personal-SourceCode/Interview_Requirements_to_Production.html"]] },
    { id: "p3", label: "Priority 3 — Reliability, cost & operations",
      why: "\u201cOwn reliability and cost at scale\u201d is in the JD.",
      links: [["Observability", "../GenAI-Topics/observability/index.html"], ["Cost Optimization", "../GenAI-Topics/cost-optimization/index.html"]] },
    { id: "p4", label: "Priority 4 — Customer-facing (FDE) + behavioral",
      why: "\u201cWork directly with customers to turn ambiguous needs into shipped solutions.\u201d",
      links: [["FDE path", "../Personal-SourceCode/Path_FDE.html"], ["Behavioral / STAR", "../Personal-SourceCode/Behavioral_STAR_Interview_QA.html"]] },
  ];

  function init() {
    var app = document.getElementById("walkthrough-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";

    var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    var load = function () { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } };
    var save = function (o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} };

    var i = 0;

    function recordProgress() {
      var done = load();
      var n = PLAN.filter(function (p) { return done[p.id]; }).length;
      try {
        if (window.OfferReadyProgress) {
          window.OfferReadyProgress.logActivity({
            type: "walkthrough", label: "Sample readiness walkthrough",
            role: "AI Solutions Architect",
            gaps: PLAN.filter(function (p) { return !done[p.id]; }).map(function (p) { return p.label; }),
          });
        }
      } catch (e) {}
      return n;
    }

    function renderPlan(container) {
      var done = load();
      PLAN.forEach(function (p) {
        var item = el("div", "wt-plan-item");
        var lab = el("label", "wt-plan-check");
        var cb = el("input"); cb.type = "checkbox"; cb.checked = !!done[p.id];
        cb.addEventListener("change", function () {
          var d = load(); d[p.id] = cb.checked; save(d);
          recordProgress();
          item.classList.toggle("wt-done", cb.checked);
        });
        lab.appendChild(cb);
        lab.appendChild(el("span", "wt-plan-label", p.label));
        item.appendChild(lab);
        item.appendChild(el("p", "wt-plan-why", p.why));
        var linkWrap = el("p", "wt-plan-links");
        p.links.forEach(function (lk, idx) {
          var a = el("a", null, lk[0]); a.href = lk[1];
          linkWrap.appendChild(a);
          if (idx < p.links.length - 1) linkWrap.appendChild(document.createTextNode(" \u00b7 "));
        });
        item.appendChild(linkWrap);
        if (done[p.id]) item.classList.add("wt-done");
        container.appendChild(item);
      });
    }

    function render() {
      var s = STAGES[i];
      app.innerHTML = "";

      // Stepper dots.
      var steps = el("div", "wt-steps");
      STAGES.forEach(function (stg, idx) {
        var dot = el("span", "wt-step" + (idx === i ? " wt-step-active" : "") + (idx < i ? " wt-step-done" : ""), String(idx + 1));
        dot.title = stg.tag;
        dot.addEventListener("click", function () { i = idx; render(); });
        steps.appendChild(dot);
      });
      app.appendChild(steps);

      // Progress bar.
      var pct = Math.round((i / (STAGES.length - 1)) * 100);
      var bar = el("div", "ip-bar"); bar.appendChild(el("div")); bar.firstChild.style.width = pct + "%";
      app.appendChild(bar);

      var card = el("div", "ip-card");
      card.appendChild(el("span", "ip-topic", s.tag));
      card.appendChild(el("h3", "wt-title", s.title));
      card.appendChild(el("div", "wt-body", s.body));
      if (s.isPlan) renderPlan(card);
      app.appendChild(card);

      var row = el("div", "ip-controls");
      if (i > 0) {
        var back = el("button", "ip-btn ip-ghost", "\u2190 Back");
        back.addEventListener("click", function () { i--; render(); });
        row.appendChild(back);
      }
      if (i < STAGES.length - 1) {
        var next = el("button", "ip-btn", "Next \u2192");
        next.addEventListener("click", function () { i++; render(); });
        row.appendChild(next);
      } else {
        var done = el("button", "ip-btn", "Start your Priority 1 \u2192");
        done.addEventListener("click", function () { window.location.href = "../GenAI-Topics/bedrock/index.html"; });
        row.appendChild(done);
        var restart = el("button", "ip-btn ip-ghost", "Restart walkthrough");
        restart.addEventListener("click", function () { i = 0; render(); });
        row.appendChild(restart);
      }
      app.appendChild(row);
    }

    render();
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch (e) {} }
})();
