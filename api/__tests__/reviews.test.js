// /api/me/plan?op=reviews: admins list reviews and approve / hide them; others get 403.
const test = require('node:test');
const assert = require('node:assert');

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
async function withEnv(env, fn) {
  const old = {};
  for (const k of Object.keys(env)) { old[k] = process.env[k]; process.env[k] = env[k]; }
  try { await fn(); } finally { for (const k of Object.keys(env)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
}

test('op=reviews: list, approve, bad input, non-admin, not set up', async () => {
  const plan = require('../me/plan');
  const rows = [{ id: 7, status: 'pending', quote: 'Helped me prepare.', display_name: 'Asha' }];
  const calls = [];
  let missing = false;
  const mk = (email) => {
    global.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) return json(200, { id: 'u1', email });
      if (u.includes('/rpc/admin_review_set')) { calls.push(JSON.parse(init.body)); return json(200, true); }
      if (u.includes('/rpc/admin_reviews')) return missing ? json(404, { code: 'PGRST202' }) : json(200, rows);
      return json(200, []);
    };
  };
  const run = async (method, body) => {
    let out = null;
    const res = { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, end(b) { if (b) out = JSON.parse(b); }, json(b) { out = b; return this; }, send(b) { out = typeof b === 'string' ? JSON.parse(b) : b; return this; } };
    await plan({ method, headers: { authorization: 'Bearer tok' }, query: { op: 'reviews' }, body }, res);
    return { status: res.statusCode, out };
  };
  await withEnv({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ADMIN_EMAILS: 'boss@example.com' }, async () => {
    mk('boss@example.com');
    const a = await run('GET');
    assert.strictEqual(a.status, 200);
    assert.deepStrictEqual(a.out.reviews, rows);
    const b = await run('POST', { id: 7, status: 'approved' });
    assert.strictEqual(b.status, 200);
    assert.deepStrictEqual(calls[0], { p_id: 7, p_status: 'approved' });
    assert.strictEqual((await run('POST', { id: 7, status: 'published' })).status, 400);
    assert.strictEqual((await run('POST', { status: 'approved' })).status, 400);
    missing = true;
    const c = await run('GET');
    assert.strictEqual(c.status, 503);
    assert.strictEqual(c.out.setup, true);
    missing = false;
    mk('user@example.com');
    assert.strictEqual((await run('GET')).status, 403);
    assert.strictEqual((await run('POST', { id: 7, status: 'approved' })).status, 403);
  });
});
