/* Interview Progress dashboard — reads localStorage (ip_history_v1) written by
   practice.js and renders stats, a score-over-time chart (inline SVG, no lib),
   a per-topic strength breakdown, and recent sessions. All client-side.
   Mounts only if #ip-dash exists. Survives navigation.instant. */

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

      // "Next up" — recommended drills from the latest Analyze run (closes the
      // loop: Analyze -> Practice/Why). Shown whether or not sessions exist.
      root.appendChild(recommended());

      if (!h.length) {
        root.appendChild(el("div", "ip-card",
          '<p>No practice sessions yet. Do a drill and your progress shows up here:</p>' +
          '<p><a class="ip-btn" href="Interview_Practice.html">📝 Practice mode</a> ' +
          '<a class="ip-btn ip-ghost" href="Interview_Why_Interactive.html">🗡️ Keep Asking Why</a></p>'));
        return;
      }

      const sessions = h.slice().reverse(); // oldest → newest for the chart
      const scores = sessions.map((s) => s.score || 0);
      const totalQ = h.reduce((a, s) => a + (s.n || 0), 0);
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const best = Math.max(...scores);
      const last = h[0].score || 0;

      // ---- stat cards ----
      const stats = el("div", "ip-dash-stats");
      [["Sessions", h.length], ["Questions", totalQ], ["Avg score", avg + "%"],
       ["Best", best + "%"], ["Latest", last + "%"]].forEach(([k, v]) => {
        stats.appendChild(el("div", "ip-stat", `<div class="ip-stat-v">${esc(String(v))}</div><div class="ip-stat-k">${esc(k)}</div>`));
      });
      root.appendChild(stats);

      // ---- score-over-time chart ----
      root.appendChild(el("h2", null, "Score over time"));
      root.appendChild(chart(scores));

      // ---- per-topic strength ----
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
        root.appendChild(el("h2", null, "Strength by topic"));
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

      // ---- recent sessions table ----
      root.appendChild(el("h2", null, "Recent sessions"));
      let t = '<table><thead><tr><th>When</th><th>Mode</th><th>Track</th><th>Topic</th><th>Q</th><th>Score</th></tr></thead><tbody>';
      const MODE_LABEL = { practice: "Practice", flashcard: "Flashcards", exam: "Timed Exam", why: "Keep Asking Why", scenario: "Scenario" };
      h.slice(0, 15).forEach((s) => {
        const modeLbl = MODE_LABEL[s.mode] || (s.mode || "Practice");
        t += `<tr><td>${esc(s.when || "")}</td><td>${esc(modeLbl)}</td><td>${esc(s.track || "")}</td><td>${esc(s.topic || "")}</td><td>${s.n || 0}</td><td>${s.score || 0}%</td></tr>`;
      });
      t += "</tbody></table>";
      root.appendChild(el("div", null, t));

      // ---- reset ----
      const reset = el("button", "ip-btn ip-ghost", "Clear my progress");
      reset.style.marginTop = "1rem";
      reset.addEventListener("click", () => {
        if (confirm("Clear all saved practice history from this browser?")) {
          localStorage.removeItem(STORE_KEY); render();
        }
      });
      root.appendChild(reset);
    }

    // "Next up" panel: turn the latest Analyze result into recommended reps,
    // and surface recent activity. Reuses the shared progress store.
    function recommended() {
      const wrap = el("div", "ip-card ip-nextup");
      const store = window.OfferReadyProgress;
      const analyze = store && store.latestAnalyze ? store.latestAnalyze() : null;
      if (analyze) {
        wrap.appendChild(el("h2", null, "Next up"));
        wrap.appendChild(el("p", null,
          `You analyzed <strong>${esc(analyze.role || "a role")}</strong> — turn the gaps into reps:`));
        if ((analyze.gaps || []).length) {
          const ul = el("ul", "ip-gaps");
          analyze.gaps.slice(0, 5).forEach((g) => ul.appendChild(el("li", null, esc(g))));
          wrap.appendChild(ul);
        }
        const row = el("div", "ip-controls");
        row.innerHTML =
          '<a class="ip-btn" href="Interview_Practice.html">📝 Drill weak areas</a>' +
          '<a class="ip-btn ip-ghost" href="Interview_Why_Interactive.html">🗡️ Defend a decision</a>' +
          '<a class="ip-btn ip-ghost" href="../Analyze/index.html">🔁 Re-analyze</a>';
        wrap.appendChild(row);
      } else {
        wrap.appendChild(el("h2", null, "Start the loop"));
        wrap.appendChild(el("p", null,
          "OfferReady works as a loop: <strong>Analyze</strong> your target job → "
          + "<strong>Practice</strong> and <strong>defend</strong> the gaps → watch your readiness move here."));
        const row = el("div", "ip-controls");
        row.innerHTML =
          '<a class="ip-btn" href="../Analyze/index.html">🎯 Analyze My Job</a>' +
          '<a class="ip-btn ip-ghost" href="Interview_Practice.html">📝 Practice</a>' +
          '<a class="ip-btn ip-ghost" href="Interview_Why_Interactive.html">🗡️ Keep Asking Why</a>';
        wrap.appendChild(row);
      }
      return wrap;
    }

    function chart(scores) {
      const W = 640, H = 200, P = 30;
      const n = scores.length;
      const x = (i) => n <= 1 ? P : P + (i * (W - 2 * P)) / (n - 1);
      const y = (v) => H - P - (v / 100) * (H - 2 * P);
      const pts = scores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
      const dots = scores.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="var(--md-accent-fg-color)"></circle>`).join("");
      const grid = [0, 25, 50, 75, 100].map((g) =>
        `<line x1="${P}" y1="${y(g)}" x2="${W - P}" y2="${y(g)}" stroke="var(--md-default-fg-color--lightest)" stroke-width="1"></line>` +
        `<text x="4" y="${y(g) + 4}" font-size="10" fill="var(--md-default-fg-color--light)">${g}</text>`).join("");
      const svg =
        `<svg viewBox="0 0 ${W} ${H}" class="ip-chart" role="img" aria-label="Score over time">` +
        grid +
        (n > 1 ? `<polyline points="${pts}" fill="none" stroke="var(--md-primary-fg-color)" stroke-width="2.5"></polyline>` : "") +
        dots + `</svg>`;
      return el("div", "ip-card", svg);
    }

    render();
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch {} }
})();
