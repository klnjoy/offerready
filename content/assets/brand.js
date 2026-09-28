/* OfferReady wordmark: recolor "Offer" white + "Ready" brand green — matching
   the standalone pricing/paywall pages. Applied in TWO places: the MkDocs header
   title AND the home-page hero <h1>. Runs on load and re-applies after Material's
   instant-navigation swaps. Safe/no-op if a target isn't found; preserves any
   heading permalink anchor. */
(function () {
  // Split the "OfferReady" wordmark into Offer + green "Ready", replacing ONLY
  // the leading text node so we don't clobber a heading's permalink anchor
  // (MkDocs appends <a class="headerlink">¶</a> inside the hero <h1>).
  function splitWordmark(el) {
    if (!el || el.dataset.branded) return;
    // Ignore trailing headerlink text (e.g. "¶") when checking the wordmark.
    var visible = (el.textContent || "").replace(/\u00b6/g, "").trim();
    if (visible.toLowerCase() !== "offerready") return; // only touch the exact wordmark
    // Find the first text node containing "OfferReady" and replace just it.
    var node = el.firstChild;
    while (node) {
      if (node.nodeType === 3 && /offerready/i.test(node.textContent)) {
        var span = document.createElement("span");
        span.innerHTML = 'Offer<span class="or-ready">Ready</span>';
        el.replaceChild(span, node);
        el.dataset.branded = "1";
        return;
      }
      node = node.nextSibling;
    }
    // Fallback: no separate text node (plain wordmark, e.g. the header) — safe
    // to rewrite the whole element since there's no permalink to preserve.
    el.dataset.branded = "1";
    el.innerHTML = 'Offer<span class="or-ready">Ready</span>';
  }

  function brandTitle() {
    // Header wordmark: .md-header__topic .md-ellipsis
    splitWordmark(document.querySelector(".md-header__topic .md-ellipsis"));
    // Home hero title: the H1 inside .or-hero (same lockup as the header).
    splitWordmark(document.querySelector(".or-hero h1"));
  }

  function run() { brandTitle(); }

  if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run);
  // Re-apply after instant navigation (Material fires document$ on page load).
  if (window.document$) { try { window.document$.subscribe(run); } catch (e) {} }
})();
