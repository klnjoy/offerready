/* Onboarding — the fast, job-first entry (spec §23/§24).
   "What are you preparing for?" (role) + "How soon?" (timeline) → hands off to
   Analyze with the role prefilled so the user reaches a first useful result in
   a couple of clicks. Pure client-side; no backend. Choices are also saved to
   localStorage so other pages can personalize later. Mounts on #onboarding-app,
   survives navigation.instant. */
(function () {
  "use strict";

  var ROLES = [
    "AI / GenAI Engineer",
    "AI Solutions Architect",
    "Forward Deployed Engineer",
    "Software Engineer",
    "Data Engineer",
    "DevOps / Platform",
    "Other",
  ];
  var TIMELINES = ["This week", "1\u20132 weeks", "2\u20134 weeks", "More than a month"];
  var STORE_KEY = "offerready.onboarding.v1";

  function init() {
    var app = document.getElementById("onboarding-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";

    var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    var base = (window.__md_scope && window.__md_scope.pathname ? window.__md_scope.pathname.replace(/[^/]*$/, "") : "/");

    var state = { role: null, timeline: null };
    try { var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); if (saved) state = Object.assign(state, saved); } catch (e) {}

    render();

    function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

    function render() {
      app.innerHTML = "";
      var card = el("div", "or-onboard");
      card.appendChild(el("div", "or-onboard-step", "1 \u00b7 What are you preparing for?"));
      card.appendChild(chipRow(ROLES, "role"));
      card.appendChild(el("div", "or-onboard-step", "2 \u00b7 How soon is your interview?"));
      card.appendChild(chipRow(TIMELINES, "timeline"));

      var go = el("a", "ip-btn or-onboard-go");
      go.textContent = "Analyze My Job \u2192";
      updateGo(go);
      card.appendChild(go);

      card.appendChild(el("p", "ip-ai-hint",
        "You\u2019ll paste the job description on the next step \u2014 we\u2019ll map its requirements, find your gaps, and build a plan."));
      app.appendChild(card);
    }

    function chipRow(items, key) {
      var row = el("div", "or-onboard-chips");
      items.forEach(function (it) {
        var chip = el("button", "or-onboard-chip" + (state[key] === it ? " on" : ""));
        chip.type = "button"; chip.textContent = it;
        chip.addEventListener("click", function () {
          state[key] = it; persist();
          row.querySelectorAll(".or-onboard-chip").forEach(function (c) { c.classList.remove("on"); });
          chip.classList.add("on");
          var go = app.querySelector(".or-onboard-go"); if (go) updateGo(go);
        });
        row.appendChild(chip);
      });
      return row;
    }

    function updateGo(go) {
      var role = state.role && state.role !== "Other" ? state.role : "";
      var href = base + "Analyze/index.html";
      if (role) href += "?role=" + encodeURIComponent(role);
      go.href = href;
    }
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch (e) {} }
})();
