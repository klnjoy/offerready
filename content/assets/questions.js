/* OfferReady — JD-driven Interview Question Generator.
 * ---------------------------------------------------------------------------
 * Mounts on #questions-app. Paste a job description -> POST /api/ai
 * { action: "generate_questions" } -> render a categorized question set:
 *   Technical (10) · Behavioral (10) · System Design (5) · Leadership (5)
 * each with an Easy / Medium / Hard difficulty badge.
 *
 * Grouped by category with counts. A generated set is cached in localStorage
 * (keyed by a hash of the JD + role) so re-opening the same job is instant and
 * free. All client-side; requires sign-in (the endpoint enforces it).
 */

(function () {
  "use strict";

  var API = (typeof window !== "undefined" && window.OFFERREADY_API_BASE) || "";
  var CACHE_PREFIX = "offerready.questions.v1.";

  var CATEGORY_LABEL = {
    technical: "Technical",
    behavioral: "Behavioral",
    system_design: "System Design",
    leadership: "Leadership",
  };
  var CATEGORY_ORDER = ["technical", "behavioral", "system_design", "leadership"];

  function init() {
    var app = document.getElementById("questions-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";

    var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };

    var state = { jd: "", role: "" };
    renderForm();

    function cacheKey(jd, role) {
      var basis = (role || "") + "|" + (jd || "").slice(0, 400);
      var h = 0;
      for (var i = 0; i < basis.length; i++) { h = ((h << 5) - h + basis.charCodeAt(i)) | 0; }
      return CACHE_PREFIX + (h >>> 0).toString(36);
    }

    function renderForm(note) {
      app.innerHTML = "";
      var card = el("div", "or-card");
      card.appendChild(el("h2", null, "Generate interview questions"));
      card.appendChild(el("p", "or-muted", "Paste a job description and get a full, categorized question set \u2014 the questions you're actually likely to be asked for this role."));
      if (note) card.appendChild(el("p", "or-error", esc(note)));

      var role = el("input", "or-input"); role.type = "text"; role.placeholder = "Target role (optional)"; role.value = state.role || "";
      card.appendChild(el("label", "or-field-label", "Target role")); card.appendChild(role);

      var jd = el("textarea", "or-input or-textarea"); jd.rows = 9; jd.placeholder = "Paste the full job description here\u2026"; jd.value = state.jd || "";
      card.appendChild(el("label", "or-field-label", "Job description")); card.appendChild(jd);

      var go = el("button", "or-btn or-btn-primary", "Generate questions");
      go.addEventListener("click", function () {
        state.role = role.value.trim(); state.jd = jd.value.trim();
        submit();
      });
      card.appendChild(go);
      app.appendChild(card);
    }

    function submit() {
      if (state.jd.length < 30) { renderForm("Please paste a fuller job description first."); return; }

      // Cache hit -> render instantly.
      var key = cacheKey(state.jd, state.role);
      try {
        var cached = JSON.parse(localStorage.getItem(key) || "null");
        if (cached && Array.isArray(cached.questions) && cached.questions.length) {
          renderResult(cached.questions, cached.counts, true); return;
        }
      } catch (e) {}

      app.innerHTML = "";
      var loading = el("div", "or-card"); loading.appendChild(el("p", "or-muted", "Generating your question set\u2026"));
      app.appendChild(loading);

      resolveToken(function (headers) {
        fetch(API + "/api/ai", {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, headers),
          body: JSON.stringify({
            action: "generate_questions",
            jobTitle: state.role, targetRole: state.role, jobDescription: state.jd,
          }),
        }).then(function (r) {
          return r.json().then(function (d) { return { status: r.status, body: d }; });
        }).then(function (res) {
          if (res.status === 200 && res.body && res.body.questions) {
            try { localStorage.setItem(key, JSON.stringify({ questions: res.body.questions, counts: res.body.counts })); } catch (e) {}
            renderResult(res.body.questions, res.body.counts, false);
          } else if (res.status === 401) {
            renderForm("Sign in (top-right Account) to generate questions \u2014 then try again.");
          } else if (res.status === 503) {
            renderForm("Question generation isn't enabled on this deployment yet.");
          } else {
            renderForm((res.body && res.body.error) || "Couldn't generate the question set. Please try again.");
          }
        }).catch(function () {
          renderForm("Couldn't reach the generator. Check your connection and try again.");
        });
      });
    }

    function diffBadge(d) {
      var cls = d === "hard" ? "or-diff-hard" : d === "easy" ? "or-diff-easy" : "or-diff-med";
      return '<span class="or-diff ' + cls + '">' + esc(d || "medium") + "</span>";
    }

    function renderResult(questions, counts, cached) {
      app.innerHTML = "";
      var head = el("div", "or-card");
      head.appendChild(el("h2", null, "Your interview question set"));
      var total = questions.length;
      head.appendChild(el("p", "or-muted", total + " questions generated" + (cached ? " (cached)" : "") + " \u00b7 answer them out loud, then practice defending your decisions."));
      var again = el("button", "or-btn", "Generate for another job");
      again.addEventListener("click", function () { renderForm(); });
      head.appendChild(again);
      app.appendChild(head);

      var byCat = {};
      questions.forEach(function (q) { (byCat[q.category] = byCat[q.category] || []).push(q); });

      CATEGORY_ORDER.forEach(function (cat) {
        var list = byCat[cat];
        if (!list || !list.length) return;
        var card = el("div", "or-card");
        card.appendChild(el("h3", null, esc(CATEGORY_LABEL[cat] || cat) + " <span class=\"or-muted or-small\">(" + list.length + ")</span>"));
        var ol = el("ol", "or-qlist");
        list.forEach(function (q) {
          var li = el("li", "or-qitem");
          li.innerHTML = diffBadge(q.difficulty) + " " + esc(q.prompt);
          ol.appendChild(li);
        });
        card.appendChild(ol);
        app.appendChild(card);
      });

      var foot = el("div", "or-card or-actions");
      foot.innerHTML =
        '<a class="or-btn or-btn-primary" href="../Practice-Scenarios/index.html">\uD83D\uDDE1\ufe0f Practice & defend answers</a>' +
        '<a class="or-btn" href="../Dashboard/index.html">\uD83D\uDCCA Readiness dashboard</a>';
      app.appendChild(foot);
    }

    function resolveToken(cb) {
      if (window.OfferReadyAuth && window.OfferReadyAuth.getAccessToken) {
        window.OfferReadyAuth.getAccessToken().then(function (tok) {
          cb(tok ? { Authorization: "Bearer " + tok } : {});
        }).catch(function () { cb({}); });
      } else { cb({}); }
    }
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch (e) {} }
})();
