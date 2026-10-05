/* OfferReady — Upgrade-to-Pro checkout bridge.
 * ---------------------------------------------------------------------------
 * The standalone pricing page (assets/pricing.html) does NOT load the Supabase
 * SDK / auth stack, so it can't start Stripe checkout itself. Instead its
 * "Upgrade to Pro" button links to a main-site page with ?upgrade=1 (e.g.
 * Account/index.html?upgrade=1). This script — loaded site-wide via
 * extra_javascript, where window.OFFERREADY_API_BASE and window.OfferReadyAuth
 * already exist — detects that flag and starts checkout from an authenticated
 * context.
 *
 * Behavior:
 *   - No ?upgrade=1            -> does nothing.
 *   - Signed in + billing on   -> POST /api/billing/checkout -> redirect to Stripe.
 *   - Signed out               -> show the page's sign-in control + a prompt.
 *   - Billing not configured   -> bounce to the pricing waitlist.
 *
 * It never embeds payment logic in the browser; it only calls the existing
 * backend endpoint, which creates the Stripe Checkout Session server-side.
 */
(function () {
  "use strict";

  function hasUpgradeFlag() {
    try {
      var p = new URLSearchParams(window.location.search || "");
      if (p.get("upgrade") === "1") return true;
    } catch (e) {}
    return /(^|[#&])upgrade(=1)?($|[&])/.test(window.location.hash || "");
  }

  function siteBase() {
    // Path to the site root from the current page (…/offerready/).
    return (window.__md_scope && window.__md_scope.pathname
      ? window.__md_scope.pathname.replace(/[^/]*$/, "")
      : "/");
  }

  // Lightweight, dismissible banner so the user sees what's happening instead
  // of a silent redirect/stall. Appended to <body>; no layout dependency.
  function banner(msg, kind) {
    var b = document.getElementById("or-upgrade-banner");
    if (!b) {
      b = document.createElement("div");
      b.id = "or-upgrade-banner";
      b.setAttribute("role", "status");
      b.style.cssText =
        "position:fixed;left:50%;top:1rem;transform:translateX(-50%);z-index:2000;" +
        "max-width:92vw;padding:.7rem 1rem;border-radius:.6rem;font:600 14px/1.4 " +
        "system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 6px 24px rgba(15,35,66,.18);";
      document.body.appendChild(b);
    }
    var ok = kind === "ok";
    b.style.background = ok ? "#0f2342" : (kind === "err" ? "#fdecec" : "#eef3fb");
    b.style.color = ok ? "#fff" : (kind === "err" ? "#7a1c1c" : "#16305c");
    b.style.border = "1px solid " + (ok ? "#0f2342" : (kind === "err" ? "#f3b4b4" : "#cfe0f5"));
    b.textContent = msg;
  }

  function clearFlagFromUrl() {
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete("upgrade");
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  function startCheckout() {
    var API = (window.OFFERREADY_API_BASE || "").replace(/\/$/, "");
    if (!API || !window.OfferReadyAuth || !window.OfferReadyAuth.getAccessToken) {
      // Backend/auth not available on this deployment — send to the waitlist.
      banner("Checkout isn\u2019t available right now. Opening the waitlist\u2026", "info");
      window.location.href = siteBase() + "assets/pricing.html";
      return;
    }
    banner("Starting secure checkout\u2026", "info");
    window.OfferReadyAuth.getAccessToken().then(function (token) {
      if (!token) {
        banner("Please sign in below, then click Upgrade to Pro again.", "info");
        return; // the page's own #or-auth-slot renders the sign-in form
      }
      fetch(API + "/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            return { status: r.status, body: j };
          });
        })
        .then(function (res) {
          if (res.status === 200 && res.body && res.body.url) {
            banner("Redirecting to secure checkout\u2026", "ok");
            window.location.href = res.body.url;
            return;
          }
          if (res.status === 401) {
            banner("Please sign in below, then click Upgrade to Pro again.", "info");
            return;
          }
          if (res.status === 503) {
            banner("Pro isn\u2019t open for checkout yet \u2014 opening the waitlist\u2026", "info");
            window.location.href = siteBase() + "assets/pricing.html";
            return;
          }
          banner((res.body && res.body.error) || "Couldn\u2019t start checkout. Please try again.", "err");
        })
        .catch(function () {
          banner("Couldn\u2019t reach the billing service. Please try again.", "err");
        });
    }).catch(function () {
      banner("Couldn\u2019t verify your session. Please sign in and try again.", "err");
    });
  }

  function init() {
    if (!hasUpgradeFlag()) return;
    clearFlagFromUrl(); // so a refresh doesn't re-trigger checkout
    // Give auth.js a tick to initialize its session, then start.
    if (window.OfferReadyAuth && window.OfferReadyAuth.ready) {
      window.OfferReadyAuth.ready().then(startCheckout).catch(startCheckout);
    } else {
      setTimeout(startCheckout, 300);
    }
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
