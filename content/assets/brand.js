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

  // Accent the value-connected nav items (Practice, Interview Prep, Pricing) so
  // they read as the product's primary destinations. We tag the sidebar links
  // with a class that extra.css styles; pure CSS can't select a nav item by its
  // label text. Only tag TOP-LEVEL items (depth check) so nested pages with the
  // same words aren't accented.
  var VALUE_NAV = { "practice": 1, "interview prep": 1, "pricing": 1 };
  function accentNav() {
    // Top-level sidebar items are the direct <label>/<a> in the primary nav list.
    var items = document.querySelectorAll(".md-nav--primary > .md-nav__list > .md-nav__item");
    items.forEach(function (li) {
      var node = li.querySelector(":scope > .md-nav__link, :scope > label.md-nav__link");
      if (!node) return;
      var label = (node.textContent || "").trim().toLowerCase();
      if (VALUE_NAV[label]) node.classList.add("or-nav-value");
      else node.classList.remove("or-nav-value");
    });
  }

  function run() { brandTitle(); accentNav(); }

  if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run);
  // Re-apply after instant navigation (Material fires document$ on page load).
  if (window.document$) { try { window.document$.subscribe(run); } catch (e) {} }
})();
