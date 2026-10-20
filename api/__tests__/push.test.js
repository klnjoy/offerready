'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { vapidJwt, sendPush, b64u, fromB64u, configured } = require('../_lib/push');

function keys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]);
  return { env: { VAPID_PUBLIC_KEY: b64u(pub), VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: 'mailto:test@example.com' }, publicKey };
}

test('VAPID JWT is ES256-signed for the push service origin', () => {
  const { env, publicKey } = keys();
  const jwt = vapidJwt('https://fcm.googleapis.com/fcm/send/abc', env, Date.UTC(2026, 9, 20));
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(fromB64u(c).toString());
  assert.strictEqual(claims.aud, 'https://fcm.googleapis.com');
  assert.strictEqual(claims.sub, 'mailto:test@example.com');
  assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + c), { key: publicKey, dsaEncoding: 'ieee-p1363' }, fromB64u(s)));
  assert.ok(configured(env));
  assert.ok(!configured({}));
});

test('sendPush posts with no body and flags dead subscriptions', async () => {
  const { env } = keys();
  let seen;
  const ok = await sendPush('https://push.example.com/x', env, async (url, o) => { seen = o; return { status: 201 }; });
  assert.deepStrictEqual(ok, { ok: true, status: 201, gone: false });
  assert.strictEqual(seen.body, undefined);
  assert.match(seen.headers.Authorization, /^vapid t=.+\..+\..+, k=/);
  const gone = await sendPush('https://push.example.com/x', env, async () => ({ status: 410 }));
  assert.strictEqual(gone.gone, true);
  const bad = await sendPush('http://insecure', env, async () => ({ status: 201 }));
  assert.strictEqual(bad.gone, true);
});
