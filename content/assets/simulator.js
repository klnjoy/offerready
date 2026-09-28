/* Master Interview Simulator — interactive mock-loop engine (GitHub Pages, no
   backend). Turns the static question bank into a real mock: pick a level +
   area, get questions one at a time, answer out loud/timed, reveal what's
   tested + strong/weak patterns + expected depth, self-rate 1-5, then face the
   follow-up. Session summary + per-area strength are recorded to the shared
   Progress store. Mounts on #simulator-app, survives navigation.instant.
   Self-contained: the bank below mirrors the written Q&A on this page. */
(function () {
  "use strict";

  // Question bank — mirrors the ??? question items written on this page.
  // level: "Senior" | "Staff" | "Principal" | "FDE"; area groups for filtering.
  var BANK = [
    { area: "AI fundamentals & LLMs", topic: "LLMs", level: "Senior",
      q: "RAG vs fine-tuning — when do you use each?",
      tested: "Grounding vs training judgment.",
      strong: [
        "RAG for factual / fresh / cited knowledge — you update the index, not the weights.",
        "Fine-tune for behavior, format, or style, not for adding knowledge.",
        "Names the freshness / provenance trade-off; knows they can be combined.",
      ],
      weak: ['"Fine-tune to add knowledge"; no trade-off; treats them as interchangeable.'],
      followup: "Docs change hourly — which do you pick? → RAG + incremental re-index.",
      depth: "Should reach eval: how you'd measure which is better." },

    { area: "AI fundamentals & LLMs", topic: "LLMs", level: "Staff",
      q: "How do you choose a model per request in production?",
      tested: "Cost / quality / latency trade-off at scale.",
      strong: [
        "Model routing — cheap model for easy requests, strong model for hard ones.",
        "Justified by an eval set per request class; fallback on failure.",
        "Safe upgrades: pin → eval → canary before flipping traffic.",
      ],
      weak: ['"Use the best model" (ignores cost/latency); no eval.'],
      followup: "How do you classify a request as 'hard'? → cheap classifier / heuristic validated against outcomes.",
      depth: "Ties routing to measured cost/quality, not vibes." },

    { area: "RAG", topic: "RAG", level: "Senior",
      q: "Design a RAG assistant over internal docs.",
      tested: "The full retrieval pipeline.",
      strong: [
        "Chunk (semantic) → embed → hybrid search → rerank → assemble within budget.",
        "Answer only from context, with citations; per-user access enforced at retrieval.",
        "An eval set covering recall@k + faithfulness.",
      ],
      weak: ['"Embed and search" with no hybrid/rerank/eval; no citations; no access control.'],
      followup: "It cites the wrong doc — where do you look? → retrieval problem first; log the top-k.",
      depth: "Separates retrieval eval from answer eval." },

    { area: "RAG", topic: "RAG", level: "Staff",
      q: "Retrieval quality dropped after an ingestion change. Diagnose it.",
      tested: "Operating RAG in production.",
      strong: [
        "Correlate the drop with the change; inspect top-k for affected queries.",
        "Check chunking / embedding / index; roll back the change.",
        "Add retrieval eval in CI so it can't regress silently again.",
      ],
      weak: ["Tweaks the prompt (it's a retrieval bug); no eval gate."],
      followup: "Answers are grounded but wrong — cause? → retrieval miss, not prompting.",
      depth: "Names recall@k as the gating metric." },

    { area: "Agents & MCP", topic: "Agents", level: "Senior",
      q: "When do you use an agent vs a fixed pipeline?",
      tested: "Knowing agents add cost and risk.",
      strong: [
        "Agent when the path depends on intermediate results.",
        "Fixed chain when the steps are known — cheaper and more reliable.",
        "Always bound the loop.",
      ],
      weak: ['"Agents for everything"; no bounds.'],
      followup: "How do you stop a runaway loop? → step cap + repeated-action detection + budget.",
      depth: "Should mention eval (outcome + trajectory)." },

    { area: "Agents & MCP", topic: "Agents", level: "Staff",
      q: "Design an agent that can take destructive actions safely.",
      tested: "Least privilege + gating.",
      strong: [
        "Read tools open; write tools go propose → validate (server-side) → approve.",
        "Idempotency keys; bounded loop; full audit trail.",
        "Treat tool output text as data, never as instructions.",
      ],
      weak: ["A broad tool with a `mode` arg; trusts the model to self-limit."],
      followup: "Tool output says 'ignore instructions' — what now? → injection; it's gated regardless.",
      depth: "The LLM proposes, a deterministic layer executes." },

    { area: "Agents & MCP", topic: "MCP / Security", level: "Staff",
      q: "How do you secure third-party MCP servers?",
      tested: "AI supply-chain security.",
      strong: [
        "Allowlist; pin/sign and re-review on change (rug pull / tool poisoning).",
        "Least-privilege short-lived creds inside the server; sandbox + egress allowlist.",
        "Audit everything; treat tool descriptions as untrusted.",
      ],
      weak: ['"Just connect trusted servers"; no version pinning; creds in the prompt.'],
      followup: "How would you detect exfiltration? → egress allowlist + audit + DLP.",
      depth: "Distinguishes tool-poisoning from a malicious server." },

    { area: "Security", topic: "AI Security", level: "Staff",
      q: "What's your top security concern for an agent, and how do you contain it?",
      tested: "Prompt-injection understanding.",
      strong: [
        "Indirect prompt injection via retrieved / tool content is the top risk.",
        "Contain with architecture: least-privilege gated tools, output guardrails, egress control.",
        "Not with prompt wording — that's not a control.",
      ],
      weak: ['Only mentions direct injection; "tell the model to ignore bad input."'],
      followup: "Why gate even with guardrails? → defense in depth; guardrails have false negatives.",
      depth: "Reaches detect / respond (audit, kill switch)." },

    { area: "Data & cloud", topic: "Snowflake", level: "Senior",
      q: "A dashboard got slow after data grew 10x (Snowflake). Diagnose it.",
      tested: "Query performance.",
      strong: [
        "Read the Query Profile: poor pruning (cluster on the filter column).",
        "Spill to disk (size up the warehouse); exploding joins (check grain).",
        "Verify from QUERY_HISTORY, don't guess.",
      ],
      weak: ['"Add an index" (Snowflake has none); guesses without the profile.'],
      followup: "Why cluster, not index? → micro-partition pruning is the mechanism.",
      depth: "Knows clustering has a cost and when it doesn't pay off." },

    { area: "Data & cloud", topic: "Spark", level: "Senior",
      q: "A Spark job passes on a sample but hangs at scale.",
      tested: "Distributed-data debugging.",
      strong: [
        "Data skew in a shuffle; Spark UI shows one lagging task.",
        "Fix with AQE skew-join / broadcast / salting.",
        "Check partition sizing and spill.",
      ],
      weak: ['"Add more memory/executors" without diagnosing skew.'],
      followup: "What is a shuffle? → cross-network redistribution; the expensive part.",
      depth: "Picks the cheapest fix first (AQE/broadcast before salt)." },

    { area: "Data & cloud", topic: "Pipelines", level: "Staff",
      q: "Design a near-real-time Oracle → warehouse pipeline with history.",
      tested: "Pipeline system design.",
      strong: [
        "Log-based CDC → staging → idempotent MERGE to current + timestamped history (SCD2).",
        "Quality gates; dead-letter queue; lookback window for late data.",
      ],
      weak: ["Query-based CDC (misses deletes); blind inserts (dupes on retry)."],
      followup: "No reliable updated_at column? → log-based CDC.",
      depth: "Idempotency + late-arriving data handled explicitly." },

    { area: "Production, ops & reliability", topic: "Reliability", level: "Staff",
      q: "One model provider goes down at peak. What happens?",
      tested: "Reliability design.",
      strong: [
        "Timeouts stop hangs; circuit breaker fails fast.",
        "Fallback to an alternate provider/region or a cheaper/cached answer.",
        "Backoff + jitter on retries; multi-provider config to prevent it.",
      ],
      weak: ['"Retry until it works" (thundering herd, no jitter, no fallback).'],
      followup: "Why jitter? → avoid a synchronized retry storm.",
      depth: "Distinguishes mitigate (now) from prevent (failover)." },

    { area: "Production, ops & reliability", topic: "AI CI/CD", level: "Staff",
      q: "A prompt change passed unit tests but answers got worse. How does CI catch it?",
      tested: "AI CI/CD.",
      strong: [
        "Unit tests can't see quality — you need a golden + regression eval as a gate.",
        "Plus an injection suite; canary + rollback.",
      ],
      weak: ['"Add more unit tests"; treats tests-pass as safe.'],
      followup: "Why regression on top of golden? → absolute scores can look fine while worse than prod.",
      depth: "Knows prompts/models are versioned, gated artifacts." },

    { area: "Production, ops & reliability", topic: "Serving / K8s", level: "Senior",
      q: "A model-server pod is CrashLoopBackOff. Debug it.",
      tested: "K8s + serving ops.",
      strong: [
        "describe / logs --previous first.",
        "Classic causes: liveness probe firing during slow model load (raise initialDelay / add startup probe), or OOMKilled (raise memory limit).",
      ],
      weak: ["Bumps restart count without finding root cause."],
      followup: "requests vs limits? → schedule vs cap (throttle / OOM).",
      depth: "Ties probe timing to model-load cold start." },

    { area: "System design (flagship)", topic: "System Design", level: "Principal",
      q: "Design an enterprise AI assistant for 100k employees.",
      tested: "Full end-to-end design + your level.",
      strong: [
        "Clarify scale / latency / data-sensitivity first.",
        "Agent + gated tools; per-user access at retrieval; security (indirect injection).",
        "Reliability, observability, cost levers, eval-gated CI/CD — each with a named trade-off.",
        "Principal: adds build-vs-buy, cost/TCO, governance, org standards; reframes the real need.",
      ],
      weak: ["Jumps to a diagram without clarifying; no security/cost/eval."],
      followup: "HR data leaked cross-user — fix? → per-user ACL at retrieval + DLP.",
      depth: "Every box defended with mechanism + trade-off." },

    { area: "FDE / customer", topic: "FDE", level: "FDE",
      q: "A customer wants 'AI to help support' but the ask is vague. What do you do?",
      tested: "Ambiguity + customer judgment.",
      strong: [
        "Clarifying questions that scope it: which tickets, data access, reversible actions, success metric.",
        "Propose a thin shippable slice; integrate with their messy systems.",
        "Explain trade-offs to a non-engineer.",
      ],
      weak: ["Starts building a grand system; no clarifying; ignores their constraints."],
      followup: "Their data is a mess — now what? → the implementation gap; pragmatic ingestion + validation.",
      depth: "Ties the build to the customer's outcome, not tech for its own sake." },
  ];

  var LEVELS = ["Mixed", "Senior", "Staff", "Principal", "FDE"];

  function init() {
    var app = document.getElementById("simulator-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";

    var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
    var md = function (s) { return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"); };

    var areas = [];
    BANK.forEach(function (b) { if (areas.indexOf(b.area) === -1) areas.push(b.area); });

    var st = null; // active run

    function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

    function renderSetup() {
      app.innerHTML = "";
      app.appendChild(el("p", null,
        "Run a <strong>mock loop</strong>: questions jump across areas and levels like a real onsite. " +
        "For each, answer <strong>out loud and timed (~2&nbsp;min)</strong>, then reveal what's tested, the strong vs weak patterns, and the expected depth. " +
        "Rate yourself honestly, then face the follow-up. Your scores are saved locally and feed the Progress dashboard."));

      var setup = el("div", "ip-setup");

      // Level picker
      var lvlCard = el("div", "ip-track");
      lvlCard.appendChild(el("h3", null, "1 · Target level"));
      var lvlSel = el("select", "ip-select");
      LEVELS.forEach(function (lv) { var o = el("option", null, esc(lv)); o.value = lv; lvlSel.appendChild(o); });
      lvlCard.appendChild(lvlSel);
      lvlCard.appendChild(el("p", null, "Mixed pulls every level, like a real loop."));
      setup.appendChild(lvlCard);

      // Area picker
      var areaCard = el("div", "ip-track");
      areaCard.appendChild(el("h3", null, "2 · Areas"));
      var checks = [];
      var allWrap = el("div", "ip-area-checks");
      areas.forEach(function (a) {
        var id = "sim-area-" + a.replace(/[^a-z]/gi, "");
        var lab = el("label", "ip-check");
        var cb = el("input"); cb.type = "checkbox"; cb.checked = true; cb.value = a; cb.id = id;
        lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + a));
        allWrap.appendChild(lab); checks.push(cb);
      });
      areaCard.appendChild(allWrap);
      setup.appendChild(areaCard);

      // Length picker
      var lenCard = el("div", "ip-track");
      lenCard.appendChild(el("h3", null, "3 · Length"));
      var lenSel = el("select", "ip-select");
      [["3", "Quick (3)"], ["5", "Standard (5)"], ["8", "Full loop (8)"]].forEach(function (p) {
        var o = el("option", null, p[1]); o.value = p[0]; lenSel.appendChild(o);
      });
      lenSel.value = "5";
      lenCard.appendChild(lenSel);
      lenCard.appendChild(el("p", null, "Answer out loud. Don't skip the follow-up — that's where loops separate candidates."));
      setup.appendChild(lenCard);

      app.appendChild(setup);

      var startRow = el("div", "ip-controls");
      var startBtn = el("button", "ip-btn", "Start mock \u2192");
      startBtn.addEventListener("click", function () {
        var lvl = lvlSel.value;
        var picked = checks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
        if (!picked.length) { picked = areas.slice(); }
        var pool = BANK.filter(function (b) {
          return picked.indexOf(b.area) !== -1 && (lvl === "Mixed" || b.level === lvl);
        });
        if (!pool.length) { pool = BANK.filter(function (b) { return picked.indexOf(b.area) !== -1; }); }
        var n = Math.min(parseInt(lenSel.value, 10) || 5, pool.length);
        var qs = shuffle(pool).slice(0, n);
        st = { qs: qs, i: 0, ratings: [], level: lvl };
        renderQ();
      });
      startRow.appendChild(startBtn);
      app.appendChild(startRow);
    }

    function renderQ() {
      var item = st.qs[st.i];
      app.innerHTML = "";
      var card = el("div", "ip-card");
      var pct = Math.round((st.i / st.qs.length) * 100);
      card.appendChild(el("div", "ip-progress", "Question " + (st.i + 1) + " of " + st.qs.length + " \u00b7 " + esc(item.area) + " \u00b7 " + esc(item.level)));
      var bar = el("div", "ip-bar"); bar.appendChild(el("div")); bar.firstChild.style.width = pct + "%"; card.appendChild(bar);
      card.appendChild(el("span", "ip-topic", esc(item.topic)));

      // Timer (counts up; ~2 min target, no penalty).
      var timer = el("div", "ip-timer", "00:00");
      card.appendChild(timer);
      var start = Date.now();
      var tick = setInterval(function () {
        var s = Math.floor((Date.now() - start) / 1000);
        var mm = String(Math.floor(s / 60)).padStart(2, "0");
        var ss = String(s % 60).padStart(2, "0");
        timer.textContent = mm + ":" + ss;
        if (s >= 120) timer.classList.add("ip-timer-over");
      }, 1000);

      card.appendChild(el("div", "ip-q", "\uD83E\uDDD1\u200D\uD83D\uDCBC " + esc(item.q)));
      var ta = el("textarea", "ip-answerbox"); ta.placeholder = "Answer out loud (or type notes), then reveal what a strong answer covers.";
      card.appendChild(ta);

      var row = el("div", "ip-controls");
      var reveal = el("button", "ip-btn", "Reveal what's tested \u2192");
      row.appendChild(reveal); card.appendChild(row);
      var body = el("div"); card.appendChild(body);

      reveal.addEventListener("click", function () {
        reveal.disabled = true;
        clearInterval(tick);
        var strongList = item.strong.map(function (p) { return "<li>" + md(p) + "</li>"; }).join("");
        var weakList = item.weak.map(function (p) { return "<li>" + md(p) + "</li>"; }).join("");
        body.appendChild(el("div", "ip-model",
          "<p class=\"ip-tested\"><strong>What's tested:</strong> " + md(item.tested) + "</p>" +
          "<h4>A strong answer shows</h4><ul>" + strongList + "</ul>" +
          "<h4 class=\"ip-weak-h\">Weak patterns to avoid</h4><ul class=\"ip-weak\">" + weakList + "</ul>" +
          "<p class=\"ip-depth\"><strong>Expected depth:</strong> " + md(item.depth) + "</p>"));

        // Self-rate
        body.appendChild(el("div", "ip-progress", "How close was your spoken answer?"));
        var rateRow = el("div", "ip-controls ip-rate");
        [[1, "1 · Missed it"], [2, "2 · Shaky"], [3, "3 · Solid"], [4, "4 · Strong"], [5, "5 · Nailed it"]].forEach(function (r) {
          var b = el("button", "ip-btn ip-ghost", esc(r[1]));
          b.addEventListener("click", function () {
            st.ratings.push({ area: item.area, topic: item.topic, rating: r[0] });
            showFollowup();
          });
          rateRow.appendChild(b);
        });
        body.appendChild(rateRow);

        function showFollowup() {
          // Remove the rating row once chosen.
          rateRow.remove();
          body.appendChild(el("div", "ip-model ip-followup",
            "<h4>\uD83D\uDD01 Follow-up (don't stall)</h4><p>" + md(item.followup) + "</p>"));
          var nrow = el("div", "ip-controls");
          if (st.i < st.qs.length - 1) {
            var next = el("button", "ip-btn", "Next question \u2192");
            next.addEventListener("click", function () { st.i++; renderQ(); });
            nrow.appendChild(next);
          } else {
            var fin = el("button", "ip-btn", "See results \u2192");
            fin.addEventListener("click", finish);
            nrow.appendChild(fin);
          }
          var quit = el("button", "ip-btn ip-ghost", "End mock");
          quit.addEventListener("click", finish);
          nrow.appendChild(quit);
          body.appendChild(nrow);
        }
      });

      app.appendChild(card);
      setTimeout(function () { ta.focus(); }, 30);
    }

    function finish() {
      var ratings = st.ratings;
      var answered = ratings.length;
      // Score = average self-rating mapped to 0-100.
      var avg = answered ? ratings.reduce(function (s, r) { return s + r.rating; }, 0) / answered : 0;
      var score = Math.round((avg / 5) * 100);

      // Per-area strength (avg rating -> pct) for the dashboard topic bars.
      var byArea = {};
      ratings.forEach(function (r) { (byArea[r.topic] = byArea[r.topic] || []).push(r.rating); });
      var topics = {};
      Object.keys(byArea).forEach(function (k) {
        var arr = byArea[k];
        topics[k] = Math.round((arr.reduce(function (a, b) { return a + b; }, 0) / arr.length / 5) * 100);
      });

      try {
        if (window.OfferReadyProgress && answered) {
          window.OfferReadyProgress.record({
            mode: "exam", track: "Master Simulator",
            topic: st.level === "Mixed" ? "Mixed loop" : st.level,
            score: score, n: answered, topics: topics,
          });
        }
      } catch (e) {}

      app.innerHTML = "";
      var wrap = el("div", "ip-card ip-summary");
      wrap.appendChild(el("div", "ip-score", answered ? score + "%" : "\u2014"));
      wrap.appendChild(el("p", null, answered
        ? "You ran <strong>" + answered + "</strong> question" + (answered === 1 ? "" : "s") + " at an average self-rating of <strong>" + avg.toFixed(1) + "/5</strong>."
        : "No questions rated this run."));

      // Weakest areas → where to focus next.
      var weakest = Object.keys(topics).sort(function (a, b) { return topics[a] - topics[b]; }).slice(0, 3);
      if (weakest.length) {
        wrap.appendChild(el("p", null, "Focus next on: <strong>" + weakest.map(esc).join(", ") + "</strong> \u2014 your lowest self-ratings this run."));
      }
      wrap.appendChild(el("p", null,
        "The goal isn't the number \u2014 it's answering each out loud with clarify \u2192 claim \u2192 mechanism \u2192 trade-off \u2192 how I'd verify, without stalling on the follow-up. " +
        "Recorded to your <a href=\"Interview_Progress.html\">Progress dashboard</a>."));

      var row = el("div", "ip-controls");
      var again = el("button", "ip-btn", "Run another mock");
      again.addEventListener("click", renderSetup);
      row.appendChild(again);
      var why = el("button", "ip-btn ip-ghost", "Defend a decision (Why-chains) \u2192");
      why.addEventListener("click", function () { window.location.href = "Interview_Why_Interactive.html"; });
      row.appendChild(why);
      wrap.appendChild(row);
      app.appendChild(wrap);
    }

    renderSetup();
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch (e) {} }
})();
