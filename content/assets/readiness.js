/* OfferReady — Interview Readiness store + Dashboard.
 * ---------------------------------------------------------------------------
 * Two roles in one file (loaded early so gap.js can use the store):
 *
 *  1) window.OfferReadyReadiness — a tiny client-side store other modules call:
 *       .saveGap(result, meta)  persist the latest gap-analysis scores
 *       .latest()               read the latest gap record (or null)
 *       .weightedReadiness()    compute the overall + sub-scores used on the dash
 *
 *  2) Dashboard renderer — mounts on #dashboard-app and shows the readiness
 *     score, the four readiness cards (Technical / Behavioral / Architecture /
 *     Domain), and practice stats. Empty-state guides the user into the loop.
 *
 * SCORING (kept deliberately simple, per spec "do not overcomplicate"):
 *   overall = 0.5 * resumeMatch + 0.3 * practiceAvg + 0.2 * completionSignal
 *   where practiceAvg comes from recorded practice/defend sessions and
 *   completionSignal scales with how many sessions have been done (caps at 10).
 *   Each sub-score (technical/behavioral/architecture/domain) starts from the
 *   gap analysis and is nudged by practice average. All values clamp to 0-100.
 *
 * All client-side (localStorage). No network required to render.
 */

(function () {
  "use strict";

  var GAP_KEY = "offerready.readiness.v1";      // latest gap-analysis record
  var GAP_HIST_KEY = "offerready.readiness.hist.v1"; // gap snapshots (skill-gap trend)
  var HISTORY_KEY = "ip_history_v1";            // practice history (shared w/ progress.js)

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function clampInt(n, lo, hi) {
    n = Math.round(Number(n)); if (!isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }

  // ---- store -------------------------------------------------------------
  var store = {
    GAP_KEY: GAP_KEY,

    saveGap: function (result, meta) {
      if (!result || typeof result !== "object") return null;
      var rec = {
        when: new Date().toISOString(),
        role: (meta && meta.role) || "",
        match: clampInt(result.matchScore, 0, 100),
        technical: clampInt(result.technicalScore, 0, 100),
        behavioral: clampInt(result.behavioralScore, 0, 100),
        architecture: clampInt(result.architectureScore, 0, 100),
        domain: clampInt(result.domainScore, 0, 100),
        strengths: result.strengths || [],
        missingSkills: result.missingSkills || [],
        missingKeywords: result.missingKeywords || [],
        missingExperience: result.missingExperience || [],
        summary: result.summary || "",
      };
      try { localStorage.setItem(GAP_KEY, JSON.stringify(rec)); } catch (e) {}
      // Append a compact snapshot for the skill-gap-reduction + readiness trend
      // widgets (keep the last 20, newest last).
      try {
        var hist = readJSON(GAP_HIST_KEY, []);
        hist.push({ when: rec.when, match: rec.match,
                    gaps: (rec.missingSkills.length + rec.missingKeywords.length + rec.missingExperience.length) });
        localStorage.setItem(GAP_HIST_KEY, JSON.stringify(hist.slice(-20)));
      } catch (e) {}
      return rec;
    },

    latest: function () { return readJSON(GAP_KEY, null); },
    gapHistory: function () { return readJSON(GAP_HIST_KEY, []); },

    // This week's practice average vs last week's (percentage-point delta).
    weeklyImprovement: function () {
      var h = readJSON(HISTORY_KEY, []);
      if (!Array.isArray(h) || !h.length) return null;
      var now = Date.now(), WEEK = 7 * 24 * 3600 * 1000;
      var thisWk = [], lastWk = [];
      h.forEach(function (s) {
        var t = Date.parse(s.when || "");
        var sc = Number(s.score) || 0;
        if (!isFinite(t)) return;
        if (now - t <= WEEK) thisWk.push(sc);
        else if (now - t <= 2 * WEEK) lastWk.push(sc);
      });
      if (!thisWk.length) return null;
      var mean = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; };
      var cur = Math.round(mean(thisWk));
      if (!lastWk.length) return { current: cur, delta: null, sessions: thisWk.length };
      return { current: cur, delta: Math.round(mean(thisWk) - mean(lastWk)), sessions: thisWk.length };
    },

    // Recent practice scores oldest->newest for a sparkline (max 12 points).
    trend: function () {
      var h = readJSON(HISTORY_KEY, []);
      if (!Array.isArray(h) || !h.length) return [];
      return h.slice(0, 12).reverse().map(function (s) { return Number(s.score) || 0; });
    },

    // Skill-gap reduction: how many gaps closed since the first snapshot.
    gapReduction: function () {
      var hist = readJSON(GAP_HIST_KEY, []);
      if (hist.length < 2) return null;
      var first = hist[0].gaps, last = hist[hist.length - 1].gaps;
      return { first: first, last: last, closed: Math.max(0, first - last) };
    },

    // Practice signal from the shared history store (practice/why/scenario).
    practiceStats: function () {
      var h = readJSON(HISTORY_KEY, []);
      if (!Array.isArray(h) || !h.length) return { sessions: 0, avg: 0, questions: 0 };
      var scores = h.map(function (s) { return Number(s.score) || 0; });
      var avg = Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length);
      var questions = h.reduce(function (a, s) { return a + (Number(s.n) || 0); }, 0);
      return { sessions: h.length, avg: avg, questions: questions };
    },

    weightedReadiness: function () {
      var gap = this.latest();
      var p = this.practiceStats();
      var match = gap ? gap.match : 0;
      var practiceAvg = p.avg;
      var completion = Math.min(p.sessions, 10) * 10; // 0..100 (caps at 10 sessions)
      var hasSignal = gap || p.sessions;

      // overall weighted blend.
      var overall = hasSignal
        ? clampInt(0.5 * match + 0.3 * practiceAvg + 0.2 * completion, 0, 100)
        : 0;

      // sub-scores: gap baseline nudged toward practice average.
      function sub(base) {
        if (!gap && !p.sessions) return 0;
        var b = base || 0;
        return clampInt(p.sessions ? 0.7 * b + 0.3 * practiceAvg : b, 0, 100);
      }
      return {
        overall: overall,
        technical: sub(gap && gap.technical),
        behavioral: sub(gap && gap.behavioral),
        architecture: sub(gap && gap.architecture),
        domain: sub(gap && gap.domain),
        hasGap: !!gap,
        practice: p,
        gap: gap,
      };
    },
  };
  window.OfferReadyReadiness = store;

  // ---- dashboard ---------------------------------------------------------
  function init() {
    var root = document.getElementById("dashboard-app");
    if (!root || root.dataset.mounted) return;
    root.dataset.mounted = "1";

    var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
    var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };

    render();

    function bar(label, pct) {
      var band = pct >= 75 ? "or-good" : pct >= 50 ? "or-mid" : "or-weak";
      var row = el("div", "or-bar-row");
      row.appendChild(el("div", "or-bar-label", esc(label)));
      var track = el("div", "or-bar-track");
      var fill = el("div", "or-bar-fill " + band); fill.style.width = Math.max(3, pct) + "%";
      track.appendChild(fill); row.appendChild(track);
      row.appendChild(el("div", "or-bar-pct", pct + "%"));
      return row;
    }
    function stat(num, label) {
      return el("div", "or-stat", '<div class="or-stat-num">' + esc(String(num)) + '</div><div class="or-stat-label">' + esc(label) + "</div>");
    }
    // Tiny inline-SVG sparkline of recent scores (no chart lib).
    function sparkline(scores) {
      var W = 220, H = 46, P = 4, n = scores.length;
      if (n < 2) return el("div", "or-muted or-small", "Practice a few sessions to see your trend.");
      var x = function (i) { return P + (i * (W - 2 * P)) / (n - 1); };
      var y = function (v) { return H - P - (v / 100) * (H - 2 * P); };
      var pts = scores.map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
      var last = scores[n - 1];
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="or-spark" role="img" aria-label="Readiness trend">' +
        '<polyline points="' + pts + '" fill="none" stroke="var(--md-primary-fg-color)" stroke-width="2.5"></polyline>' +
        '<circle cx="' + x(n - 1) + '" cy="' + y(last) + '" r="3.2" fill="var(--md-accent-fg-color)"></circle>' +
        '</svg>';
      return el("div", null, svg);
    }

    function render() {
      root.innerHTML = "";
      var r = store.weightedReadiness();

      if (!r.hasGap && !r.practice.sessions) {
        var empty = el("div", "or-card");
        empty.appendChild(el("h2", null, "Your interview readiness"));
        empty.appendChild(el("p", "or-muted", "Start the loop and your readiness score builds here. Two ways to begin:"));
        var row = el("div", "or-actions");
        row.innerHTML =
          '<a class="or-btn or-btn-primary" href="../Gap-Analysis/index.html">\u2696\ufe0f Run a gap analysis</a>' +
          '<a class="or-btn" href="../Analyze/index.html">\uD83C\uDFAF Analyze a job</a>' +
          '<a class="or-btn" href="../Practice-Scenarios/index.html">\uD83D\uDDE1\ufe0f Practice defending</a>';
        empty.appendChild(row);
        root.appendChild(empty);
        return;
      }

      // Overall readiness header
      var band = r.overall >= 75 ? "or-good" : r.overall >= 50 ? "or-mid" : "or-weak";
      var head = el("div", "or-card");
      var hrow = el("div", "or-score-head");
      hrow.appendChild(el("div", "or-score-num " + band, r.overall + "%"));
      var lbl = "<strong>Overall interview readiness</strong><br><span class=\"or-muted\">";
      lbl += r.gap && r.gap.role ? "Target: " + esc(r.gap.role) + " \u00b7 " : "";
      lbl += "Blend of resume match, practice, and completed reps.</span>";
      hrow.appendChild(el("div", "or-score-label", lbl));
      head.appendChild(hrow);
      root.appendChild(head);

      // Readiness breakdown cards (bars)
      var cards = el("div", "or-card");
      cards.appendChild(el("h3", null, "Readiness by area"));
      cards.appendChild(bar("Technical", r.technical));
      cards.appendChild(bar("Behavioral", r.behavioral));
      cards.appendChild(bar("Architecture", r.architecture));
      cards.appendChild(bar("Domain", r.domain));
      if (!r.hasGap) cards.appendChild(el("p", "or-muted or-small", "Run a gap analysis to sharpen these area scores against a specific job."));
      root.appendChild(cards);

      // Practice stats
      var grid = el("div", "or-grid");
      grid.appendChild(stat(r.practice.sessions, "Sessions"));
      grid.appendChild(stat(r.practice.questions, "Questions practiced"));
      grid.appendChild(stat(r.practice.avg + "%", "Avg practice score"));
      grid.appendChild(stat(r.gap ? r.gap.match + "%" : "\u2014", "Resume match"));
      root.appendChild(grid);

      // ---- Progress widgets (these replace the standalone Progress page) ----
      var wk = store.weeklyImprovement();
      var red = store.gapReduction();
      var tr = store.trend();
      if (wk || red || tr.length) {
        var prog = el("div", "or-card");
        prog.appendChild(el("h3", null, "This week"));
        var wgrid = el("div", "or-grid");
        if (wk) {
          var deltaTxt = wk.delta == null ? "\u2014"
            : (wk.delta > 0 ? "+" + wk.delta + " pts" : wk.delta + " pts");
          wgrid.appendChild(stat(wk.current + "%", "This week's avg"));
          wgrid.appendChild(stat(deltaTxt, "Weekly improvement"));
          wgrid.appendChild(stat(wk.sessions, "Sessions this week"));
        }
        if (red) wgrid.appendChild(stat(red.closed, "Skill gaps closed"));
        prog.appendChild(wgrid);
        if (tr.length) {
          prog.appendChild(el("div", "or-field-label", "Readiness trend"));
          prog.appendChild(sparkline(tr));
        }
        root.appendChild(prog);
      }

      // Weakest / strongest area (from sub-scores)
      var areas = [["Technical", r.technical], ["Behavioral", r.behavioral], ["Architecture", r.architecture], ["Domain", r.domain]]
        .filter(function (a) { return a[1] > 0; });
      if (areas.length) {
        var sorted = areas.slice().sort(function (a, b) { return a[1] - b[1]; });
        var weak = sorted[0], strong = sorted[sorted.length - 1];
        var g2 = el("div", "or-grid");
        g2.appendChild(stat(strong[0], "Strongest area"));
        g2.appendChild(stat(weak[0], "Focus next"));
        root.appendChild(g2);
      }

      // Next-step actions
      var actions = el("div", "or-card or-actions");
      actions.innerHTML =
        '<a class="or-btn or-btn-primary" href="../Practice-Scenarios/index.html">\uD83D\uDDE1\ufe0f Practice & defend</a>' +
        '<a class="or-btn" href="../Gap-Analysis/index.html">\u2696\ufe0f Re-run gap analysis</a>' +
        '<a class="or-btn" href="../Personal-SourceCode/Interview_Progress.html">\uD83D\uDCC8 Full progress</a>';
      root.appendChild(actions);

      // Gaps recap (from the latest analysis)
      if (r.gap && ((r.gap.missingSkills || []).length || (r.gap.missingKeywords || []).length)) {
        var gaps = el("div", "or-card");
        gaps.appendChild(el("h3", null, "Close these gaps"));
        var list = (r.gap.missingSkills || []).concat(r.gap.missingKeywords || []).slice(0, 12);
        var wrap = el("div", "or-chips");
        list.forEach(function (x) { wrap.appendChild(el("span", "or-chip or-chip-warn", esc(x))); });
        gaps.appendChild(wrap);
        root.appendChild(gaps);
      }
    }
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  if (window.document$) { try { window.document$.subscribe(init); } catch (e) {} }
})();
