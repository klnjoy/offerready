/* "Keep Asking Why" — static reasoning engine (GitHub Pages, no backend).
   Trains you to DEFEND a decision under escalating follow-ups. Pick a scenario,
   answer each "why?", reveal what a strong answer covers, advance. Best depth
   per scenario saved to localStorage (why_progress_v1). Self-contained trees.
   Mounts on #why-app, survives navigation.instant. */
(function () {
  const SCENARIOS = {
    rag: {
      label: "RAG — retrieval design", topic: "RAG",
      opener: "Design retrieval for a document Q&A assistant. How do you retrieve?",
      chain: [
        { q: "I'd use hybrid search. — Why hybrid instead of pure vector search?", points: [
          "Vector catches semantics ('cancel plan' \u2248 'terminate subscription').",
          "Keyword/BM25 catches exact terms vector misses: IDs, error codes, SKUs, names.",
          "Hybrid = recall of both; pure vector silently drops exact-match queries." ] },
        { q: "Why BM25 + vector specifically, not just a better embedding model?", points: [
          "A better embedding still can't reliably match rare literal tokens.",
          "BM25 is cheap, interpretable, and has a complementary failure mode.",
          "You're combining orthogonal signals, not upgrading one axis." ] },
        { q: "How do you decide the weighting between the two?", points: [
          "Don't guess \u2014 tune on a labeled eval set (query \u2192 relevant docs).",
          "Sweep the weight, or use RRF (reciprocal rank fusion) as a robust default.",
          "Pick what maximizes recall@k / nDCG on your data." ] },
        { q: "How do you prove retrieval actually improved?", points: [
          "Offline: recall@k, MRR, nDCG on the labeled set, before vs after.",
          "End-to-end: groundedness / correctness via LLM-as-judge + human spot-check.",
          "Lock it in with the eval set running in CI to catch regressions." ] },
        { q: "Latency went 300ms \u2192 1.5s after adding rerank. What changes?", points: [
          "Rerank a small candidate set only (retrieve 50 \u2192 rerank top 10).",
          "Cache reranks for hot queries; use a smaller/faster cross-encoder.",
          "Measure p95 not just mean; decide if the quality gain is worth it here." ] },
        { q: "At 10\u00d7 document volume, what breaks and what do you change?", points: [
          "Index build/refresh time and memory; move to an ANN index (HNSW/IVF) with tuning.",
          "Add metadata filters / partitioning so you search a relevant subset.",
          "Watch recall drift as the corpus grows; re-evaluate on a fresh labeled set." ] },
      ],
    },
    agents: {
      label: "Agents \u2014 safe tool use", topic: "Agents",
      opener: "Design an agent that can take actions (not just answer). How?",
      chain: [
        { q: "I'd give it tools. \u2014 Why an agent loop instead of a single LLM call?", points: [
          "Multi-step tasks need plan \u2192 act \u2192 observe, not one shot.",
          "Tools let it act on real systems / fetch fresh data it can't know.",
          "But only if the task truly needs it \u2014 say when you would NOT use an agent." ] },
        { q: "How do you stop it from taking a destructive action?", points: [
          "Least-privilege tools; separate read tools from write tools.",
          "Human-in-the-loop approval for irreversible/high-blast-radius actions.",
          "The model never calls a mutating tool unilaterally." ] },
        { q: "A retrieved document contains hidden instructions. What happens, and how do you prevent it?", points: [
          "That's indirect prompt injection \u2014 the agent may follow attacker text.",
          "Treat all retrieved/tool content as DATA, never instructions.",
          "Gate write tools, validate outputs, vet the ingestion pipeline." ] },
        { q: "How do you bound cost and stop runaway loops?", points: [
          "Hard cap on steps/iterations and total tokens per request.",
          "Timeouts per tool call; a circuit breaker on repeated failures.",
          "Route easy asks to a smaller model; log cost per request and alert on drift." ] },
        { q: "How do you evaluate whether the agent is actually good?", points: [
          "Task-level eval set with known-good outcomes, not vibes.",
          "Track tool-call correctness, step count, latency, and failure rate.",
          "LLM-as-judge on final answers + human review; re-run on every change." ] },
        { q: "At scale, one tool's provider gets slow. What protects the system?", points: [
          "Per-tool timeout + retry with backoff + circuit breaker.",
          "Concurrency cap (semaphore) so slow calls don't exhaust workers.",
          "Graceful degradation: skip/queue the tool, return a partial answer." ] },
      ],
    },
    sysdesign: {
      label: "System design \u2014 enterprise AI assistant", topic: "System Design",
      opener: "Design an AI assistant over 10M internal documents for 100k employees.",
      chain: [
        { q: "Where do you start \u2014 straight to architecture?", points: [
          "No \u2014 clarify first: users, traffic, latency SLO, data sensitivity, tenancy, budget.",
          "The 'real problem' framing separates Staff/Principal from Senior.",
          "Confirm success criteria before drawing boxes." ] },
        { q: "Walk the architecture. Why each major component?", points: [
          "Ingestion \u2192 governed store; hybrid retrieval; orchestration; guardrails; API.",
          "Each choice tied to a requirement (e.g. RBAC because data is sensitive).",
          "Name the alternative you rejected and why." ] },
        { q: "How do you enforce that a user only sees documents they're allowed to?", points: [
          "Identity flows through; retrieval filters on per-user/tenant metadata.",
          "Access control at the data layer, not just the app \u2014 masking/row policies.",
          "Never rely on the prompt to enforce authorization." ] },
        { q: "How do you keep it reliable when the model provider degrades?", points: [
          "Timeouts, retries with backoff, circuit breaker, fallback model.",
          "Graceful degradation (cached/partial answers); SLOs and alerting.",
          "Load-test to find the real bottleneck before promising numbers." ] },
        { q: "How do you keep cost predictable at 100k users?", points: [
          "Token volume \u00d7 model tier is the driver; route easy queries to small models.",
          "Cache hot retrievals/answers; cap context size; batch where possible.",
          "Budgets + per-team cost attribution + alerts on drift." ] },
        { q: "Should you have built this with an LLM at all?", points: [
          "Principal move: challenge the premise \u2014 what does the business actually need?",
          "Consider build-vs-buy, simpler search, and long-term TCO/governance.",
          "Decide deliberately, not by default." ] },
      ],
    },
    cost: {
      label: "Cost \u2014 the bill doubled", topic: "Cost / FinOps",
      opener: "Your AI platform's monthly cost doubled overnight. Defend your response.",
      chain: [
        { q: "What do you look at first?", points: [
          "Usage/metering by workload \u2014 find the delta, don't guess.",
          "New job over a large column? An agent stuck looping? A lowered cache/refresh lag?",
          "Isolate the single biggest contributor before acting." ] },
        { q: "You found a job calling a large model over millions of rows. Why is that the cost?", points: [
          "Cost = tokens processed \u00d7 model tier; large model \u00d7 big text \u00d7 many rows compounds.",
          "It likely runs with no pre-filter, inferring on rows you'll discard.",
          "Interactive agent fan-out adds unpredictable extra calls." ] },
        { q: "How do you cut it without hurting quality?", points: [
          "Filter with cheap SQL/keyword BEFORE inference.",
          "Route: small model for easy cases, large only for the hard ones.",
          "Batch via scheduled jobs; cache/persist results so you don't re-infer." ] },
        { q: "How do you stop this recurring?", points: [
          "Budget/resource monitors with alert thresholds on the AI warehouses.",
          "Cost-per-request dashboard so drift is visible before invoice time.",
          "Guardrail in CI: flag jobs that would inference over unbounded rows." ] },
        { q: "Leadership asks for a target. How do you set one credibly?", points: [
          "Model cost per request \u00d7 forecast volume, with tier assumptions stated.",
          "Give a range with the levers that move it (model mix, cache hit rate).",
          "Tie the target to a quality floor \u2014 cost is a trade-off, not a solo metric." ] },
      ],
    },
  };

  function init() {
    const app = document.getElementById("why-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";
    const STORE = "why_progress_v1";
    const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
    const save = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch {} };
    let st = null;

    function renderSetup() {
      app.innerHTML = "";
      app.appendChild(el("p", null, "Pick a decision to defend. You'll face escalating <strong>\u201cwhy?\u201d</strong> follow-ups \u2014 answer each (out loud or in the box), then reveal what a strong answer covers. Go as deep as you can; your best depth is saved locally."));
      const best = load();
      const wrap = el("div", "ip-setup");
      Object.entries(SCENARIOS).forEach(([key, sc]) => {
        const depth = best[key] ? ` \u00b7 best depth ${best[key]}/${sc.chain.length}` : "";
        const c = el("div", "ip-track", `<h3>${esc(sc.label)}</h3><p>${esc(sc.opener)}${depth}</p>`);
        c.addEventListener("click", () => start(key));
        wrap.appendChild(c);
      });
      app.appendChild(wrap);
    }

    function start(key) {
      const sc = SCENARIOS[key];
      st = { key, sc, i: 0, maxRevealed: 0 };
      renderStep();
    }

    function renderStep() {
      const sc = st.sc, node = sc.chain[st.i];
      app.innerHTML = "";
      const card = el("div", "ip-card");
      const pct = Math.round((st.i / sc.chain.length) * 100);
      card.appendChild(el("div", "ip-progress", `Follow-up ${st.i + 1} of ${sc.chain.length} \u00b7 ${esc(sc.label)}`));
      const bar = el("div", "ip-bar"); bar.appendChild(el("div")); bar.firstChild.style.width = pct + "%"; card.appendChild(bar);
      card.appendChild(el("span", "ip-topic", esc(sc.topic)));
      card.appendChild(el("div", "ip-q", "\uD83E\uDDD1\u200D\uD83D\uDCBC " + esc(node.q)));
      const ta = el("textarea", "ip-answerbox"); ta.placeholder = "Your answer (or say it aloud), then reveal what a strong answer covers.";
      card.appendChild(ta);
      const row = el("div", "ip-controls");
      const reveal = el("button", "ip-btn", "Reveal strong-answer points");
      row.appendChild(reveal); card.appendChild(row);
      const modelWrap = el("div"); card.appendChild(modelWrap);
      reveal.addEventListener("click", () => {
        reveal.disabled = true;
        st.maxRevealed = Math.max(st.maxRevealed, st.i + 1);
        const list = node.points.map((p) => `<li>${md(p)}</li>`).join("");
        modelWrap.appendChild(el("div", "ip-model", `<h4>A strong answer covers</h4><ul>${list}</ul>`));
        const nrow = el("div", "ip-controls");
        if (st.i < sc.chain.length - 1) {
          const next = el("button", "ip-btn", "Push me harder \u2192");
          next.addEventListener("click", () => { st.i++; renderStep(); });
          nrow.appendChild(next);
        } else {
          nrow.appendChild(el("span", "ip-progress", "\uD83C\uDFC1 You defended it to the end of the chain."));
        }
        const stop = el("button", "ip-btn ip-ghost", "Finish");
        stop.addEventListener("click", finish);
        nrow.appendChild(stop);
        modelWrap.appendChild(nrow);
      });
      app.appendChild(card);
      setTimeout(() => ta.focus(), 30);
    }

    function finish() {
      const best = load();
      const reached = Math.max(best[st.key] || 0, st.maxRevealed);
      best[st.key] = reached; save(best);
      app.innerHTML = "";
      const wrap = el("div", "ip-card ip-summary");
      wrap.appendChild(el("div", "ip-score", st.maxRevealed + "/" + st.sc.chain.length));
      wrap.appendChild(el("p", null, `You defended <strong>${esc(st.sc.label)}</strong> through ${st.maxRevealed} follow-up${st.maxRevealed === 1 ? "" : "s"}. Best so far: ${reached}/${st.sc.chain.length}.`));
      wrap.appendChild(el("p", null, "The goal isn't a score \u2014 it's being able to justify each choice out loud without stalling. Retry and go one level deeper."));
      const row = el("div", "ip-controls");
      const again = el("button", "ip-btn", "Pick another scenario");
      again.addEventListener("click", renderSetup);
      row.appendChild(again); wrap.appendChild(row);
      app.appendChild(wrap);
    }

    renderSetup();
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch {} }
})();
