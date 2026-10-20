/**
 * api/_lib/push.js — Web Push without a library: VAPID (RFC 8292) with an
 * ES256 JWT signed by Node's crypto, and payload-less pushes (no encryption
 * needed; the service worker fetches the day's question itself).
 *
 * Env (server only):
 *   VAPID_PUBLIC_KEY   base64url, 65-byte uncompressed P-256 point
 *   VAPID_PRIVATE_KEY  base64url, 32-byte private scalar
 *   VAPID_SUBJECT      mailto: or https: contact for push services
 */
'use strict';

const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function configured(env) {
  env = env || process.env;
  return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

function privateKey(env) {
  const pub = fromB64u(env.VAPID_PUBLIC_KEY);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY must be a 65-byte uncompressed P-256 key');
  return crypto.createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', d: b64u(fromB64u(env.VAPID_PRIVATE_KEY)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
  });
}

/** The VAPID JWT for one push service origin, valid 12 hours. */
function vapidJwt(endpoint, env, now) {
  env = env || process.env;
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({
    aud,
    exp: Math.floor((now || Date.now()) / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || 'mailto:support@offerready.app',
  }));
  const data = header + '.' + claims;
  const sig = crypto.sign('sha256', Buffer.from(data), { key: privateKey(env), dsaEncoding: 'ieee-p1363' });
  return data + '.' + b64u(sig);
}

/**
 * Send one payload-less push. Resolves { ok, status, gone } where gone means
 * the subscription is dead (404/410) and should be deleted.
 */
async function sendPush(endpoint, env, fetchImpl) {
  env = env || process.env;
  const f = fetchImpl || fetch;
  if (!/^https:\/\//.test(String(endpoint || ''))) return { ok: false, status: 0, gone: true };
  const res = await f(endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      Urgency: 'normal',
      'Content-Length': '0',
      Authorization: 'vapid t=' + vapidJwt(endpoint, env) + ', k=' + env.VAPID_PUBLIC_KEY,
    },
  });
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
}

module.exports = { configured, vapidJwt, sendPush, b64u, fromB64u };
