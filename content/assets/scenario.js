/* OfferReady — Scenario practice engine (Phase 3).
 * ---------------------------------------------------------------------------
 * The Pro differentiator: step through a defend-your-decision scenario tree
 * (Scenario -> Decision -> Why -> Trade-off -> Constraint -> Incident ->
 * Reflection -> Next). Deterministic (branches live in the data). Designed so
 * an LLM interviewer can be added later without changing traversal/storage.
 *
 * ACCESS (spec §28/§34):
 *   - Teasers are fetched from the PUBLIC list endpoint (no auth).
 *   - The FULL tree is fetched ONLY via the authorized endpoint with the user's
 *     Supabase Bearer token. Authorization is enforced SERVER-SIDE; this client
 *     merely reflects 401/403/200. A tampered client cannot unlock content
 *     because the protected body simply isn't in the static site or the teaser.
 *   - Fail closed: any error => show the teaser + upgrade/sign-in CTA.
 *
 * Mounts on #scenario-app. Session state saved to Supabase practice_sessions
 * when signed in, else localStorage.
 */
(function () {
  "use strict";

  var API = (typeof window !== "undefined" && window.OFFERREADY_API_BASE) || "";
  var STORE_KEY = "or_scenario_sessions_v1";

  function init() {
    var app = document.getElementById("scenario-app");
    if (!app || app.dataset.mounted) return;
    app.dataset.mounted = "1";

    var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
    var base = (window.__md_scope && window.__md_scope.pathname ? window.__md_scope.pathname.replace(/[^/]*$/, "") : "/");

    var state = null; // active run

    // Resolve the Supabase access token (or null), then build headers.
    function withHeaders(cb) {
      if (window.OfferReadyAuth && window.OfferReadyAuth.getAccessToken) {
        window.OfferReadyAuth.getAccessToken().then(function (tok) {
          cb(tok ? { Authorization: "Bearer " + tok } : {});
        }).catch(function () { cb({}); });
      } else { cb({}); }
    }

    if (!API) {
      app.innerHTML = "";
      app.appendChild(el("div", "or-demo-banner",
        "\uD83E\uDDEA Scenario practice isn't connected on this build yet. This is where the Pro defend-your-decision scenarios run."));
      return;
    }

    renderList();

    // ---- Scenario list (public teasers) -----------------------------------
    function renderList() {
      app.innerHTML = "";
      app.appendChild(el("p", "ip-ai-hint", "Loading scenarios\u2026"));
      withHeaders(function (h) {
      fetch(API + "/api/premium/scenarios", { headers: h })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          app.innerHTML = "";
          var list = (d && d.scenarios) || [];
          if (!list.length) { app.appendChild(el("p", "ip-ai-hint", "No scenarios published yet.")); return; }
          app.appendChild(el("h2", null, "Defend-your-decision scenarios"));
          app.appendChild(el("p", "ip-ai-hint",
            "Practice the decisions senior AI engineers defend under pressure. Sign in with OfferReady Pro to open the full tree; everyone can preview."));
          list.forEach(function (s) { app.appendChild(card(s)); });
        })
        .catch(function () {
          app.innerHTML = "";
          app.appendChild(el("div", "or-error", "Couldn't load scenarios right now. Please try again."));
        });
      });
    }

    function card(s) {
      var c = el("div", "or-scn-card");
      c.appendChild(el("span", "ip-topic", esc((s.category || "").toUpperCase())));
      c.appendChild(el("h3", null, esc(s.title)));
      var t = s.teaser || {};
      if (t.setup) c.appendChild(el("p", null, esc(t.setup)));
      if ((t.you_will_practice || []).length) {
        var ul = el("ul");
        t.you_will_practice.forEach(function (x) { ul.appendChild(el("li", null, esc(x))); });
        c.appendChild(ul);
      }
      var row = el("div", "ip-controls");
      var open = el("button", "ip-btn", s.entitled ? "Start scenario" : "Open scenario");
      open.addEventListener("click", function () { openScenario(s.slug, s); });
      row.appendChild(open);
      if (!s.entitled) row.appendChild(el("span", "or-scn-lock", "\uD83D\uDD12 Pro"));
      c.appendChild(row);
      return c;
    }

    // ---- Open a scenario (authorized fetch of the full tree) ---------------
    function openScenario(slug, teaserItem) {
      app.innerHTML = "";
      app.appendChild(el("p", "ip-ai-hint", "Opening\u2026"));
      withHeaders(function (h) {
      fetch(API + "/api/premium/scenarios/" + encodeURIComponent(slug), { headers: h })
        .then(function (r) {
          return r.json().then(function (d) { return { status: r.status, body: d }; });
        })
        .then(function (res) {
          if (res.status === 200 && res.body && res.body.scenario) {
            startRun(res.body.scenario);
          } else if (res.status === 401) {
            gate("sign-in", teaserItem);
          } else if (res.status === 403) {
            gate("upgrade", teaserItem, res.body);
          } else {
            app.innerHTML = "";
            app.appendChild(el("div", "or-error", esc((res.body && res.body.error) || "Couldn't open this scenario.")));
            backToList();
          }
        })
        .catch(function () {
          app.innerHTML = "";
          app.appendChild(el("div", "or-error", "Couldn't reach the scenario service."));
          backToList();
        });
      });
    }

    // ---- Paywall / sign-in gate --------------------------------------------
    function gate(kind, teaserItem, body) {
      app.innerHTML = "";
      var t = (teaserItem && teaserItem.teaser) || (body && body.teaser) || {};
      var wrap = el("div", "or-paywall");
      wrap.appendChild(el("h2", null, esc((teaserItem && teaserItem.title) || (body && body.title) || "OfferReady Pro scenario")));
      if (t.setup) wrap.appendChild(el("p", null, esc(t.setup)));
      // Show the ONE sample node as proof of quality (from the public teaser).
      if (t.sample_node) {
        var sn = t.sample_node;
        var box = el("div", "ip-model");
        box.appendChild(el("div", "or-field-label", "Sample \u2014 one node from this scenario"));
        box.appendChild(el("div", "ip-q", esc(sn.prompt)));
        if (sn.model) box.appendChild(el("p", null, "<strong>Strong answer:</strong> " + esc(sn.model)));
        wrap.appendChild(box);
      }
      if (kind === "sign-in") {
        wrap.appendChild(el("p", "ip-ai-hint", "Sign in to your OfferReady Pro account to run the full scenario."));
        var slot = el("div"); slot.id = "or-auth-slot"; wrap.appendChild(slot);
        if (window.OfferReadyAuth) window.OfferReadyAuth.onChange(function () {});
      } else {
        wrap.appendChild(el("p", "ip-ai-hint",
          "This is part of <strong>OfferReady Pro</strong> \u2014 the complete defend-your-decision library, with progress tracking. Everything you learn and sample is free; Pro is where you practice and defend."));
        var cta = el("a", "ip-btn"); cta.href = base + "assets/pricing.html"; cta.textContent = "See Free vs Pro";
        wrap.appendChild(cta);
      }
      var back = el("button", "ip-btn ip-ghost"); back.textContent = "\u2039 All scenarios";
      back.addEventListener("click", renderList);
      wrap.appendChild(back);
      app.appendChild(wrap);
    }

    // ---- Run the tree ------------------------------------------------------
    function startRun(scenario) {
      state = { slug: scenario.slug, title: scenario.title, nodes: scenario.content.nodes || {},
                current: scenario.content.start, answers: {}, ratings: {}, startedAt: Date.now() };
      renderNode();
    }

    function renderNode() {
      var node = state.nodes[state.current];
      app.innerHTML = "";
      if (!node) { return renderSummary(); }
      var card = el("div", "ip-card");
      card.appendChild(el("div", "ip-progress", esc(state.title) + " \u00b7 " + esc(node.kind)));
      card.appendChild(el("div", "ip-q", esc(node.prompt)));

      if (node.kind === "choice") {
        (node.options || []).forEach(function (opt) {
          var b = el("button", "ip-btn ip-ghost", esc(opt.label));
          b.addEventListener("click", function () {
            state.answers[node.id] = opt.label;
            if (opt.note) card.appendChild(el("p", "ip-ai-hint", esc(opt.note)));
            advance(opt.next);
          });
          card.appendChild(b);
        });
      } else if (node.kind === "next_drill") {
        var recs = el("div", "or-reslist");
        (node.recommend || []).forEach(function (r) {
          var a = el("a", "or-reslink"); a.href = r.path ? (base + r.path) : "#"; a.textContent = r.label; recs.appendChild(a);
        });
        card.appendChild(recs);
        var done = el("button", "ip-btn"); done.textContent = "Finish"; done.addEventListener("click", renderSummary);
        card.appendChild(done);
      } else if (node.kind === "reflection") {
        (node.checklist || []).forEach(function (item) {
          var lab = el("label", "or-check"); lab.innerHTML = '<input type="checkbox"> ' + esc(item); card.appendChild(lab);
        });
        var cont = el("button", "ip-btn"); cont.textContent = "Continue"; cont.addEventListener("click", function () { advance(node.next); });
        card.appendChild(cont);
      } else {
        // decision | why | tradeoff | constraint | incident: answer -> reveal -> rate
        var ta = el("textarea", "ip-answerbox"); ta.placeholder = "Answer out loud, then type the gist and reveal the strong answer."; ta.rows = 5;
        card.appendChild(ta);
        var reveal = el("button", "ip-btn", "Reveal strong answer");
        card.appendChild(reveal);
        var modelWrap = el("div");
        reveal.addEventListener("click", function () {
          reveal.disabled = true;
          state.answers[node.id] = ta.value;
          var m = el("div", "ip-model", "<h4>Strong answer</h4>" + esc(node.model || ""));
          if ((node.signals || []).length) {
            var s = el("div"); s.appendChild(el("div", "or-field-label", "A strong answer shows"));
            var ul = el("ul"); node.signals.forEach(function (x) { ul.appendChild(el("li", null, esc(x))); }); s.appendChild(ul);
            m.appendChild(s);
          }
          modelWrap.appendChild(m);
          modelWrap.appendChild(rateRow(node));
        });
        card.appendChild(modelWrap);
      }
      app.appendChild(card);
    }

    function rateRow(node) {
      var wrap = el("div");
      wrap.appendChild(el("div", "ip-progress", "How well did you defend it?"));
      var rate = el("div", "ip-rate");
      ["1 \u00b7 hand-waved", "2", "3 \u00b7 partial", "4", "5 \u00b7 nailed it"].forEach(function (lab, i) {
        var b = el("button", "ip-star", esc(lab));
        b.addEventListener("click", function () { state.ratings[node.id] = i + 1; advance(node.next); });
        rate.appendChild(b);
      });
      wrap.appendChild(rate);
      return wrap;
    }

    function advance(next) { state.current = next; if (!next) return renderSummary(); renderNode(); }

    function renderSummary() {
      var ratings = Object.keys(state.ratings).map(function (k) { return state.ratings[k]; });
      var avg = ratings.length ? ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length : 0;
      var pct = Math.round((avg / 5) * 100);
      persistSession(pct, ratings.length);
      app.innerHTML = "";
      var wrap = el("div", "ip-card ip-summary");
      wrap.appendChild(el("div", "ip-score", (ratings.length ? pct + "%" : "\u2713")));
      wrap.appendChild(el("p", null, esc(state.title) + " \u2014 " + ratings.length + " decisions defended."));
      wrap.appendChild(el("p", null, pct >= 80 ? "Strong \u2014 you held the line under follow-ups."
        : pct >= 60 ? "Solid. Revisit the ones you rated low and run it again."
        : "Good start. Re-read the strong answers, then rerun."));
      var again = el("button", "ip-btn", "All scenarios");
      again.addEventListener("click", renderList);
      wrap.appendChild(again);
      app.appendChild(wrap);
    }

    function backToList() {
      var b = el("button", "ip-btn ip-ghost", "\u2039 All scenarios");
      b.addEventListener("click", renderList); app.appendChild(b);
    }

    // ---- persistence -------------------------------------------------------
    function persistSession(score, n) {
      var rec = { slug: state.slug, score: score, n: n, mode: "scenario",
                  category: state.slug, completed: true, when: new Date().toISOString() };
      // Also record into the shared Progress store so scenario runs show on the
      // dashboard alongside Practice + Why (reuse of the shared store).
      try {
        if (window.OfferReadyProgress) {
          window.OfferReadyProgress.record({
            mode: "scenario", track: "Scenarios", topic: state.title || state.slug,
            score: score, n: n, topics: state.title ? { [state.title]: score } : {},
          });
        }
      } catch (e) {}
      // Signed in -> Supabase practice_sessions (own row via RLS). Else local.
      if (window.OfferReadyAuth) {
        window.OfferReadyAuth.getAccessToken().then(function (tok) {
          if (!tok || !window.OFFERREADY_SUPABASE_URL) { localSave(rec); return; }
          fetch(window.OFFERREADY_SUPABASE_URL + "/rest/v1/practice_sessions", {
            method: "POST",
            headers: {
              apikey: window.OFFERREADY_SUPABASE_ANON_KEY,
              Authorization: "Bearer " + tok,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({ content_slug: rec.slug, category: rec.category,
                                   mode: "scenario", score: score, completed: true,
                                   completed_at: rec.when }),
          }).catch(function () { localSave(rec); });
        }).catch(function () { localSave(rec); });
      } else { localSave(rec); }
    }
    function localSave(rec) {
      try { var h = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); h.unshift(rec);
            localStorage.setItem(STORE_KEY, JSON.stringify(h.slice(0, 50))); } catch (e) {}
    }

  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch (e) {} }
})();
