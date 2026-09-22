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
  var BASE = "https://offerready-beta.vercel.app";
  // Only activate if a real https URL was set (ignore the placeholder).
  if (/^https:\/\//.test(BASE)) {
    window.OFFERREADY_API_BASE = BASE.replace(/\/$/, "");
  }
})();
