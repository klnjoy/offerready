/* OfferReady Help — floating assistant for the study library.
 *
 * Streams answers from the hosted API (/api/ask, Server-Sent Events) with a
 * caret and a Stop button, remembers the conversation for the browser session
 * (sessionStorage, so it survives reloads and instant navigation), knows which
 * page the reader is on, and ends each answer with follow-up chips, "open in
 * the app" buttons, Read more links, copy and feedback.
 *
 * Falls back to the local FastAPI agent (agent/serve.py, POST /ask, no
 * streaming) when browsing on localhost without a hosted API.
 *
 * Built to survive MkDocs Material's `navigation.instant` (SPA-style page
 * swaps): injected once, guarded against duplication, re-attached if a swap
 * ever removes it, and the page context is refreshed on every swap.
 *
 * Safety: model text is HTML-escaped BEFORE the small Markdown transform, and
 * every server-provided label (follow-ups, actions, citations) is set with
 * textContent, never innerHTML. Styles live in chatbot.css (.orh-*). */

(function () {
  "use strict";
  if (window.__orhHelpLoaded) return;
  window.__orhHelpLoaded = true;
  window.__kbChatbotLoaded = true; // legacy guard name

  // ---- configuration ------------------------------------------------------
  const HOSTED = (window.OFFERREADY_API_BASE || "").replace(/\/$/, "");
  const API = HOSTED || window.KB_AGENT_URL || "http://localhost:8000";
  const ON_LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const IS_HOSTED = Boolean(HOSTED) || !ON_LOCALHOST;
  const ASK_PATH = IS_HOSTED ? "/api/ask" : "/ask";
  const AREAS_PATH = IS_HOSTED ? "/api/areas" : "/areas";
  const CAN_STREAM = IS_HOSTED && typeof ReadableStream !== "undefined" && typeof TextDecoder !== "undefined";
  const APP_URL = (window.OFFERREADY_APP_URL || "https://klnjoy.github.io/offerready-app").replace(/\/$/, "");
  const SESSION_KEY = "offerready.studyhelp.v2";
  const FEEDBACK_KEY = "offerready.studyhelp.feedback.v1";
  const MAX_CHARS = 800;
  const HISTORY_TURNS = 8;
  const MAX_STORED = 40;

  // Site base for resolving citation paths (the API returns site-relative
  // paths like "GenAI-Topics/rag/index.html").
  const SITE_BASE = (function () {
    if (window.__md_scope && window.__md_scope.pathname) {
      return window.__md_scope.pathname.replace(/[^/]*$/, "");
    }
    const m = location.pathname.match(/^(\/[^/]+\/)/);
    return m ? m[1] : "/";
  })();

  function resolveCitationUrl(u) {
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    if (/^\//.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return ""; // no javascript:, data:, …
    return SITE_BASE + u.replace(/^\.?\//, "");
  }

  // ---- small utils ----------------------------------------------------------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const isMobile = () => window.matchMedia && window.matchMedia("(max-width: 639px)").matches;

  const ICON = {
    chat: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z"/><path d="M8.5 9.5h7M8.5 12.5h4"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    expand: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v10H4V10zM7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.3 6A2 2 0 0 1 17.7 20H7"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14V4H4v10zM7 14l4 7a2 2 0 0 0 3-2l-1-5h6a2 2 0 0 0 2-2.3l-1.3-6A2 2 0 0 0 17.7 4H7"/></svg>',
  };

  // ---- Markdown -> HTML (escape FIRST, then a small transform) --------------
  function inline(s) {
    // s is already HTML-escaped. Links keep their text only.
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    return s;
  }

  function renderMarkdown(md) {
    md = String(md || "").replace(/```[\s\S]*?(```|$)/g, "");
    const lines = md.split("\n");
    const html = [];
    let i = 0;
    const cells = (r) => r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    while (i < lines.length) {
      const raw = lines[i].trim();
      if (raw === "") { i++; continue; }
      const m = raw.match(/^(#{1,6})\s+(.*)$/);
      if (m || /^\*\*[^*]+\*\*$/.test(raw)) {
        html.push('<h4 class="orh-h">' + inline(escapeHtml(m ? m[2] : raw)) + "</h4>");
        i++;
        continue;
      }
      if (raw.includes("|") && i + 1 < lines.length &&
          /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
        const head = cells(raw);
        const rows = [];
        i += 2;
        while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") rows.push(cells(lines[i++].trim()));
        let t = '<div class="orh-table"><table><thead><tr>';
        head.forEach((c) => { t += "<th>" + inline(escapeHtml(c)) + "</th>"; });
        t += "</tr></thead><tbody>";
        rows.forEach((r) => {
          t += "<tr>";
          r.forEach((c) => { t += "<td>" + inline(escapeHtml(c)) + "</td>"; });
          t += "</tr>";
        });
        html.push(t + "</tbody></table></div>");
        continue;
      }
      if (/^[-*]\s+/.test(raw) || /^\d+\.\s+/.test(raw)) {
        const ordered = /^\d+\./.test(raw);
        const re = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
        const items = [];
        while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
        const tag = ordered ? "ol" : "ul";
        html.push("<" + tag + ">" + items.map((it) => "<li>" + inline(escapeHtml(it)) + "</li>").join("") + "</" + tag + ">");
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() !== "" &&
             !/^(#{1,6}\s|[-*]\s|\d+\.\s)/.test(lines[i].trim()) &&
             !lines[i].includes("|")) {
        para.push(lines[i++].trim());
      }
      if (para.length) html.push("<p>" + inline(escapeHtml(para.join(" "))) + "</p>");
      else { html.push("<p>" + inline(escapeHtml(raw)) + "</p>"); i++; }
    }
    return html.join("");
  }

  const CARET = '<span class="orh-caret" aria-hidden="true"></span>';
  /** Put the caret inside the last text block so it trails the words. */
  function withCaret(html) {
    if (!html) return "<p>" + CARET + "</p>";
    const re = /<\/(p|li|h4|td|th)>(?![\s\S]*<\/(p|li|h4|td|th)>)/;
    return re.test(html) ? html.replace(re, (t) => CARET + t) : html + CARET;
  }

  // ---- page context -------------------------------------------------------
  function pageTitle() {
    const h1 = document.querySelector(".md-content h1, article h1, main h1, h1");
    let t = h1 ? h1.textContent : "";
    t = (t || "").replace(/[¶#]\s*$/, "").replace(/\s+/g, " ").trim();
    if (!t) t = (document.title || "").replace(/\s+[-|–—]\s+[^-|–—]*$/, "").trim();
    return t.slice(0, 120) || "OfferReady study library";
  }
  function currentContext() {
    return { surface: "study", page: { title: pageTitle(), path: location.pathname.slice(0, 200) } };
  }
  function isHome() {
    const p = location.pathname.replace(SITE_BASE, "/");
    return p === "/" || p === "/index.html";
  }

  const TOPICS = [
    [/\brag\b|retrieval[- ]augmented/i, "RAG"],
    [/retrieval[- ]tuning|rerank/i, "retrieval tuning"],
    [/vector/i, "vector databases"],
    [/\bmcp\b|model context protocol/i, "MCP"],
    [/agent/i, "AI agents"],
    [/snowflake|cortex/i, "Snowflake Cortex"],
    [/databricks|lakehouse/i, "Databricks"],
    [/\bdbt\b/i, "dbt"],
    [/\bsql\b/i, "SQL"],
    [/kubernetes|\bk8s\b/i, "Kubernetes"],
    [/observab|eval/i, "LLM evaluation"],
    [/llmops|deploy/i, "LLMOps"],
    [/security|guardrail|injection/i, "AI security"],
    [/prompt|context engineering/i, "prompt engineering"],
    [/\bllm\b|fundamental/i, "LLM fundamentals"],
    [/system design|architecture/i, "system design"],
    [/behavio|star\b/i, "behavioral interviews"],
    [/python|fastapi/i, "Python"],
    [/\baws\b|bedrock/i, "AWS"],
  ];
  function pageTopic() {
    const hay = pageTitle() + " " + location.pathname;
    for (const [re, label] of TOPICS) if (re.test(hay)) return label;
    return "";
  }
  function starters() {
    if (isHome()) {
      return ["What should I study first for an AI Engineer role?", "How do I use OfferReady with a real job?", "Quiz me on RAG", "What's the difference between the app and these notes?"];
    }
    const topic = pageTopic();
    const t = topic || pageTitle();
    const out = [];
    if (topic) out.push("Quiz me on " + topic);
    out.push("Give me a 2-minute interview answer on " + t);
    out.push("What do interviewers ask about " + t + "?");
    out.push("Summarize this page in 5 bullets");
    return out.slice(0, 4);
  }

  // ---- session state ------------------------------------------------------
  let state = load();
  let busy = false;
  let abortCtrl = null;

  function load() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      if (s && s.v === 2 && Array.isArray(s.msgs)) {
        s.msgs = s.msgs
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m) => (m.streaming ? Object.assign({}, m, { streaming: false, stopped: true }) : m));
        return s;
      }
    } catch (_) { /* blocked or corrupt */ }
    return { v: 2, msgs: [], open: false, wide: false, area: "all" };
  }
  function save() {
    try {
      const msgs = state.msgs.filter((m) => !m.streaming || m.content).slice(-MAX_STORED);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(Object.assign({}, state, { msgs })));
    } catch (_) { /* non-fatal */ }
  }

  // ---- DOM ------------------------------------------------------------------
  const root = el("div", "orh");
  root.id = "orh-root";
  root.innerHTML =
    '<section class="orh-panel" id="orh-panel" role="dialog" aria-modal="false" aria-labelledby="orh-title" hidden>' +
      '<header class="orh-head">' +
        '<div class="orh-head-top">' +
          '<div class="orh-title-row"><span class="orh-mark" aria-hidden="true">' + ICON.chat + '</span>' +
          '<h2 id="orh-title" class="orh-title">OfferReady Help</h2></div>' +
          '<div class="orh-tools">' +
            '<button type="button" class="orh-tool orh-new" title="Start a new chat">' + ICON.plus + "<span>New chat</span></button>" +
            '<button type="button" class="orh-tool orh-expand" aria-pressed="false" aria-label="Use a larger panel">' + ICON.expand + "</button>" +
            '<button type="button" class="orh-tool orh-close" aria-label="Close help">' + ICON.close + "</button>" +
          "</div>" +
        "</div>" +
        '<p class="orh-pill"><span class="orh-pill-dot" aria-hidden="true"></span><span class="orh-pill-text"></span></p>' +
      "</header>" +
      '<div class="orh-log" role="log" aria-label="Conversation"></div>' +
      '<div class="orh-sr" aria-live="polite" aria-atomic="true"></div>' +
      '<form class="orh-form" autocomplete="off">' +
        '<div class="orh-field"><textarea class="orh-input" rows="1" maxlength="' + MAX_CHARS + '" aria-label="Your question" ' +
        'placeholder="Ask about this page or any interview topic…"></textarea><span class="orh-count" aria-live="polite"></span></div>' +
        '<button type="submit" class="orh-send" aria-label="Send" disabled>' + ICON.send + "</button>" +
      "</form>" +
      '<p class="orh-foot">Enter to send · Shift+Enter for a new line</p>' +
    "</section>" +
    '<button type="button" class="orh-fab" aria-expanded="false" aria-haspopup="dialog" aria-controls="orh-panel">' +
      '<span class="orh-fab-icon">' + ICON.chat + '</span><span class="orh-fab-label">Ask OfferReady</span></button>';

  const $ = (sel) => root.querySelector(sel);
  const panel = $(".orh-panel");
  const fab = $(".orh-fab");
  const log = $(".orh-log");
  const form = $(".orh-form");
  const input = $(".orh-input");
  const sendBtn = $(".orh-send");
  const countEl = $(".orh-count");
  const pillText = $(".orh-pill-text");
  const live = $(".orh-sr");
  const newBtn = $(".orh-new");
  const expandBtn = $(".orh-expand");

  function mount() {
    if (!document.body.contains(root)) document.body.appendChild(root);
  }

  // ---- areas (best effort) ---------------------------------------------------
  let areas = [];
  let areasLoaded = false;
  function loadAreas() {
    if (areasLoaded) return;
    areasLoaded = true;
    fetch(API + AREAS_PATH)
      .then((r) => r.json())
      .then((d) => {
        areas = (d && Array.isArray(d.areas) ? d.areas : []).filter((a) => typeof a === "string" && a !== "all");
        if (!state.msgs.length) renderLog();
      })
      .catch(() => {});
  }

  // ---- rendering ------------------------------------------------------------
  let stick = true;
  log.addEventListener("scroll", () => {
    stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  });
  function scrollDown() { if (stick) log.scrollTop = log.scrollHeight; }

  function renderHeader() {
    pillText.textContent = "On: " + pageTitle();
    pillText.parentNode.title = pageTitle();
    newBtn.disabled = state.msgs.length === 0;
    panel.classList.toggle("orh-panel--wide", !!state.wide);
    expandBtn.setAttribute("aria-pressed", state.wide ? "true" : "false");
    expandBtn.setAttribute("aria-label", state.wide ? "Use a smaller panel" : "Use a larger panel");
    expandBtn.innerHTML = state.wide ? ICON.collapse : ICON.expand;
  }

  function renderWelcome() {
    const w = el("div", "orh-welcome");
    w.appendChild(el("p", "orh-welcome-title", "How can I help?"));
    w.appendChild(el("p", null, "Ask about this page, an interview topic, or how to prepare with OfferReady."));
    if (areas.length) {
      const lab = el("label", "orh-area");
      lab.appendChild(el("span", null, "Topic"));
      const sel = el("select");
      const all = el("option", null, "All topics"); all.value = "all"; sel.appendChild(all);
      areas.forEach((a) => { const o = el("option", null, a.replace(/-/g, " ")); o.value = a; sel.appendChild(o); });
      sel.value = state.area || "all";
      sel.addEventListener("change", () => { state.area = sel.value; save(); });
      lab.appendChild(sel);
      w.appendChild(lab);
    }
    const list = el("div", "orh-starters");
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Suggested questions");
    starters().forEach((s) => {
      const b = el("button", "orh-starter");
      b.type = "button";
      b.appendChild(el("span", null, s));
      b.insertAdjacentHTML("beforeend", ICON.arrow);
      b.addEventListener("click", () => ask(s));
      list.appendChild(b);
    });
    w.appendChild(list);
    return w;
  }

  function lastAssistantId() {
    for (let i = state.msgs.length - 1; i >= 0; i--) if (state.msgs[i].role === "assistant") return state.msgs[i].id;
    return "";
  }

  function renderMsg(m) {
    if (m.role === "user") {
      const d = el("div", "orh-msg orh-user");
      d.appendChild(el("p", null, m.content));
      return d;
    }
    const d = el("div", "orh-msg orh-bot" + (m.error ? " orh-err" : "") + (m.streaming ? " orh-streaming" : ""));
    d.dataset.id = m.id;
    if (m.streaming) d.setAttribute("aria-busy", "true");
    fillBot(d, m);
    return d;
  }

  function fillBot(d, m) {
    d.textContent = "";
    if (m.error) {
      const p = el("p");
      p.textContent = m.content;
      d.appendChild(p);
      if (m.hint === "local") {
        d.insertAdjacentHTML("beforeend",
          "<p>Start the local agent first:</p><pre><code>cd agent\nuvicorn serve:app --port 8000</code></pre>" +
          "<p>then reload. (Tip: <strong>start-chatbot.bat</strong>.)</p>");
      } else {
        d.insertAdjacentHTML("beforeend",
          '<p class="orh-note">In the meantime, use the <strong>search</strong> at the top of the page, or browse the topics from the left menu.</p>');
      }
      return;
    }
    const body = el("div", "orh-body");
    if (m.streaming && !m.content) {
      body.innerHTML = '<p class="orh-typing" aria-label="Writing an answer"><span></span><span></span><span></span></p>';
    } else {
      const html = renderMarkdown(m.content);
      body.innerHTML = m.streaming ? withCaret(html) : html;
    }
    d.appendChild(body);
    if (m.stopped) d.appendChild(el("p", "orh-note", "Stopped."));
    if (m.streaming || !m.content) return;

    if (m.actions && m.actions.length) {
      const row = el("div", "orh-actions");
      m.actions.forEach((a) => {
        const link = el("a", "orh-action");
        link.href = APP_URL + a.route;
        link.target = "_blank";
        link.rel = "noopener";
        link.appendChild(el("span", null, a.label));
        link.insertAdjacentHTML("beforeend", ICON.out);
        row.appendChild(link);
      });
      d.appendChild(row);
    }
    if (m.citations && m.citations.length) {
      const c = el("div", "orh-cites");
      c.appendChild(el("span", "orh-cites-label", "Read more"));
      m.citations.forEach((ct) => {
        const href = resolveCitationUrl(ct.url);
        if (href) {
          const a = el("a", null, ct.label + " ↗");
          a.href = href;
          a.target = "_blank";
          a.rel = "noopener";
          c.appendChild(a);
        } else {
          c.appendChild(el("span", null, ct.label));
        }
      });
      d.appendChild(c);
    }
    const meta = el("div", "orh-meta");
    const copyBtn = el("button", "orh-mini orh-copy");
    copyBtn.type = "button";
    copyBtn.setAttribute("aria-label", "Copy answer");
    copyBtn.innerHTML = ICON.copy + "<span>Copy</span>";
    copyBtn.addEventListener("click", () => copy(m, copyBtn));
    meta.appendChild(copyBtn);
    if (m.vote) {
      const t = el("span", "orh-thanks", "Thanks for the feedback");
      t.setAttribute("role", "status");
      meta.appendChild(t);
    } else {
      [["up", "Helpful"], ["down", "Not helpful"]].forEach(([v, label]) => {
        const b = el("button", "orh-mini orh-vote");
        b.type = "button";
        b.setAttribute("aria-label", label);
        b.innerHTML = ICON[v];
        b.addEventListener("click", () => vote(m, v));
        meta.appendChild(b);
      });
    }
    d.appendChild(meta);
    if (m.id === lastAssistantId() && m.followups && m.followups.length) {
      const f = el("div", "orh-followups");
      f.setAttribute("role", "group");
      f.setAttribute("aria-label", "Follow-up questions");
      m.followups.forEach((q) => {
        const b = el("button", "orh-follow", q);
        b.type = "button";
        b.disabled = busy;
        b.addEventListener("click", () => ask(q));
        f.appendChild(b);
      });
      d.appendChild(f);
    }
  }

  function renderLog() {
    log.textContent = "";
    if (!state.msgs.length) log.appendChild(renderWelcome());
    state.msgs.forEach((m) => log.appendChild(renderMsg(m)));
    renderHeader();
    scrollDown();
  }

  function rerender(m) {
    const node = log.querySelector('.orh-bot[data-id="' + m.id + '"]');
    if (!node) { renderLog(); return; }
    node.className = "orh-msg orh-bot" + (m.error ? " orh-err" : "") + (m.streaming ? " orh-streaming" : "");
    if (m.streaming) node.setAttribute("aria-busy", "true"); else node.removeAttribute("aria-busy");
    fillBot(node, m);
    scrollDown();
  }

  function setBusy(b) {
    busy = b;
    sendBtn.classList.toggle("orh-stop", b);
    sendBtn.type = b ? "button" : "submit";
    sendBtn.setAttribute("aria-label", b ? "Stop generating" : "Send");
    sendBtn.innerHTML = b ? ICON.stop + "<span>Stop</span>" : ICON.send;
    updateInput();
  }

  function updateInput() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
    const n = input.value.length;
    countEl.textContent = n > MAX_CHARS - 200 ? n + "/" + MAX_CHARS : "";
    if (!busy) sendBtn.disabled = !input.value.trim();
    else sendBtn.disabled = false;
  }

  // ---- open / close ----------------------------------------------------------
  function setOpen(open, opts) {
    state.open = open;
    save();
    panel.hidden = !open;
    root.classList.toggle("orh-is-open", open);
    fab.setAttribute("aria-expanded", open ? "true" : "false");
    fab.querySelector(".orh-fab-label").textContent = open ? "Close" : "Ask OfferReady";
    fab.querySelector(".orh-fab-icon").innerHTML = open ? ICON.close : ICON.chat;
    if (open) {
      loadAreas();
      renderLog();
      updateInput(); // measure the textarea now that it is visible
      if (!(opts && opts.restore)) setTimeout(() => input.focus(), 30);
    } else if (!(opts && opts.restore)) {
      fab.focus();
    }
  }

  fab.addEventListener("click", () => setOpen(panel.hidden));
  $(".orh-close").addEventListener("click", () => setOpen(false));
  expandBtn.addEventListener("click", () => { state.wide = !state.wide; save(); renderHeader(); });
  newBtn.addEventListener("click", () => {
    if (abortCtrl) abortCtrl.abort();
    state.msgs = [];
    save();
    live.textContent = "";
    renderLog();
    input.focus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) setOpen(false);
  });
  input.addEventListener("input", updateInput);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask(input.value);
    }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  sendBtn.addEventListener("click", (e) => {
    if (busy) { e.preventDefault(); if (abortCtrl) abortCtrl.abort(); }
  });

  // ---- copy + feedback --------------------------------------------------------
  function copy(m, btn) {
    const done = () => {
      btn.querySelector("span").textContent = "Copied";
      setTimeout(() => { btn.querySelector("span").textContent = "Copy"; }, 1600);
    };
    const fallback = () => {
      const ta = el("textarea");
      ta.value = m.content;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (_) { /* ignore */ }
      ta.remove();
      done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.content).then(done, fallback);
    else fallback();
  }
  function vote(m, v) {
    m.vote = v;
    save();
    try {
      const list = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "[]");
      list.unshift({ q: String(m.q || "").slice(0, 200), vote: v, page: location.pathname, at: Date.now() });
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list.slice(0, 50)));
    } catch (_) { /* ignore */ }
    rerender(m);
  }

  // ---- networking ----------------------------------------------------------
  function cleanExtras(d) {
    d = d || {};
    const citations = (Array.isArray(d.citations) ? d.citations : []).map((c) =>
      c && typeof c === "object" ? { label: String(c.label || c.url || ""), url: String(c.url || "") } : { label: String(c), url: "" },
    ).filter((c) => c.label).slice(0, 2);
    const actions = (Array.isArray(d.actions) ? d.actions : []).filter((a) =>
      a && typeof a.label === "string" && typeof a.route === "string" && /^\/[a-z0-9/-]*$/i.test(a.route),
    ).slice(0, 2).map((a) => ({ label: a.label.slice(0, 40), route: a.route }));
    const followups = (Array.isArray(d.followups) ? d.followups : []).filter((f) => typeof f === "string" && f.trim())
      .map((f) => f.trim().slice(0, 80)).slice(0, 3);
    return { citations, actions, followups };
  }

  function createSseParser() {
    let buf = "";
    return (chunk) => {
      buf += chunk.replace(/\r\n?/g, "\n");
      const frames = [];
      let cut;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        let event = "message";
        const data = [];
        block.split("\n").forEach((line) => {
          if (line.charAt(0) === ":") return;
          const i = line.indexOf(":");
          const field = i < 0 ? line : line.slice(0, i);
          const value = i < 0 ? "" : line.slice(i + 1).replace(/^ /, "");
          if (field === "event") event = value;
          else if (field === "data") data.push(value);
        });
        if (data.length) frames.push({ event, data: data.join("\n") });
      }
      return frames;
    };
  }

  /** Resolves {kind:'done'|'aborted'|'error', ...}; never throws. */
  async function streamAnswer(payload, onDelta, signal) {
    let gotDelta = false;
    let r;
    try {
      r = await fetch(API + ASK_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(Object.assign({}, payload, { k: 4, stream: true })),
        signal,
      });
    } catch (_) {
      return signal.aborted ? { kind: "aborted", gotDelta } : { kind: "error", status: 0, gotDelta };
    }
    const type = r.headers.get("Content-Type") || "";
    if (!r.ok || type.indexOf("text/event-stream") < 0) {
      let body = null;
      try { body = await r.json(); } catch (_) { body = null; }
      if (r.ok && body && body.answer) { onDelta(body.answer); return { kind: "done", extras: body }; }
      return { kind: "error", status: r.ok ? 502 : r.status, error: body && body.error, gotDelta };
    }
    if (!r.body) return { kind: "error", status: 200, gotDelta };
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    const parse = createSseParser();
    try {
      for (;;) {
        const res = await reader.read();
        const frames = parse(res.done ? decoder.decode() + "\n\n" : decoder.decode(res.value, { stream: true }));
        for (const f of frames) {
          let d;
          try { d = JSON.parse(f.data); } catch (_) { continue; }
          if (f.event === "delta" && typeof d.t === "string") { gotDelta = true; onDelta(d.t); }
          else if (f.event === "done") { reader.cancel().catch(() => {}); return { kind: "done", extras: d }; }
          else if (f.event === "error") return { kind: "error", status: 200, error: d && d.error, gotDelta };
        }
        if (res.done) break;
      }
    } catch (_) {
      return signal.aborted ? { kind: "aborted", gotDelta } : { kind: "error", status: 0, gotDelta };
    }
    return signal.aborted ? { kind: "aborted", gotDelta } : { kind: "error", status: 200, gotDelta };
  }

  async function plainAnswer(payload) {
    try {
      const r = await fetch(API + ASK_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, payload, { k: 4 })),
      });
      let body = null;
      try { body = await r.json(); } catch (_) { body = null; }
      return { status: r.status, body };
    } catch (_) {
      return { status: 0, body: null };
    }
  }

  function errorMessage(status, error) {
    if (!IS_HOSTED) return { text: "Can't reach the local agent.", hint: "local" };
    if (!HOSTED) return { text: "The assistant isn't enabled on this site yet." };
    if (status === 0) return { text: "Couldn't reach the assistant. Check your connection and try again." };
    if (status === 503) return { text: "The assistant isn't enabled right now." };
    return { text: error || "The assistant is unavailable right now. Please try again." };
  }

  async function ask(q) {
    const question = String(q || "").trim().slice(0, MAX_CHARS);
    if (!question || busy) return;
    const history = state.msgs
      .filter((m) => !m.error && m.content && m.content.trim())
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    const payload = { question, area: state.area || "all", history, context: currentContext() };

    state.msgs.push({ id: uid(), role: "user", content: question });
    const bot = { id: uid(), role: "assistant", content: "", streaming: true, q: question };
    state.msgs.push(bot);
    input.value = "";
    stick = true;
    setBusy(true);
    renderLog();
    save();

    const finishPlain = (res) => {
      if (res.status === 200 && res.body && res.body.answer) {
        Object.assign(bot, { content: String(res.body.answer).trim(), streaming: false }, cleanExtras(res.body));
        live.textContent = bot.content.slice(0, 600);
      } else {
        const e = errorMessage(res.status, res.body && res.body.error);
        Object.assign(bot, { content: e.text, hint: e.hint, error: true, streaming: false });
      }
    };

    if (!CAN_STREAM) {
      finishPlain(await plainAnswer(payload));
    } else {
      abortCtrl = new AbortController();
      let frame = 0;
      const out = await streamAnswer(payload, (t) => {
        bot.content += t;
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; rerender(bot); });
      }, abortCtrl.signal);
      if (frame) cancelAnimationFrame(frame);
      abortCtrl = null;
      if (out.kind === "done") {
        Object.assign(bot, { content: bot.content.trimEnd(), streaming: false }, cleanExtras(out.extras));
        live.textContent = bot.content.slice(0, 600);
      } else if (out.kind === "aborted") {
        Object.assign(bot, { content: bot.content.trimEnd(), streaming: false, stopped: true });
      } else if (out.gotDelta) {
        Object.assign(bot, { content: bot.content.trimEnd() + "\n\n*The answer was interrupted. Please try again.*", streaming: false, stopped: true });
      } else if (out.status === 0 || out.status === 200 || out.status === 502 || out.status === 504) {
        finishPlain(await plainAnswer(payload)); // stream never started: one plain request
      } else {
        const e = errorMessage(out.status, out.error);
        Object.assign(bot, { content: e.text, error: true, streaming: false });
      }
    }
    setBusy(false);
    save();
    if (state.msgs.indexOf(bot) >= 0) renderLog(); // "New chat" may have cleared it
    if (!panel.hidden) setTimeout(() => input.focus(), 30);
  }

  // ---- boot + instant navigation -------------------------------------------
  function onPageChange() {
    mount();
    if (!panel.hidden) {
      renderHeader();
      if (!state.msgs.length) renderLog(); // starters follow the page
    }
  }

  mount();
  if (state.open && !isMobile()) setOpen(true, { restore: true });
  else renderHeader();
  updateInput();

  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(() => onPageChange());
  } else {
    window.addEventListener("popstate", onPageChange);
  }
  // Belt and braces: reattach if a page swap ever removes the widget.
  if (typeof MutationObserver !== "undefined") {
    let pending = false;
    new MutationObserver(() => {
      if (pending || document.body.contains(root)) return;
      pending = true;
      setTimeout(() => { pending = false; onPageChange(); }, 0);
    }).observe(document.body, { childList: true });
  }
})();
