/* Quick check at the end of a topic page: three true-or-false statements on
   that topic, from the same statements as the OfferReady daily AI check
   (served by the app as /ai-facts.json). Pick an answer to see whether it's
   true and why. The three change each day. If the statements can't be
   loaded (e.g. the library opened outside getofferready.app), nothing shows.
   Survives navigation.instant. */
(function () {
  "use strict";

  // Library page folder -> AI check topic.
  var TOPICS = {
    "llm-fundamentals": "LLM basics",
    "prompt-engineering": "Prompting",
    "context-engineering": "Prompting",
    "rag": "RAG",
    "retrieval-tuning": "RAG",
    "embeddings": "Embeddings",
    "vector-db": "Embeddings",
    "observability": "Evals",
    "agent-architecture": "Agents",
    "agent-engineering": "Agents",
    "agent-principles": "Agents",
    "llmops": "Serving",
    "cost-optimization": "Serving",
    "AI-Security": "Safety",
  };
  var PER_PAGE = 3;
  var CHECK_URL = "https://getofferready.app/check/concepts";
  var factsPromise = null;

  function topicForPath(path) {
    var m = path.match(/\/GenAI-Topics\/([^/]+)\//);
    if (m && TOPICS[m[1]]) return TOPICS[m[1]];
    if (/\/AI-Security\/(index\.html)?$/.test(path)) return TOPICS["AI-Security"];
    return null;
  }

  function loadFacts() {
    if (!factsPromise) {
      var url = /(^|\.)getofferready\.app$|^localhost$|^127\.0\.0\.1$/.test(location.hostname) ? "/ai-facts.json" : "https://getofferready.app/ai-facts.json";
      factsPromise = fetch(url, { credentials: "omit" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return j && Array.isArray(j.facts) ? j.facts : []; })
        .catch(function () { return []; });
    }
    return factsPromise;
  }

  // Same three all day, different tomorrow: a small seeded shuffle.
  function pick(list, seedText, n) {
    var h = 2166136261;
    for (var i = 0; i < seedText.length; i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
      var k = h % (j + 1);
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a.slice(0, n);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function render(host, topic, facts) {
    var box = el("section", "tq");
    box.setAttribute("aria-labelledby", "tq-h");
    var head = el("div", "tq-head");
    head.appendChild(el("h2", null, "Quick check")).id = "tq-h";
    head.appendChild(el("p", "tq-sub", "Three statements on " + topic + ". True or false?"));
    box.appendChild(head);
    var list = el("ol", "tq-list");
    var answered = 0, right = 0;
    var score = el("p", "tq-score");
    score.setAttribute("aria-live", "polite");

    facts.forEach(function (f, i) {
      var li = el("li", "tq-item");
      li.appendChild(el("p", "tq-s", f.s));
      var row = el("div", "tq-btns");
      var result = el("div", "tq-result");
      result.hidden = true;
      [true, false].forEach(function (val) {
        var b = el("button", "tq-btn", val ? "True" : "False");
        b.type = "button";
        b.addEventListener("click", function () {
          if (li.classList.contains("is-done")) return;
          li.classList.add("is-done");
          var ok = val === f.a;
          answered++; if (ok) right++;
          b.classList.add(ok ? "is-right" : "is-wrong");
          row.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
          result.className = "tq-result " + (ok ? "is-right" : "is-wrong");
          result.textContent = "";
          result.appendChild(el("strong", null, (ok ? "✓ Right. " : "✗ Not quite. ") + "It's " + (f.a ? "true." : "false.")));
          result.appendChild(document.createTextNode(" " + f.why));
          result.hidden = false;
          if (answered === facts.length) score.textContent = "You got " + right + " of " + facts.length + ". New statements tomorrow.";
        });
        row.appendChild(b);
      });
      li.appendChild(row);
      li.appendChild(result);
      list.appendChild(li);
    });
    box.appendChild(list);
    box.appendChild(score);
    var more = el("a", "tq-more", "Practice all AI concepts ›");
    more.href = CHECK_URL;
    more.target = "_top";
    box.appendChild(more);
    host.appendChild(box);
  }

  function init() {
    var host = document.querySelector(".md-content__inner");
    if (!host || host.querySelector(".tq")) return;
    var topic = topicForPath(location.pathname);
    if (!topic) return;
    loadFacts().then(function (all) {
      if (host.querySelector(".tq") || !document.body.contains(host)) return;
      var mine = all.filter(function (f) { return f && f.topic === topic && f.s && f.why; });
      if (mine.length < PER_PAGE) return;
      var day = new Date().toISOString().slice(0, 10);
      render(host, topic, pick(mine, day + "|" + location.pathname, PER_PAGE));
    });
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch (e) { /* older theme */ } }
})();
