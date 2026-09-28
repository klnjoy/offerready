/* OfferReady — shared progress store (reuse layer, not a new engine).
 * ---------------------------------------------------------------------------
 * One place all interactive capabilities record activity so the Progress
 * dashboard reflects the WHOLE loop: Practice + Why + Scenario runs, and
 * Analyze activity. This connects features that already exist — it does not
 * replace any of them.
 *
 * Back-compatibility (important):
 *   - practice.js already writes sessions to localStorage key `ip_history_v1`
 *     with shape { when, mode, track, topic, score, n, topics }.
 *   - progress.js already reads `ip_history_v1`.
 *   This store reads/writes the SAME key + shape, so old data keeps working and
 *   practice.js needs no change. Why/Scenario just start writing here too.
 *
 * Also keeps a lightweight activity log (`ip_activity_v1`) for non-scored
 * events like "analyzed a job for AI Architect" so Progress can close the loop
 * back to Analyze with recommended drills.
 *
 * All client-side. Exposes window.OfferReadyProgress.
 */
(function () {
  "use strict";

  var HISTORY_KEY = "ip_history_v1";    // scored sessions (shared with practice.js/progress.js)
  var ACTIVITY_KEY = "ip_activity_v1";  // non-scored activity (analyze, etc.)
  var MAX_HISTORY = 100;
  var MAX_ACTIVITY = 50;

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  var api = {
    HISTORY_KEY: HISTORY_KEY,
    ACTIVITY_KEY: ACTIVITY_KEY,

    /**
     * Record a completed, scored practice session in the shared history.
     * @param {object} s { mode, track, topic, score, n, topics }
     *   mode:   'practice' | 'flashcard' | 'exam' | 'why' | 'scenario'
     *   score:  0-100 (self-rated or derived)
     *   n:      number of items/steps
     *   topics: { topicName: pct } for per-topic strength (optional)
     */
    record: function (s) {
      if (!s || typeof s !== "object") return;
      var rec = {
        when: s.when || new Date().toLocaleString(),
        mode: s.mode || "practice",
        track: s.track || "",
        topic: s.topic || "",
        score: typeof s.score === "number" ? s.score : 0,
        n: typeof s.n === "number" ? s.n : 0,
        topics: s.topics || {},
      };
      var h = readJSON(HISTORY_KEY, []);
      h.unshift(rec);
      writeJSON(HISTORY_KEY, h.slice(0, MAX_HISTORY));
      return rec;
    },

    /**
     * Log a non-scored activity (e.g. an Analyze run) so the dashboard can show
     * "you analyzed X — drill these" and recommend the next reps.
     * @param {object} e { type, label, role, gaps, when }
     */
    logActivity: function (e) {
      if (!e || typeof e !== "object") return;
      var rec = {
        type: e.type || "activity",
        label: e.label || "",
        role: e.role || "",
        gaps: Array.isArray(e.gaps) ? e.gaps.slice(0, 8) : [],
        when: e.when || new Date().toLocaleString(),
        at: Date.now(),
      };
      var a = readJSON(ACTIVITY_KEY, []);
      a.unshift(rec);
      writeJSON(ACTIVITY_KEY, a.slice(0, MAX_ACTIVITY));
      return rec;
    },

    getHistory: function () { return readJSON(HISTORY_KEY, []); },
    getActivity: function () { return readJSON(ACTIVITY_KEY, []); },

    /** Most recent analyze activity (or null) — used to recommend drills. */
    latestAnalyze: function () {
      var a = readJSON(ACTIVITY_KEY, []);
      for (var i = 0; i < a.length; i++) { if (a[i].type === "analyze") return a[i]; }
      return null;
    },
  };

  window.OfferReadyProgress = api;
})();
