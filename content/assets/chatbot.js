/* Floating "Ask the KB" chatbot widget.
   Calls the local FastAPI agent (agent/serve.py) at /ask.
   If the server isn't running, it shows a friendly hint.

   Built to survive MkDocs Material's `navigation.instant` (SPA-style page
   swaps): the widget is injected once and guarded against duplication, and all
   state lives in module scope so repeated questions always work. */

(function () {
  // Guard: with navigation.instant the script can run again on page swap.
  if (window.__kbChatbotLoaded) return;
  window.__kbChatbotLoaded = true;

  // Prefer the hosted API (Vercel) when configured; else fall back to a local
  // agent (KB_AGENT_URL / localhost) for local development.
  const HOSTED = (window.OFFERREADY_API_BASE || "").replace(/\/$/, "");
  const API = HOSTED || window.KB_AGENT_URL || "http://localhost:8000";
  // "Local" only when actually browsing on localhost/127.0.0.1 without a hosted
  // API. Everywhere else is treated as public — so visitors never see the
  // developer "start the local agent" instructions.
  const ON_LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const IS_HOSTED = Boolean(HOSTED) || !ON_LOCALHOST;
  // Hosted uses /api/ask + /api/areas; local agent uses /ask + /areas.
  const ASK_PATH = IS_HOSTED ? "/api/ask" : "/ask";
  const AREAS_PATH = IS_HOSTED ? "/api/areas" : "/areas";

  // ---- DOM ----
  const btn = document.createElement("button");
  btn.id = "kb-fab";
  btn.type = "button";
  btn.title = "Ask the knowledge base";
  btn.innerHTML = "🤖 Ask";

  const panel = document.createElement("div");
  panel.id = "kb-panel";
  panel.style.display = "none";
  panel.innerHTML = `
    <div id="kb-head">
      <span>🤖 Ask the Knowledge Base</span>
      <select id="kb-area" title="Filter by area">
        <option value="all">All areas</option>
      </select>
      <button id="kb-close" type="button" title="Close">✕</button>
    </div>
    <div id="kb-log">
      <div class="kb-msg kb-bot">Hi! Ask me anything about the GenAI &amp; data
      content on this site. I answer from the knowledge base and cite sources.</div>
      <div id="kb-chips">
        <button type="button" class="kb-chip">What is RAG?</button>
        <button type="button" class="kb-chip">How do I build my first agent?</button>
        <button type="button" class="kb-chip">Prompt engineering best practices</button>
        <button type="button" class="kb-chip">How to set up a vector database?</button>
        <button type="button" class="kb-chip">What is Snowflake Cortex?</button>
      </div>
    </div>
    <form id="kb-form" autocomplete="off">
      <input id="kb-input" type="text" autocomplete="off"
             placeholder="e.g. What is Cortex Analyst?" />
      <button type="submit" id="kb-send">Send</button>
    </form>
    <div id="kb-status"></div>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const log = panel.querySelector("#kb-log");
  const form = panel.querySelector("#kb-form");
  const input = panel.querySelector("#kb-input");
  const areaSel = panel.querySelector("#kb-area");
  const statusEl = panel.querySelector("#kb-status");
  let busy = false;

  function togglePanel(show) {
    panel.style.display = show ? "flex" : "none";
    if (show) setTimeout(() => input.focus(), 30);
  }
  btn.addEventListener("click", () => togglePanel(panel.style.display === "none"));
  panel.querySelector("#kb-close").addEventListener("click", () => togglePanel(false));

  function addMsg(html, cls) {
    const d = document.createElement("div");
    d.className = "kb-msg " + cls;
    d.innerHTML = html;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ---- Markdown -> HTML (headings, lists, tables, bold, code, links) ----
  // Small block-level renderer good enough for the agent's answers.
  function inline(s) {
    // links [text](url) -> keep text only (chat can't navigate site paths well)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
    s = s.replace(/`([^`]+)`/g, (_, c) => "<code>" + escapeHtml(c) + "</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    return s;
  }

  function renderMarkdown(md) {
    // Strip fenced code blocks defensively (agent already removes them).
    md = md.replace(/```[\s\S]*?```/g, "");
    const lines = md.split("\n");
    const html = [];
    let i = 0;

    while (i < lines.length) {
      let line = lines[i];
      const raw = line.trim();

      if (raw === "") { i++; continue; }

      // Heading: #, ##, ### OR a **bold-only** line used as a section title
      let m = raw.match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        const lvl = Math.min(m[1].length + 2, 6); // #->h3 so it fits the bubble
        html.push(`<h${lvl} class="kb-h">${inline(escapeHtml(m[2]))}</h${lvl}>`);
        i++;
        continue;
      }
      if (/^\*\*[^*]+\*\*$/.test(raw)) {
        html.push(`<h4 class="kb-h">${inline(escapeHtml(raw))}</h4>`);
        i++;
        continue;
      }

      // Table: header row containing | followed by a |---| separator
      if (raw.includes("|") && i + 1 < lines.length &&
          /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) &&
          lines[i + 1].includes("-")) {
        const rows = [];
        // header
        rows.push(raw);
        i += 2; // skip header + separator
        while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
          rows.push(lines[i].trim());
          i++;
        }
        const cells = (r) => r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        let t = '<table class="kb-table"><thead><tr>';
        cells(rows[0]).forEach((c) => { t += "<th>" + inline(escapeHtml(c)) + "</th>"; });
        t += "</tr></thead><tbody>";
        for (let r = 1; r < rows.length; r++) {
          t += "<tr>";
          cells(rows[r]).forEach((c) => { t += "<td>" + inline(escapeHtml(c)) + "</td>"; });
          t += "</tr>";
        }
        t += "</tbody></table>";
        html.push(t);
        continue;
      }

      // Bullet list
      if (/^[-*]\s+/.test(raw)) {
        html.push("<ul class='kb-ul'>");
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          const item = lines[i].replace(/^\s*[-*]\s+/, "");
          html.push("<li>" + inline(escapeHtml(item)) + "</li>");
          i++;
        }
        html.push("</ul>");
        continue;
      }

      // Numbered list
      if (/^\d+\.\s+/.test(raw)) {
        html.push("<ol class='kb-ol'>");
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          const item = lines[i].replace(/^\s*\d+\.\s+/, "");
          html.push("<li>" + inline(escapeHtml(item)) + "</li>");
          i++;
        }
        html.push("</ol>");
        continue;
      }

      // Paragraph: gather consecutive plain lines
      const para = [];
      while (i < lines.length && lines[i].trim() !== "" &&
             !/^(#{1,6}\s|[-*]\s|\d+\.\s)/.test(lines[i].trim()) &&
             !/^\*\*[^*]+\*\*$/.test(lines[i].trim()) &&
             !lines[i].includes("|")) {
        para.push(lines[i].trim());
        i++;
      }
      if (para.length) {
        html.push("<p>" + inline(escapeHtml(para.join(" "))) + "</p>");
      } else {
        i++;
      }
    }
    return html.join("\n");
  }

  // Populate area dropdown from /areas (best effort; hosted may not provide it)
  fetch(API + AREAS_PATH)
    .then((r) => r.json())
    .then((d) => {
      (d.areas || []).forEach((a) => {
        if (a === "all") return;
        const o = document.createElement("option");
        o.value = a; o.textContent = a;
        areaSel.appendChild(o);
      });
    })
    .catch(() => {});

  async function send() {
    if (busy) return;
    const q = input.value.trim();
    if (!q) return;
    busy = true;
    addMsg(escapeHtml(q), "kb-user");
    input.value = "";
    const thinking = addMsg("<em>Thinking…</em>", "kb-bot kb-thinking");
    try {
      const resp = await fetch(API + ASK_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, area: areaSel.value, k: 4 }),
      });
      if (!resp.ok) {
        let m = "The assistant had a problem. Please try again.";
        try { const e = await resp.json(); if (e && e.error) m = e.error; } catch (_) {}
        throw new Error(m);
      }
      const data = await resp.json();
      let html = renderMarkdown(data.answer || "_(no answer)_");
      if (data.citations && data.citations.length) {
        html += '<div class="kb-cites"><strong>Sources</strong><ul>' +
          data.citations.map((c) => {
            // Support both new {label,url} and legacy string citations.
            if (c && typeof c === "object") {
              const label = escapeHtml(c.label || c.url || "");
              const url = c.url ? escapeHtml(c.url) : "";
              return url
                ? `<li><a href="${url}">${label}</a></li>`
                : `<li>${label}</li>`;
            }
            return "<li>" + escapeHtml(c) + "</li>";
          }).join("") +
          "</ul></div>";
      }
      const tag = data.used_llm ? "LLM" : "from KB";
      html += `<div class="kb-tag">${tag} · area: ${escapeHtml(data.area || "all")}</div>`;
      thinking.remove();
      addMsg(html, "kb-bot");
    } catch (err) {
      thinking.remove();
      const msg = (err && err.message) ? escapeHtml(err.message) : "";
      if (IS_HOSTED) {
        // Public site: friendly, no dev/localhost instructions.
        const base = HOSTED
          ? (msg || "The assistant is unavailable right now.")
          : "The assistant isn't enabled on this site yet.";
        addMsg(
          "\u26a0\ufe0f " + base +
          " In the meantime, use the <strong>search</strong> at the top of the page, " +
          "or browse the topics from the left menu.",
          "kb-bot kb-err"
        );
      } else {
        // Local dev only: the agent isn't running.
        addMsg(
          "⚠️ Can't reach the local agent. Start it first:" +
          "<pre><code>cd agent\nuvicorn serve:app --port 8000</code></pre>" +
          "then reload. (Tip: <strong>start-chatbot.bat</strong>.)",
          "kb-bot kb-err"
        );
      }
    } finally {
      busy = false;
      setTimeout(() => input.focus(), 30);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send();
  });

  // Suggested-question chips: one click fills the box and sends. The chip row
  // hides after the first question (it's only useful on an empty conversation).
  const chips = panel.querySelector("#kb-chips");
  if (chips) {
    chips.addEventListener("click", (e) => {
      const chip = e.target.closest(".kb-chip");
      if (!chip) return;
      input.value = chip.textContent;
      chips.style.display = "none";
      send();
    });
  }
})();
