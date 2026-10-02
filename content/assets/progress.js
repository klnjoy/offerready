/* Practice history WIDGET (not a dashboard).
   ---------------------------------------------------------------------------
   OfferReady has ONE readiness dashboard (readiness.js on #dashboard-app). This
   file no longer renders a second, competing dashboard. It mounts on #ip-dash
   (the "Progress Detail" page under Practice) and shows only the practice
   SESSION HISTORY that the main Dashboard does not: a per-topic strength
   breakdown and a recent-sessions table from local practice history
   (ip_history_v1, written by practice.js). The duplicate readiness stat cards,
   "Next up" panel, and score-over-time chart were removed — those live on the
   readiness Dashboard, which is the single source of truth.

   All client-side. Mounts only if #ip-dash exists. Survives navigation.instant. */

(function () {
  function init() {
    const root = document.getElementById("ip-dash");
    if (!root || root.dataset.mounted) return;
    root.dataset.mounted = "1";

    const STORE_KEY = "ip_history_v1";
    const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } }

    function render() {
      const h = load();
      root.innerHTML = "";

      // Point users at the single readiness dashboard for their score/trend.
      // Be explicit: these are LOCAL practice sessions (this browser only) and
      // do NOT update Interview Readiness. Job-scoped readiness activity lives
      // on the Dashboard — keep the two visibly separate.
      // Practice activity falls into two distinct buckets. Name both so the
      // user knows which is which and where each lives:
      //   • Readiness Activity — job-scoped, persisted, affects readiness (Dashboard)
      //   • Local Practice     — this browser only, does NOT affect readiness (here)
      root.appendChild(el("div", "ip-card",
        '<p><strong>Two kinds of practice are tracked separately:</strong></p>' +
        '<ul>' +
        '<li><strong>Readiness Activity</strong> \u2014 job-scoped and saved to your account ' +
        '(Defend Your Decisions). It <strong>affects Interview Readiness</strong> and appears on the ' +
        '<a href="../Dashboard/index.html">Readiness Dashboard</a>.</li>' +
        '<li><strong>Local Practice</strong> \u2014 this browser only (Practice Mode, Keep Asking Why, ' +
        'Mock Interview). It <strong>does not currently update Interview Readiness</strong>.</li>' +
        '</ul>' +
        '<p class="ip-ai-hint">The sessions below are your <strong>Local Practice</strong> on this device.</p>'));

      if (!h.length) {
        root.appendChild(el("div", "ip-card",
          '<p>No practice sessions yet. Do a drill and it shows up here:</p>' +
          '<p><a class="ip-btn" href="Interview_Practice.html">📝 Practice mode</a> ' +
          '<a class="ip-btn ip-ghost" href="Interview_Why_Interactive.html">🗡️ Keep Asking Why</a></p>'));
        return;
      }

      // ---- per-topic strength (practice-history specific; not on the dashboard) ----
      const topicAgg = {};
      h.forEach((s) => {
        const tp = s.topics || {};
        Object.entries(tp).forEach(([t, pct]) => {
          (topicAgg[t] = topicAgg[t] || []).push(pct);
        });
      });
      const rows = Object.entries(topicAgg)
        .map(([t, arr]) => [t, Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), arr.length])
        .sort((a, b) => a[1] - b[1]); // weakest first
      if (rows.length) {
        root.appendChild(el("h2", null, "Local Practice \u2014 strength by topic"));
        const wrap = el("div", "ip-topics");
        rows.forEach(([t, pct, n]) => {
          const cls = pct >= 80 ? "ip-good" : pct >= 60 ? "ip-mid" : "ip-weak";
          wrap.appendChild(el("div", "ip-topicrow",
            `<div class="ip-topiclbl">${esc(t)} <small>(${n})</small></div>` +
            `<div class="ip-topicbar"><div class="${cls}" style="width:${pct}%"></div></div>` +
            `<div class="ip-topicpct">${pct}%</div>`));
        });
        root.appendChild(wrap);
        const weak = rows.filter((r) => r[1] < 60).map((r) => r[0]);
        if (weak.length) {
          root.appendChild(el("p", "ip-ai-hint",
            "Focus areas: " + weak.map(esc).join(", ") + " — revisit those banks and retake."));
        }
      }

      // ---- recent sessions table (Local Practice only) ----
      root.appendChild(el("h2", null, "Local Practice \u2014 recent sessions"));
      let t = '<table><thead><tr><th>When</th><th>Mode</th><th>Track</th><th>Topic</th><th>Q</th><th>Score</th></tr></thead><tbody>';
      const MODE_LABEL = { practice: "Practice", flashcard: "Flashcards", exam: "Timed Exam", why: "Keep Asking Why", scenario: "Scenario" };
      h.slice(0, 15).forEach((s) => {
        const modeLbl = MODE_LABEL[s.mode] || (s.mode || "Practice");
        const count = s.total ? `${s.n || 0} / ${s.total}` : (s.n || 0);
        const topicCell = esc(s.topic || "") + (s.partial ? ' <span class="ip-inprogress">· in progress</span>' : "");
        t += `<tr><td>${esc(s.when || "")}</td><td>${esc(modeLbl)}</td><td>${esc(s.track || "")}</td><td>${topicCell}</td><td>${count}</td><td>${s.score || 0}%</td></tr>`;
      });
      t += "</tbody></table>";
      root.appendChild(el("div", null, t));

      // ---- reset ----
      const reset = el("button", "ip-btn ip-ghost", "Clear my practice history");
      reset.style.marginTop = "1rem";
      reset.addEventListener("click", () => {
        if (confirm("Clear all saved practice history from this browser?")) {
          localStorage.removeItem(STORE_KEY); render();
        }
      });
      root.appendChild(reset);
    }

    render();
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch {} }
})();
