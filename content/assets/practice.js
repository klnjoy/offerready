/* Interview Practice — static, runs on GitHub Pages (no backend).
   Three modes:
     - Practice: answer → reveal model answer → self-rate (1-5)
     - Flashcards: flip to see answer → Again / Good / Easy (lightweight SRS)
     - Timed Exam: countdown, answer all, reveal + self-rate at the end

   Sessions are saved to localStorage (key ip_history_v1) with a `mode` field,
   so the Progress dashboard can chart them.

   Optional AI grading (local-only) calls http://localhost:8000/grade if the
   bundled agent is running; otherwise it degrades gracefully. The public site
   never depends on it. Mounts only if #ip-app exists. Survives navigation.instant. */

(function () {
  function init() {
    const app = document.getElementById("ip-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";

    const AGENT = window.KB_AGENT_URL || "http://localhost:8000";
    // AI grading talks to a LOCAL agent (agent/serve.py). It only works on
    // localhost, so we only show the button there — on the public site it would
    // just surface a "start-chatbot.bat" dev message, which looks broken.
    const ON_LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const base = (window.__md_scope && window.__md_scope.pathname) || "/";
    const JSON_URL = base.replace(/\/[^/]*$/, "/") + "assets/interview_questions.json";
    const ALT_URL = "../assets/interview_questions.json";
    const STORE_KEY = "ip_history_v1";

    const TRACKS = {
      all:  { label: "All topics",           desc: "Everything in the bank." },
      data: { label: "Data / Analytics Eng", desc: "SQL, warehouses, pipelines, Python, AWS." },
      ai:   { label: "AI / GenAI Engineer",  desc: "RAG, agents, LangChain, MCP, Python." },
      fde:  { label: "Forward-Deployed",      desc: "Python + behavioral core." },
      lead: { label: "Delivery / Lead",       desc: "Behavioral & delivery focus." },
    };
    const MODES = {
      practice:  { label: "📝 Practice",   desc: "Answer, reveal, self-rate 1-5." },
      flashcard: { label: "🃏 Flashcards", desc: "Flip to reveal, then Again/Good/Easy." },
      exam:      { label: "⏱️ Timed Exam", desc: "Countdown, answer all, score at the end." },
      weak:      { label: "🎯 Weak areas", desc: "Focuses on topics you've scored low. Needs a little history." },
    };

    // Map a question's `source` (a Q&A file stem) to its published page so the
    // learner can jump from an answer straight to the full topic.
    const SOURCE_LINKS = {
      SQL_Interview_QA: "SQL Interview Q&A",
      DataEngineering_Interview_QA: "Data Engineering Interview Q&A",
      Snowflake_Interview_QA: "Snowflake Interview Q&A",
      Databricks_Interview_QA: "Databricks Interview Q&A",
      dbt_Interview_QA: "dbt Interview Q&A",
      Python_Interview_QA: "Python Interview Q&A",
      AWS_Interview_QA: "AWS Interview Q&A",
      DevOps_Interview_QA: "DevOps Interview Q&A",
      AI_Engineer_Interview_QA: "AI Engineer Interview Q&A",
      Agents_Interview_QA: "Agents Interview Q&A",
      LangChain_LangGraph_Interview_QA: "LangChain / LangGraph Interview Q&A",
      MCP_Interview_QA: "MCP Interview Q&A",
      GenAI_Interview_QA: "GenAI Interview Q&A",
      Behavioral_STAR_Interview_QA: "Behavioral / STAR Interview Q&A",
    };
    // Practice pages live alongside this one under Personal-SourceCode/.
    function sourceLinkEl(item) {
      if (!item || !item.source || !SOURCE_LINKS[item.source]) return null;
      const a = el("a", "ip-source-link");
      a.href = item.source + ".html";                 // sibling page (same dir)
      a.target = "_blank"; a.rel = "noopener";
      a.innerHTML = "\uD83D\uDCD6 Read the full topic: " + esc(SOURCE_LINKS[item.source]) + " \u2197";
      return a;
    }

    // Build a weakness profile from saved history: average % per topic across
    // recent sessions. Lower = weaker. Used by the "Weak areas" mode.
    function weakTopicScores() {
      const h = loadHistory();
      const acc = {};
      h.forEach((e) => {
        const t = e.topics || {};
        Object.keys(t).forEach((k) => {
          (acc[k] = acc[k] || []).push(Number(t[k]) || 0);
        });
      });
      const out = {};
      Object.keys(acc).forEach((k) => { out[k] = Math.round(acc[k].reduce((a, b) => a + b, 0) / acc[k].length); });
      return out; // { topic: avgPct }
    }

    let BANK = [];
    let session = null;

    // ---- helpers ----
    const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    function mdInline(s) { s = esc(s); s = s.replace(/`([^`]+)`/g, "<code>$1</code>"); s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"); return s; }
    function loadHistory() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } }
    function saveHistory(entry) { const h = loadHistory(); h.unshift(entry); try { localStorage.setItem(STORE_KEY, JSON.stringify(h.slice(0, 50))); } catch {} }

    // ---- setup screen ----
    function renderSetup() {
      app.innerHTML = "";
      let track = "all", mode = "practice";

      app.appendChild(el("p", null,
        `<strong>${BANK.length}</strong> questions loaded. Choose a mode and track, ` +
        `then start. Scores are saved locally in this browser.`));

      // If we have history, surface the current weakest topics as a nudge.
      const wscores = weakTopicScores();
      const wkeys = Object.keys(wscores).sort((a, b) => wscores[a] - wscores[b]);
      if (wkeys.length) {
        const weakest = wkeys.slice(0, 3).map((k) => `${esc(k)} (${wscores[k]}%)`).join(", ");
        app.appendChild(el("div", "ip-weak-hint",
          `\uD83C\uDFAF Your weakest topics so far: <strong>${weakest}</strong>. ` +
          `Try <em>Weak areas</em> mode to drill them.`));
      }

      // Mode picker
      app.appendChild(el("div", "ip-progress", "Mode"));
      const modeWrap = el("div", "ip-setup");
      Object.entries(MODES).forEach(([key, m]) => {
        const c = el("div", "ip-track" + (key === mode ? " ip-sel" : ""), `<h3>${m.label}</h3><p>${esc(m.desc)}</p>`);
        c.addEventListener("click", () => { modeWrap.querySelectorAll(".ip-track").forEach((x) => x.classList.remove("ip-sel")); c.classList.add("ip-sel"); mode = key; });
        modeWrap.appendChild(c);
      });
      app.appendChild(modeWrap);

      // Track picker
      app.appendChild(el("div", "ip-progress", "Track"));
      const trackWrap = el("div", "ip-setup");
      Object.entries(TRACKS).forEach(([key, t]) => {
        const c = el("div", "ip-track" + (key === track ? " ip-sel" : ""), `<h3>${esc(t.label)}</h3><p>${esc(t.desc)}</p>`);
        c.addEventListener("click", () => { trackWrap.querySelectorAll(".ip-track").forEach((x) => x.classList.remove("ip-sel")); c.classList.add("ip-sel"); track = key; refreshTopics(); });
        trackWrap.appendChild(c);
      });
      app.appendChild(trackWrap);

      // Topic + count + start
      const controls = el("div", "ip-controls");
      const topicSel = el("select"); const countSel = el("select");
      [5, 10, 15, 20].forEach((nn) => { const o = el("option"); o.value = nn; o.textContent = nn + " questions"; if (nn === 10) o.selected = true; countSel.appendChild(o); });
      function refreshTopics() {
        const pool = track === "all" ? BANK : BANK.filter((q) => (q.tracks || []).includes(track));
        const topics = ["All", ...Array.from(new Set(pool.map((q) => q.topic))).sort()];
        topicSel.innerHTML = ""; topics.forEach((t) => { const o = el("option"); o.value = t; o.textContent = t; topicSel.appendChild(o); });
      }
      refreshTopics();
      const startBtn = el("button", "ip-btn", "Start session");
      controls.append(Object.assign(el("label"), { textContent: "Topic: " }), topicSel, Object.assign(el("label"), { textContent: " Count: " }), countSel, startBtn);
      app.appendChild(controls);

      startBtn.addEventListener("click", () => {
        let pool = track === "all" ? BANK.slice() : BANK.filter((q) => (q.tracks || []).includes(track));
        const topic = topicSel.value;
        if (topic && topic !== "All") pool = pool.filter((q) => q.topic === topic);
        const count = parseInt(countSel.value, 10);

        if (mode === "weak") {
          const scores = weakTopicScores();
          const scored = Object.keys(scores);
          if (!scored.length) {
            // No history yet — explain, and fall back to a normal random set.
            alert("Weak-areas mode gets smarter after you finish a few sessions. " +
                  "For now, here's a normal mixed set — your ratings will train it.");
          } else {
            // Prioritize questions whose topic scored below 70% (weakest first),
            // then backfill with the rest so the session is always full.
            const weight = (q) => (q.topic in scores) ? scores[q.topic] : 65; // unseen ~ mid
            const weak = pool.filter((q) => weight(q) < 70);
            const rest = pool.filter((q) => weight(q) >= 70);
            weak.sort((a, b) => weight(a) - weight(b));
            pool = shuffle(weak).concat(shuffle(rest));
            pool = pool.slice(0, count);
          }
        }
        if (mode !== "weak" || !Object.keys(weakTopicScores()).length) {
          pool = shuffle(pool.slice()).slice(0, count);
        }
        if (!pool.length) return;
        // "weak" runs as a Practice-style session (answer → reveal → rate).
        const runMode = mode === "weak" ? "practice" : mode;
        session = { items: pool, i: 0, ratings: [], mode: runMode, track: TRACKS[track].label, topic, startedAt: Date.now(), origin: mode };
        if (runMode === "exam") startExam();
        else if (runMode === "flashcard") renderFlashcard();
        else renderQuestion();
      });

      app.appendChild(renderHistory());
    }

    function renderHistory() {
      const h = loadHistory();
      if (!h.length) return el("div");
      const wrap = el("div");
      wrap.appendChild(el("h2", null, "Your recent sessions"));
      let t = '<table><thead><tr><th>When</th><th>Mode</th><th>Track</th><th>Topic</th><th>Score</th></tr></thead><tbody>';
      h.slice(0, 8).forEach((e) => { t += `<tr><td>${esc(e.when)}</td><td>${esc(e.mode || "practice")}</td><td>${esc(e.track)}</td><td>${esc(e.topic)}</td><td>${e.score}%</td></tr>`; });
      t += "</tbody></table>";
      wrap.appendChild(el("div", null, t));
      wrap.appendChild(el("p", "ip-ai-hint", 'See trends on the <a href="Interview_Progress.html">Progress dashboard</a>.'));
      return wrap;
    }

    // ---- Practice mode ----
    function renderQuestion() {
      const s = session, item = s.items[s.i];
      app.innerHTML = "";
      const card = cardHeader(s, item);
      const ta = el("textarea", "ip-answerbox"); ta.placeholder = "Answer here (or say it out loud), then reveal the model answer.";
      card.appendChild(ta);
      const row = el("div", "ip-controls");
      const revealBtn = el("button", "ip-btn", "Reveal model answer");
      // AI grade is a local-dev-only convenience; hide it on the hosted site.
      const aiBtn = ON_LOCALHOST ? el("button", "ip-btn ip-ghost", "🤖 AI grade (local)") : null;
      row.append(revealBtn); if (aiBtn) row.append(aiBtn); card.appendChild(row);
      const aiOut = el("div", "ip-ai"); card.appendChild(aiOut);
      const modelWrap = el("div"); card.appendChild(modelWrap);
      revealBtn.addEventListener("click", () => {
        revealBtn.disabled = true;
        const mv = el("div", "ip-model", `<h4>Model answer</h4>${mdInline(item.a)}`);
        const link = sourceLinkEl(item); if (link) mv.appendChild(link);
        modelWrap.appendChild(mv);
        modelWrap.appendChild(ratingRow((val) => { s.ratings[s.i] = val; advance(); }));
      });
      if (aiBtn) aiBtn.addEventListener("click", () => gradeWithAI(item, ta.value, aiOut, aiBtn));
      app.appendChild(card);
      setTimeout(() => ta.focus(), 30);
    }

    // ---- Flashcard mode ----
    function renderFlashcard() {
      const s = session, item = s.items[s.i];
      app.innerHTML = "";
      const card = cardHeader(s, item);
      const flip = el("button", "ip-btn ip-ghost", "Flip to reveal answer");
      card.appendChild(flip);
      const modelWrap = el("div"); card.appendChild(modelWrap);
      flip.addEventListener("click", () => {
        flip.disabled = true;
        const mv = el("div", "ip-model", `<h4>Answer</h4>${mdInline(item.a)}`);
        const link = sourceLinkEl(item); if (link) mv.appendChild(link);
        modelWrap.appendChild(mv);
        const rate = el("div", "ip-rate");
        [["Again", 1], ["Good", 3], ["Easy", 5]].forEach(([lab, val]) => {
          const b = el("button", "ip-star", esc(lab));
          b.addEventListener("click", () => { s.ratings[s.i] = val; advance(); });
          rate.appendChild(b);
        });
        modelWrap.appendChild(rate);
      });
      app.appendChild(card);
    }

    // ---- Timed Exam mode ----
    function startExam() {
      const s = session;
      s.perQ = 90; // seconds per question budget
      s.remaining = s.items.length * s.perQ;
      s.answers = [];
      renderExamQuestion();
      s.timer = setInterval(() => {
        s.remaining--;
        const t = document.getElementById("ip-clock");
        if (t) t.textContent = fmtTime(s.remaining);
        if (s.remaining <= 0) { clearInterval(s.timer); finishExam(); }
      }, 1000);
    }
    function fmtTime(sec) { sec = Math.max(0, sec); const m = Math.floor(sec / 60); const r = sec % 60; return m + ":" + String(r).padStart(2, "0"); }
    function renderExamQuestion() {
      const s = session, item = s.items[s.i];
      app.innerHTML = "";
      const card = cardHeader(s, item, true);
      const ta = el("textarea", "ip-answerbox"); ta.value = s.answers[s.i] || ""; ta.placeholder = "Type your answer. No peeking — you review at the end.";
      ta.addEventListener("input", () => { s.answers[s.i] = ta.value; });
      card.appendChild(ta);
      const row = el("div", "ip-controls");
      const prev = el("button", "ip-btn ip-ghost", "‹ Prev"); prev.disabled = s.i === 0;
      const next = el("button", "ip-btn", s.i === s.items.length - 1 ? "Finish & review" : "Next ›");
      prev.addEventListener("click", () => { s.answers[s.i] = ta.value; s.i--; renderExamQuestion(); });
      next.addEventListener("click", () => { s.answers[s.i] = ta.value; if (s.i === s.items.length - 1) { clearInterval(s.timer); finishExam(); } else { s.i++; renderExamQuestion(); } });
      row.append(prev, next); card.appendChild(row);
      app.appendChild(card);
      setTimeout(() => ta.focus(), 30);
    }
    function finishExam() {
      const s = session; s.i = 0; s.reviewing = true;
      renderExamReview();
    }
    function renderExamReview() {
      const s = session, item = s.items[s.i];
      app.innerHTML = "";
      const card = cardHeader(s, item);
      card.appendChild(el("div", "ip-progress", "Your answer"));
      card.appendChild(el("div", "ip-model", (s.answers[s.i] ? esc(s.answers[s.i]) : "<em>(left blank)</em>")));
      const mv = el("div", "ip-model", `<h4>Model answer</h4>${mdInline(item.a)}`);
      const link = sourceLinkEl(item); if (link) mv.appendChild(link);
      card.appendChild(mv);
      card.appendChild(ratingRow((val) => { s.ratings[s.i] = val; advance(); }));
      app.appendChild(card);
    }

    // ---- shared pieces ----
    function cardHeader(s, item, withClock) {
      const card = el("div", "ip-card");
      // Top row: progress text on the left, a quiet "End session" exit on the
      // right. Lets the learner leave mid-session without being trapped by the
      // only other button being "Reveal model answer".
      const top = el("div", "ip-cardtop");
      const pct = Math.round((s.i / s.items.length) * 100);
      let head = `Question ${s.i + 1} of ${s.items.length} · ${s.track}`;
      if (withClock) head += ` · <span id="ip-clock">${fmtTime(s.remaining)}</span> left`;
      top.appendChild(el("div", "ip-progress", head));
      const endBtn = el("button", "ip-btn ip-ghost ip-end", "End session");
      endBtn.type = "button";
      endBtn.title = "Save progress so far and exit this session";
      endBtn.addEventListener("click", () => endSessionEarly());
      top.appendChild(endBtn);
      card.appendChild(top);
      const bar = el("div", "ip-bar"); bar.appendChild(el("div")); bar.firstChild.style.width = pct + "%"; card.appendChild(bar);
      card.appendChild(el("span", "ip-topic", esc(item.topic)));
      card.appendChild(el("div", "ip-q", esc(item.q)));
      return card;
    }

    // Leave a session mid-way. If the learner has rated at least one question,
    // we save a (partial) result and show the normal summary so the progress
    // still counts. If they haven't rated anything yet, there's nothing
    // meaningful to save — just return to the setup screen.
    function endSessionEarly() {
      const s = session;
      if (!s) return renderSetup();
      const ratedCount = s.ratings.filter((r) => r != null).length;
      const msg = ratedCount
        ? "End this session now? Your " + ratedCount + " rated " +
          (ratedCount === 1 ? "answer" : "answers") + " will be saved to your progress."
        : "End this session? You haven't rated anything yet, so nothing will be saved.";
      if (!window.confirm(msg)) return;
      if (s.timer) { clearInterval(s.timer); s.timer = null; }
      if (ratedCount) renderSummary(true);
      else renderSetup();
    }
    function ratingRow(onPick) {
      const wrap = el("div");
      wrap.appendChild(el("div", "ip-progress", "How did your answer compare? Rate yourself:"));
      const rate = el("div", "ip-rate");
      ["1 · Missed it", "2", "3 · Partial", "4", "5 · Nailed it"].forEach((lab, idx) => {
        const b = el("button", "ip-star", esc(lab));
        b.addEventListener("click", () => onPick(idx + 1));
        rate.appendChild(b);
      });
      wrap.appendChild(rate);
      return wrap;
    }
    function advance() {
      const s = session; s.i++;
      const done = s.i >= s.items.length;
      if (done) return renderSummary();
      if (s.mode === "flashcard") renderFlashcard();
      else if (s.mode === "exam") renderExamReview();
      else renderQuestion();
    }

    async function gradeWithAI(item, answer, out, btn) {
      if (!answer.trim()) { out.innerHTML = '<div class="ip-ai-hint">Type an answer first, then click AI grade.</div>'; return; }
      btn.disabled = true;
      out.innerHTML = '<div class="ip-ai-out"><em>Asking the local agent…</em></div>';
      try {
        const resp = await fetch(AGENT + "/grade", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: item.q, answer, model_answer: item.a }) });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const d = await resp.json();
        out.innerHTML = `<div class="ip-ai-out"><strong>AI score: ${esc(String(d.score))}/5</strong><br>${mdInline(d.feedback || "")}</div>`;
      } catch {
        out.innerHTML = '<div class="ip-ai-out">🔌 AI grading needs the local agent running. Start it with ' +
          '<code>start-chatbot.bat</code>, then reload. Self-rating always works.' +
          '<div class="ip-ai-hint">Local-only feature; the published site doesn\'t include AI grading.</div></div>';
      } finally { btn.disabled = false; }
    }

    function renderSummary(endedEarly) {
      const s = session;
      if (s.timer) clearInterval(s.timer);
      const rated = s.ratings.filter((r) => r != null);
      const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
      const score = Math.round((avg / 5) * 100);
      // Per-topic breakdown for the summary.
      const byTopic = {};
      s.items.forEach((it, idx) => {
        const r = s.ratings[idx]; if (r == null) return;
        (byTopic[it.topic] = byTopic[it.topic] || []).push(r);
      });
      saveHistory({
        when: new Date().toLocaleString(), mode: s.mode, track: s.track, topic: s.topic,
        score, n: rated.length, partial: !!endedEarly,
        topics: Object.fromEntries(Object.entries(byTopic).map(([k, v]) => [k, Math.round((v.reduce((a, b) => a + b, 0) / v.length / 5) * 100)])),
      });
      app.innerHTML = "";
      const wrap = el("div", "ip-card ip-summary");
      if (endedEarly) {
        wrap.appendChild(el("div", "ip-progress",
          `Session ended early \u2014 ${rated.length} of ${s.items.length} questions rated and saved.`));
      }
      wrap.appendChild(el("div", "ip-score", score + "%"));
      wrap.appendChild(el("p", null, `${esc(MODES[s.mode].label)} · ${rated.length} questions · ${s.track} · ${esc(s.topic)}`));
      let msg = score >= 80 ? "Strong — you're interview-ready on this set."
              : score >= 60 ? "Solid. Review the ones you rated low and go again."
              : "Good start. Reread the source pages, then retake.";
      wrap.appendChild(el("p", null, esc(msg)));
      const row = el("div", "ip-controls");
      // Retry the questions rated 3 or below — turns a weak run into a focused redo.
      const weakItems = s.items.filter((_, idx) => s.ratings[idx] != null && s.ratings[idx] <= 3);
      if (weakItems.length) {
        const retry = el("button", "ip-btn", `Retry ${weakItems.length} I rated low`);
        retry.addEventListener("click", () => {
          session = { items: shuffle(weakItems.slice()), i: 0, ratings: [], mode: "practice",
                      track: s.track, topic: s.topic, startedAt: Date.now(), origin: "retry" };
          renderQuestion();
        });
        row.appendChild(retry);
      }
      const again = el("button", "ip-btn" + (weakItems.length ? " ip-ghost" : ""), "New session");
      again.addEventListener("click", renderSetup);
      const dash = el("a", "ip-btn ip-ghost", "View progress →"); dash.href = "Interview_Progress.html";
      row.append(again, dash); wrap.appendChild(row);
      app.appendChild(wrap);
    }

    // ---- load bank ----
    function boot(data) { BANK = (data && data.questions) || []; if (!BANK.length) { app.innerHTML = "<p>No questions found.</p>"; return; } renderSetup(); }
    app.innerHTML = "<p><em>Loading practice questions…</em></p>";
    fetch(JSON_URL).then((r) => { if (!r.ok) throw 0; return r.json(); }).then(boot)
      .catch(() => fetch(ALT_URL).then((r) => r.json()).then(boot).catch(() => { app.innerHTML = "<p>⚠️ Couldn't load questions.json.</p>"; }));
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch {} }
})();
