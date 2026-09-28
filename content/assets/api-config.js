/* OfferReady API configuration.
 *
 * After you deploy the backend to Vercel (see DEPLOY.md), paste your Vercel URL
 * below (no trailing slash), then commit + push. That single change activates
 * BOTH features on the live site:
 *   - "Analyze My Job"          -> POST <base>/api/analyze-job
 *   - "Ask the Knowledge Base"  -> POST <base>/api/ask
 *
 * Example:
 *   window.OFFERREADY_API_BASE = "https://offerready-abc123.vercel.app";
 *
 * Leave it as the placeholder below and the site stays in a safe "not enabled
 * yet" state — no broken calls, graceful messages, labeled sample demo. The
 * check below intentionally ignores the placeholder value.
 */
(function () {
  // No live backend right now. The previous Vercel URL
  // (offerready-beta.vercel.app) is down and returned 404 + CORS errors on
  // every page, which broke the Practice features. Leaving this empty puts the
  // site in its graceful "no backend" state: the interactive Practice pages
  // (Defend-Your-Decision scenarios, Master Simulator, Walkthrough, Why-chains,
  // Practice drills) run fully client-side, and Analyze/chatbot show their
  // sample/disabled states instead of erroring. Set a real https URL here to
  // re-enable the hosted features.
  var BASE = "";
  // Only activate if a real https URL was set (ignore the empty placeholder).
  if (/^https:\/\//.test(BASE)) {
    window.OFFERREADY_API_BASE = BASE.replace(/\/$/, "");
  }

  // ---- Supabase (auth) — BROWSER-SAFE values only -------------------------
  // These are the publishable Supabase URL + anon key. They are protected by
  // Row Level Security, so they are safe to ship to the browser. NEVER put the
  // service-role key here. Paste your project values, then commit + push to
  // turn on sign-in. Left as placeholders => auth UI stays in a disabled state.
  var SUPABASE_URL = "https://qelqtqgypwzduauiudbg.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_J-_TcxztkDSld8jSqTcmMQ_cBniHoaT";
  if (/^https:\/\/.+\.supabase\.co/.test(SUPABASE_URL) &&
      SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.indexOf("your-") !== 0) {
    window.OFFERREADY_SUPABASE_URL = SUPABASE_URL.replace(/\/$/, "");
    window.OFFERREADY_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  }
})();
