/* OfferReady — client-side auth (Phase 2).
 * ---------------------------------------------------------------------------
 * Thin wrapper over Supabase Auth (email/password) for the static MkDocs site.
 *
 * SECURITY MODEL (spec §10/§15/§28/§34):
 *   - Uses ONLY the Supabase publishable (anon) key from api-config.js. No
 *     service-role key ever touches the browser.
 *   - This file establishes IDENTITY, not ACCESS. It never decides "isPro".
 *     Premium access is always checked server-side against entitlements
 *     (Phase 3). A tampered client cannot unlock anything.
 *   - Fail closed: if Supabase isn't configured or the SDK can't load, auth
 *     stays disabled and the UI shows a friendly "sign-in not available yet".
 *
 * Exposes a small API on window.OfferReadyAuth:
 *   ready() -> Promise<boolean>            // SDK + config available
 *   getSession() -> Promise<session|null>
 *   getUser() -> Promise<user|null>
 *   getAccessToken() -> Promise<string|null>   // send as Bearer to backend
 *   signUp(email, pw), signIn(email, pw), signOut(),
 *   resetPassword(email), onChange(cb)
 *
 * It also renders a minimal auth control into any element with id
 * "or-auth-slot" (optional) and updates elements with class "or-auth-state".
 */
(function () {
  "use strict";

  var SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
  var client = null;
  var initPromise = null;

  function configured() {
    return Boolean(window.OFFERREADY_SUPABASE_URL && window.OFFERREADY_SUPABASE_ANON_KEY);
  }

  function loadSdk() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve();
      var s = document.createElement("script");
      s.src = SDK_URL; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Supabase SDK failed to load")); };
      document.head.appendChild(s);
    });
  }

  // Initialize once. Resolves to true when auth is usable, false otherwise
  // (fail closed — never throws to callers).
  function ready() {
    if (initPromise) return initPromise;
    initPromise = (function () {
      if (!configured()) return Promise.resolve(false);
      return loadSdk().then(function () {
        client = window.supabase.createClient(
          window.OFFERREADY_SUPABASE_URL,
          window.OFFERREADY_SUPABASE_ANON_KEY,
          { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
        );
        return true;
      }).catch(function () { client = null; return false; });
    })();
    return initPromise;
  }

  function guard() {
    return ready().then(function (ok) {
      if (!ok || !client) throw new Error("Sign-in isn't available yet.");
      return client;
    });
  }

  var api = {
    ready: ready,
    configured: configured,

    getSession: function () {
      return ready().then(function (ok) {
        if (!ok) return null;
        return client.auth.getSession().then(function (r) {
          return (r && r.data && r.data.session) || null;
        }).catch(function () { return null; });
      });
    },

    getUser: function () {
      return this.getSession().then(function (s) { return s ? s.user : null; });
    },

    // Bearer token for authorized calls to the premium backend (Phase 3).
    getAccessToken: function () {
      return this.getSession().then(function (s) { return s ? s.access_token : null; });
    },

    signUp: function (email, password) {
      return guard().then(function (c) {
        return c.auth.signUp({ email: email, password: password });
      });
    },

    signIn: function (email, password) {
      return guard().then(function (c) {
        return c.auth.signInWithPassword({ email: email, password: password });
      });
    },

    // OAuth (Google / GitHub). Redirects to the provider, then back to the
    // current page. Only works once the provider is enabled in Supabase
    // (Authentication -> Providers) — otherwise Supabase returns an error which
    // the form surfaces. `provider` is 'google' or 'github'.
    signInWithProvider: function (provider) {
      return guard().then(function (c) {
        return c.auth.signInWithOAuth({
          provider: provider,
          options: { redirectTo: location.origin + location.pathname },
        });
      });
    },

    signOut: function () {
      return guard().then(function (c) { return c.auth.signOut(); });
    },

    resetPassword: function (email) {
      return guard().then(function (c) {
        var redirect = location.origin + location.pathname;
        return c.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      });
    },

    onChange: function (cb) {
      ready().then(function (ok) {
        if (!ok) { cb(null); return; }
        client.auth.getSession().then(function (r) {
          cb((r && r.data && r.data.session) || null);
        });
        client.auth.onAuthStateChange(function (_evt, session) { cb(session || null); });
      });
    },
  };

  window.OfferReadyAuth = api;

  // ---- Optional lightweight UI ---------------------------------------------
  // Renders into #or-auth-slot if present; always reflects state into any
  // element with class .or-auth-state (e.g. a header badge).
  function reflectState(session) {
    var email = session && session.user ? (session.user.email || "signed in") : null;
    document.querySelectorAll(".or-auth-state").forEach(function (el) {
      el.textContent = email ? email : "";
      el.setAttribute("data-signed-in", email ? "1" : "0");
    });
    var slot = document.getElementById("or-auth-slot");
    if (slot) renderSlot(slot, session);
  }

  function renderSlot(slot, session) {
    if (slot.dataset.rendering === "1") return;
    slot.dataset.rendering = "1";
    slot.innerHTML = "";
    if (!configured()) {
      slot.innerHTML = '<p class="or-auth-note">Sign-in isn\u2019t enabled on this site yet.</p>';
      slot.dataset.rendering = "0";
      return;
    }
    if (session && session.user) {
      var who = document.createElement("span");
      who.className = "or-auth-who";
      who.textContent = "Signed in as " + (session.user.email || "you");
      var out = document.createElement("button");
      out.className = "ip-btn ip-ghost"; out.type = "button"; out.textContent = "Sign out";
      out.addEventListener("click", function () { api.signOut(); });
      slot.append(who, out);
    } else {
      var form = document.createElement("form");
      form.className = "or-auth-form";
      form.innerHTML =
        '<div class="or-oauth-row">' +
        '<button type="button" class="or-oauth-btn" data-oauth="google">Continue with Google</button>' +
        '<button type="button" class="or-oauth-btn" data-oauth="github">Continue with GitHub</button>' +
        "</div>" +
        '<div class="or-auth-divider"><span>or with email</span></div>' +
        '<input type="email" class="or-input" placeholder="you@email.com" autocomplete="email" required>' +
        '<input type="password" class="or-input" placeholder="Password" autocomplete="current-password" required>' +
        '<div class="or-auth-row">' +
        '<button type="submit" class="ip-btn" data-act="in">Sign in</button>' +
        '<button type="button" class="ip-btn ip-ghost" data-act="up">Create account</button>' +
        '<button type="button" class="or-linkbtn" data-act="reset">Forgot password?</button>' +
        "</div><div class=\"or-auth-msg\"></div>";
      var email = form.querySelector('input[type="email"]');
      var pw = form.querySelector('input[type="password"]');
      var msg = form.querySelector(".or-auth-msg");
      function show(t, err) { msg.textContent = t; msg.className = "or-auth-msg" + (err ? " or-auth-err" : ""); }
      form.addEventListener("submit", function (e) {
        e.preventDefault(); show("Signing in\u2026");
        api.signIn(email.value.trim(), pw.value).then(function (r) {
          if (r && r.error) show(r.error.message, true); else show("");
        }).catch(function (e2) { show(e2.message, true); });
      });
      form.querySelector('[data-act="up"]').addEventListener("click", function () {
        show("Creating account\u2026");
        api.signUp(email.value.trim(), pw.value).then(function (r) {
          if (r && r.error) show(r.error.message, true);
          else show("Check your email to confirm your account.");
        }).catch(function (e2) { show(e2.message, true); });
      });
      form.querySelector('[data-act="reset"]').addEventListener("click", function () {
        if (!email.value.trim()) { show("Enter your email first, then click reset.", true); return; }
        api.resetPassword(email.value.trim()).then(function () {
          show("If that email exists, a reset link is on its way.");
        }).catch(function (e2) { show(e2.message, true); });
      });
      // OAuth buttons (Google / GitHub). On success the browser redirects to the
      // provider; on failure (e.g. provider not enabled) show the message.
      form.querySelectorAll("[data-oauth]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var provider = btn.getAttribute("data-oauth");
          show("Redirecting to " + (provider === "github" ? "GitHub" : "Google") + "\u2026");
          api.signInWithProvider(provider).then(function (r) {
            if (r && r.error) show(r.error.message, true);
          }).catch(function (e2) { show(e2.message, true); });
        });
      });
      slot.appendChild(form);
    }
    slot.dataset.rendering = "0";
  }

  function boot() { api.onChange(reflectState); }
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
  if (window.document$) { try { window.document$.subscribe(boot); } catch (e) {} }
})();
