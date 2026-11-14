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

test('op=review-notify: emails admins about a fresh waiting review, once', async () => {
  delete require.cache[require.resolve('../me/plan')];
  const plan = require('../me/plan');
  let review = null;
  const sentTo = [];
  let lastBody = null;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json(200, { id: init && init.headers && String(init.headers.Authorization).includes('tok2') ? 'u2' : 'u1', email: 'raka@example.com' });
    if (u.includes('/rest/v1/reviews?')) { assert.ok(u.includes('user_id=eq.')); return json(200, review ? [review] : []); }
    if (u.includes('api.resend.com')) { const b = JSON.parse(init.body); sentTo.push(b.to[0]); lastBody = b; return json(200, { id: 'e1' }); }
    return json(200, []);
  };
  const run = async (tok = 'tok') => {
    let out = null;
    const res = { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, end(b) { if (b) out = JSON.parse(b); }, json(b) { out = b; return this; }, send(b) { out = typeof b === 'string' ? JSON.parse(b) : b; return this; } };
    await plan({ method: 'POST', headers: { authorization: 'Bearer ' + tok }, query: { op: 'review-notify' }, body: { quote: 'ignored' } }, res);
    return { status: res.statusCode, out };
  };
  await withEnv({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ADMIN_EMAILS: 'boss@example.com, two@example.com', RESEND_API_KEY: 're_test' }, async () => {
    // No review: nothing sent.
    assert.strictEqual((await run()).out.sent, false);
    // Approved (not waiting): nothing sent.
    review = { rating: 5, quote: 'Awesome tool <b>so</b> much information', display_name: 'Raka', display_role: 'AI engineer', status: 'approved', updated_at: new Date().toISOString() };
    assert.strictEqual((await run()).out.sent, false);
    // Old waiting review: nothing sent.
    review = Object.assign({}, review, { status: 'pending', updated_at: new Date(Date.now() - 3600e3).toISOString() });
    assert.strictEqual((await run()).out.sent, false);
    // Fresh waiting review: both admins, words escaped, no unsubscribe header.
    review = Object.assign({}, review, { updated_at: new Date().toISOString() });
    const a = await run();
    assert.strictEqual(a.status, 200);
    assert.strictEqual(a.out.sent, true);
    assert.deepStrictEqual(sentTo, ['boss@example.com', 'two@example.com']);
    assert.match(lastBody.subject, /New review to approve: 5 of 5 from Raka/);
    assert.ok(lastBody.html.includes('&lt;b&gt;so&lt;/b&gt;'));
    assert.ok(lastBody.html.includes('/admin/reviews'));
    assert.strictEqual(lastBody.headers, undefined);
    // Same person again within 10 minutes: not sent twice.
    assert.strictEqual((await run()).out.sent, false);
    assert.strictEqual(sentTo.length, 2);
  });
  // Not signed in.
  global.fetch = async (url) => (String(url).includes('/auth/v1/user') ? json(401, {}) : json(200, []));
  await withEnv({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', RESEND_API_KEY: 're_test', ADMIN_EMAILS: 'boss@example.com' }, async () => {
    assert.strictEqual((await run()).status, 401);
  });
});
