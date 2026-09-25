/* OfferReady header wordmark: recolor the title so "Offer" is white and
   "Ready" is brand green — matching the standalone pricing/paywall pages.
   The MkDocs header title renders as the plain string "OfferReady"; here we
   split it into two spans. Runs on load and re-applies after Material's
   instant-navigation swaps the header. Safe/no-op if the title isn't found. */
(function () {
  function brandTitle() {
    // The header title text lives in .md-header__topic .md-ellipsis
    var el = document.querySelector(".md-header__topic .md-ellipsis");
    if (!el || el.dataset.branded) return;
    var text = (el.textContent || "").trim();
    if (text.toLowerCase() !== "offerready") return; // only touch the exact wordmark
    el.dataset.branded = "1";
    el.innerHTML = 'Offer<span class="or-ready">Ready</span>';
  }

  if (document.readyState !== "loading") brandTitle();
  else document.addEventListener("DOMContentLoaded", brandTitle);
  // Re-apply after instant navigation (Material fires document$ on page load).
  if (window.document$) { try { window.document$.subscribe(brandTitle); } catch (e) {} }
})();
