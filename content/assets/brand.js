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

  // Accent the value-connected top tabs (Practice, Interview Prep, Pricing) so
  // they read as the product's primary destinations. We tag them with a class
  // that extra.css styles; pure CSS can't select a tab by its label text.
  var VALUE_TABS = { "practice": 1, "interview prep": 1, "pricing": 1 };
  function accentTabs() {
    var links = document.querySelectorAll(".md-tabs__link");
    links.forEach(function (a) {
      var label = (a.textContent || "").trim().toLowerCase();
      if (VALUE_TABS[label]) a.classList.add("or-tab-value");
      else a.classList.remove("or-tab-value");
    });
  }

  function run() { brandTitle(); accentTabs(); }

  if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run);
  // Re-apply after instant navigation (Material fires document$ on page load).
  if (window.document$) { try { window.document$.subscribe(run); } catch (e) {} }
})();
