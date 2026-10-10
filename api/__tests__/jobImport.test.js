/**
 * Tests for import_job_url (api/_lib/jobImport.js + the api/ai.js action).
 * No network: global fetch and dns.promises.lookup are stubbed per test.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const dns = require('node:dns');

const { importJobUrl, MAX_BODY_BYTES, DESCRIPTION_MAX, USER_AGENT, _internal } = require('../_lib/jobImport');

const realFetch = global.fetch;
const realLookup = dns.promises.lookup;
const PUBLIC_IP = '93.184.216.34';

/**
 * Install stubs. `routes` maps an exact URL (or a function(url)) to a Response
 * factory. `hosts` maps hostname -> address (default PUBLIC_IP).
 */
function stub(routes, hosts) {
  const calls = { fetch: [], lookup: [] };
  dns.promises.lookup = async (host, opts) => {
    calls.lookup.push(host);
    assert.equal(opts && opts.all, true);
    const a = (hosts && hosts[host]) || PUBLIC_IP;
    if (a instanceof Error) throw a;
    const list = Array.isArray(a) ? a : [a];
    return list.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
  global.fetch = async (url, init) => {
    calls.fetch.push({ url, init });
    assert.equal(init.redirect, 'manual');
    const r = typeof routes === 'function' ? routes(url, init) : routes[url];
    if (!r) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
    return typeof r === 'function' ? r(init) : r;
  };
  return calls;
}
function restore() { global.fetch = realFetch; dns.promises.lookup = realLookup; }
test.afterEach(restore);

const html = (body, status) => new Response(body, { status: status || 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
const json = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
const redirect = (to, status) => new Response(null, { status: status || 302, headers: { location: to } });

// ---------------------------------------------------------------------------
// ATS APIs
// ---------------------------------------------------------------------------

test('greenhouse: job-boards URL maps through the boards API (escaped HTML content)', async () => {
  const calls = stub({
    'https://boards-api.greenhouse.io/v1/boards/acme/jobs/4012345': json({
      id: 4012345,
      title: 'Senior Data Engineer',
      company_name: 'Acme Corp',
      location: { name: 'Austin, TX' },
      absolute_url: 'https://acme.com/careers?gh_jid=4012345',
      content: '&lt;p&gt;Build pipelines &amp;amp; models.&lt;/p&gt;&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;5+ years SQL&lt;/li&gt;&lt;li&gt;Python &amp;amp; dbt&lt;/li&gt;&lt;/ul&gt;',
    }),
  });
  const r = await importJobUrl('https://job-boards.greenhouse.io/acme/jobs/4012345?gh_src=abc');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.source, 'greenhouse');
  assert.equal(r.body.title, 'Senior Data Engineer');
  assert.equal(r.body.company, 'Acme Corp');
  assert.equal(r.body.location, 'Austin, TX');
  assert.equal(r.body.source_url, 'https://acme.com/careers?gh_jid=4012345');
  assert.equal(r.body.description, 'Build pipelines & models.\n\nRequirements\n\n• 5+ years SQL\n• Python & dbt');
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].init.headers['User-Agent'], USER_AGENT);
});

test('greenhouse: boards.greenhouse.io URL is also recognized', () => {
  const ats = _internal.detectAts(new URL('https://boards.greenhouse.io/acme/jobs/123'));
  assert.deepEqual(ats, { kind: 'greenhouse', board: 'acme', id: '123' });
});

test('lever: posting API mapping (lists + additional, slug company, hostedUrl)', async () => {
  const id = '5ac21346-8e0c-4494-8e7a-3eb92ff77902';
  stub({
    [`https://api.lever.co/v0/postings/leverdemo/${id}`]: json({
      id,
      text: 'Product Designer',
      categories: { location: 'San Francisco', commitment: 'Full-time', team: 'Design' },
      description: '<div>Design delightful products.</div>',
      lists: [{ text: 'What you will do', content: '<li>Own the design system</li><li>Run research</li>' }],
      additional: '<div>We offer great benefits.</div>',
      hostedUrl: `https://jobs.lever.co/leverdemo/${id}`,
      workplaceType: 'hybrid',
    }),
  });
  const r = await importJobUrl(`https://jobs.lever.co/leverdemo/${id}/apply`);
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'lever');
  assert.equal(r.body.title, 'Product Designer');
  assert.equal(r.body.company, 'Leverdemo');
  assert.equal(r.body.location, 'San Francisco');
  assert.equal(r.body.source_url, `https://jobs.lever.co/leverdemo/${id}`);
  assert.equal(r.body.description, 'Design delightful products.\n\nWhat you will do\n\n• Own the design system\n• Run research\n\nWe offer great benefits.');
});

test('lever: remote workplace with no location -> "Remote"', async () => {
  const id = '11111111-2222-3333-4444-555555555555';
  stub({
    [`https://api.lever.co/v0/postings/acme/${id}`]: json({ text: 'SRE', categories: {}, workplaceType: 'remote', descriptionPlain: 'Keep things up.' }),
  });
  const r = await importJobUrl(`https://jobs.lever.co/acme/${id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.location, 'Remote');
  assert.equal(r.body.description, 'Keep things up.');
});

test('ashby: board API matched by id in jobUrl', async () => {
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  stub({
    'https://api.ashbyhq.com/posting-api/job-board/acme': json({
      apiVersion: '1',
      jobs: [
        { title: 'Other', jobUrl: 'https://jobs.ashbyhq.com/acme/ffffffff-0000-0000-0000-000000000000', descriptionHtml: '<p>x</p>' },
        { title: 'ML Engineer', location: 'Houston, TX', isRemote: false, jobUrl: `https://jobs.ashbyhq.com/acme/${id}`, descriptionHtml: '<p>Train models.</p>' },
      ],
    }),
  });
  const r = await importJobUrl(`https://jobs.ashbyhq.com/acme/${id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'ashby');
  assert.equal(r.body.title, 'ML Engineer');
  assert.equal(r.body.location, 'Houston, TX');
  assert.equal(r.body.description, 'Train models.');
});

test('ATS API failure falls back to the page itself', async () => {
  const page = '<html><head><script type="application/ld+json">' + JSON.stringify({
    '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Backend Engineer',
    hiringOrganization: { '@type': 'Organization', name: 'Acme' },
    description: '<p>' + 'Build APIs and services for millions of users. '.repeat(4) + '</p>',
  }) + '</script></head><body></body></html>';
  stub({ 'https://boards.greenhouse.io/acme/jobs/999': html(page) }); // API URL -> 404
  const r = await importJobUrl('https://boards.greenhouse.io/acme/jobs/999');
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'jsonld');
  assert.equal(r.body.title, 'Backend Engineer');
});

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const LONG_DESC = '<p>You will design and ship features across our platform.</p><ul><li>Write code</li><li>Review code</li></ul>'
  + '<p>' + 'We value ownership, curiosity and kindness. '.repeat(3) + '</p>';

test('jsonld: single JobPosting object', async () => {
  const page = `<!doctype html><html><head><title>Job</title>
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'JobPosting',
      title: 'Frontend Engineer',
      hiringOrganization: { '@type': 'Organization', name: 'Widgets &amp; Co' },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Berlin', addressRegion: 'BE', addressCountry: 'DE' } },
      description: LONG_DESC,
      url: 'https://widgets.example.com/jobs/42',
    })}</script></head><body><p>ignored</p></body></html>`;
  stub({ 'https://widgets.example.com/jobs/42': html(page) });
  const r = await importJobUrl('https://widgets.example.com/jobs/42');
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'jsonld');
  assert.equal(r.body.title, 'Frontend Engineer');
  assert.equal(r.body.company, 'Widgets & Co');
  assert.equal(r.body.location, 'Berlin, BE, DE');
  assert.match(r.body.description, /^You will design and ship features across our platform\.\n\n• Write code\n• Review code\n\nWe value/);
  assert.equal(r.body.source_url, 'https://widgets.example.com/jobs/42');
});

test('jsonld: JobPosting inside an @graph array, TELECOMMUTE -> Remote', async () => {
  const page = `<html><head><script type='application/ld+json'>${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: 'Careers' },
      { '@type': 'Organization', name: 'Acme' },
      { '@type': ['JobPosting'], title: 'Data Scientist', hiringOrganization: 'Acme Labs', jobLocationType: 'TELECOMMUTE',
        jobLocation: [{ address: { addressLocality: 'NYC' } }], description: LONG_DESC },
    ],
  })}</script></head></html>`;
  stub({ 'https://careers.acme.io/ds': html(page) });
  const r = await importJobUrl('https://careers.acme.io/ds');
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'jsonld');
  assert.equal(r.body.title, 'Data Scientist');
  assert.equal(r.body.company, 'Acme Labs');
  assert.equal(r.body.location, 'Remote');
});

test('jsonld: entity-escaped HTML description is decoded and converted', () => {
  const job = _internal.extractJsonLd(`<script type="application/ld+json">{"@type":"JobPosting","title":"X","description":"&lt;p&gt;Hi &amp;amp; welcome&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;"}</script>`);
  assert.equal(_internal.richToText(job.description), 'Hi & welcome\n\n• One');
});

// ---------------------------------------------------------------------------
// HTML fallback
// ---------------------------------------------------------------------------

test('html fallback: accepts a readable posting, strips nav/header/footer/scripts', async () => {
  const main = '<h1>Staff Engineer</h1><h2>Responsibilities</h2><ul><li>Lead architecture</li><li>Mentor engineers</li></ul>'
    + '<h2>Requirements</h2><p>' + '8+ years of experience building distributed systems at scale. '.repeat(8) + '</p>';
  const page = `<html><head><title>Staff Engineer | Acme</title><meta property="og:site_name" content="Acme"><style>.x{color:red}</style></head>
    <body><header>Acme Home Jobs Login</header><nav>Menu links</nav>
    <main>${main}<script>alert('x')</script></main>
    <footer>Copyright Acme</footer></body></html>`;
  stub({ 'https://acme.example/careers/staff': html(page) });
  const r = await importJobUrl('https://acme.example/careers/staff');
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'html');
  assert.equal(r.body.title, 'Staff Engineer');
  assert.equal(r.body.company, 'Acme');
  assert.match(r.body.description, /^Staff Engineer\n\nResponsibilities\n\n• Lead architecture\n• Mentor engineers\n\nRequirements/);
  assert.doesNotMatch(r.body.description, /Menu links|Copyright|alert|color:red|Login/);
});

test('html fallback: rejects a page that does not look like a posting (422 blocked)', async () => {
  const page = '<html><body><main><h1>Our blog</h1><p>' + 'We love coffee and long walks. '.repeat(30) + '</p></main></body></html>';
  stub({ 'https://blog.example.org/post': html(page) });
  const r = await importJobUrl('https://blog.example.org/post');
  assert.equal(r.status, 422);
  assert.equal(r.body.blocked, true);
  assert.match(r.body.error, /paste/i);
  assert.doesNotMatch(r.body.error, /coffee/);
});

test('html fallback: rejects short pages even with keywords', () => {
  assert.equal(_internal.looksLikePosting('Requirements: experience.'), false);
});

// ---------------------------------------------------------------------------
// Blocked sites, validation, SSRF
// ---------------------------------------------------------------------------

test('linkedin / indeed: 422 immediately without any fetch or DNS lookup', async () => {
  for (const u of ['https://www.linkedin.com/jobs/view/123456', 'https://uk.indeed.com/viewjob?jk=abc', 'https://www.indeed.com/viewjob?jk=1']) {
    const calls = stub({});
    const r = await importJobUrl(u);
    assert.equal(r.status, 422, u);
    assert.equal(r.body.blocked, true);
    assert.match(r.body.error, /(LinkedIn|Indeed).*paste/i);
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.lookup.length, 0);
  }
});

test('missing / malformed URL -> 400', async () => {
  for (const u of [undefined, '', '   ', 'not a url', 'http://', 'x'.repeat(3000)]) {
    const r = await importJobUrl(u);
    assert.equal(r.status, 400, String(u).slice(0, 20));
    assert.ok(r.body.error);
  }
});

test('non-http schemes -> 400 without fetching', async () => {
  for (const u of ['ftp://example.com/job', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<p>x</p>', 'gopher://example.com']) {
    const calls = stub({});
    const r = await importJobUrl(u);
    assert.equal(r.status, 400, u);
    assert.equal(calls.fetch.length, 0);
  }
});

test('credentials, odd ports and localhost-like hosts -> 400', async () => {
  for (const u of ['https://user:pw@example.com/job', 'https://example.com:8080/job', 'http://localhost/job',
    'http://foo.localhost/', 'http://metadata.google.internal/computeMetadata/v1/', 'http://intranet/jobs',
    'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://0x7f000001/']) {
    const calls = stub({});
    const r = await importJobUrl(u);
    assert.equal(r.status, 400, u);
    assert.equal(calls.fetch.length, 0, u);
  }
});

test('hostname resolving to a private address -> 400, never fetched', async () => {
  for (const ip of ['10.1.2.3', '192.168.0.10', '172.20.0.1', '100.64.1.1', '127.0.0.1', '169.254.169.254', '0.0.0.0', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:7f00:1']) {
    const calls = stub({}, { 'jobs.evil.example': ip });
    const r = await importJobUrl('https://jobs.evil.example/job/1');
    assert.equal(r.status, 400, ip);
    assert.equal(calls.fetch.length, 0, ip);
  }
});

test('any private address among several DNS answers is rejected', async () => {
  const calls = stub({}, { 'mixed.example.com': ['8.8.8.8', '10.0.0.5'] });
  const r = await importJobUrl('https://mixed.example.com/job');
  assert.equal(r.status, 400);
  assert.equal(calls.fetch.length, 0);
});

test('isBlockedAddress: public addresses pass', () => {
  for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700::1111', '172.32.0.1', '100.128.0.1']) {
    assert.equal(_internal.isBlockedAddress(ip), false, ip);
  }
});

test('redirect to 169.254.169.254 is rejected and not followed', async () => {
  const calls = stub({
    'https://jobs.example.com/a': redirect('http://169.254.169.254/latest/meta-data/'),
  });
  const r = await importJobUrl('https://jobs.example.com/a');
  assert.equal(r.status, 422);
  assert.equal(r.body.blocked, true);
  assert.equal(calls.fetch.length, 1);
});

test('redirect to a hostname resolving privately is rejected (each hop re-validated)', async () => {
  const calls = stub({
    'https://jobs.example.com/a': redirect('https://internal.example.com/x', 301),
  }, { 'internal.example.com': '192.168.1.1' });
  const r = await importJobUrl('https://jobs.example.com/a');
  assert.equal(r.status, 422);
  assert.equal(calls.fetch.length, 1);
  assert.ok(calls.lookup.includes('internal.example.com'));
});

test('redirects: up to 3 are followed, the 4th is refused', async () => {
  const posting = '<main><h2>Responsibilities</h2><p>' + 'Ship features with experience and care. '.repeat(15) + '</p><h2>Requirements</h2></main>';
  stub({
    'https://a.example.com/1': redirect('/2'),
    'https://a.example.com/2': redirect('https://b.example.com/3'),
    'https://b.example.com/3': redirect('https://b.example.com/4'),
    'https://b.example.com/4': html(posting),
  });
  const ok = await importJobUrl('https://a.example.com/1');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.source_url, 'https://b.example.com/4');

  stub({
    'https://a.example.com/1': redirect('/2'),
    'https://a.example.com/2': redirect('/3'),
    'https://a.example.com/3': redirect('/4'),
    'https://a.example.com/4': redirect('/5'),
    'https://a.example.com/5': html(posting),
  });
  const tooMany = await importJobUrl('https://a.example.com/1');
  assert.equal(tooMany.status, 422);
});

test('disallowed content type -> 422', async () => {
  stub({ 'https://files.example.com/job.pdf': new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } }) });
  const r = await importJobUrl('https://files.example.com/job.pdf');
  assert.equal(r.status, 422);
  assert.equal(r.body.blocked, true);
});

test('site returning 403 -> 422 blocked with a paste hint, no content echoed', async () => {
  stub({ 'https://shy.example.com/job': html('<p>SECRET-BODY Access denied</p>', 403) });
  const r = await importJobUrl('https://shy.example.com/job');
  assert.equal(r.status, 422);
  assert.equal(r.body.blocked, true);
  assert.match(r.body.error, /paste/i);
  assert.doesNotMatch(JSON.stringify(r.body), /SECRET-BODY/);
});

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

test('body read stops at 2 MB (stream is not drained)', async () => {
  const chunk = new TextEncoder().encode('<p>' + 'experience requirements responsibilities '.repeat(1600) + '</p>'); // ~65 KB
  let pulled = 0;
  const total = 200; // ~13 MB if fully read
  const stream = new ReadableStream({
    pull(controller) {
      if (pulled >= total) { controller.close(); return; }
      pulled++;
      controller.enqueue(chunk);
    },
  });
  stub({ 'https://big.example.com/job': () => new Response(stream, { headers: { 'content-type': 'text/html' } }) });
  const r = await importJobUrl('https://big.example.com/job');
  const maxChunks = Math.ceil(MAX_BODY_BYTES / chunk.byteLength) + 2; // + stream high-water slack
  assert.ok(pulled <= maxChunks, `pulled ${pulled} chunks`);
  assert.equal(r.status, 200);
  assert.ok(r.body.description.length <= DESCRIPTION_MAX);
});

test('description is capped at 20,000 characters', async () => {
  const page = '<main><h2>Responsibilities</h2><h2>Requirements</h2><p>' + 'experience '.repeat(5000) + '</p></main>';
  stub({ 'https://long.example.com/job': html(page) });
  const r = await importJobUrl('https://long.example.com/job');
  assert.equal(r.status, 200);
  assert.ok(r.body.description.length <= DESCRIPTION_MAX);
  assert.ok(r.body.description.length > DESCRIPTION_MAX - 200);
});

test('timeout -> 504 (hanging fetch is aborted)', async () => {
  let aborted = false;
  stub(() => (init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
  }));
  const t0 = Date.now();
  const r = await importJobUrl('https://slow.example.com/job', { timeoutMs: 60 });
  assert.equal(r.status, 504);
  assert.ok(r.body.error);
  assert.ok(aborted);
  assert.ok(Date.now() - t0 < 2000);
});

test('timeout -> 504 even when the body stream stalls', async () => {
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('<p>start')); } }); // never closes
  stub({ 'https://stall.example.com/job': () => new Response(stream, { headers: { 'content-type': 'text/html' } }) });
  const r = await importJobUrl('https://stall.example.com/job', { timeoutMs: 60 });
  assert.equal(r.status, 504);
});

// ---------------------------------------------------------------------------
// Text conversion
// ---------------------------------------------------------------------------

test('entity decoding: named, decimal, hex; single pass', () => {
  assert.equal(_internal.decodeEntities('Tom &amp; Jerry &mdash; &#8220;hi&#8221; &#x2019; caf&eacute; &nbsp;x'), 'Tom & Jerry — “hi” ’ café  x');
  assert.equal(_internal.decodeEntities('&amp;lt;p&amp;gt;'), '&lt;p&gt;');
  assert.equal(_internal.decodeEntities('&unknown; &#0; AT&T'), '&unknown; � AT&T');
});

test('htmlToText: paragraphs, bullets, br, scripts/styles removed, whitespace tidy', () => {
  const t = _internal.htmlToText('<style>p{}</style><p>  One\n   two </p><script>var x=1</script><ul><li><p>A</p></li><li>B &amp; C</li></ul>Line<br>break');
  assert.equal(t, 'One two\n\n• A\n• B & C\n\nLine\nbreak');
});

// ---------------------------------------------------------------------------
// api/ai.js wiring
// ---------------------------------------------------------------------------

function fakeRes() {
  return {
    statusCode: 0, headers: {}, body: '',
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    end(b) { if (b !== undefined) this.body += b; },
    json() { return JSON.parse(this.body || 'null'); },
  };
}
const aiReq = (body, ip) => ({ method: 'POST', headers: { origin: 'https://klnjoy.github.io', 'x-forwarded-for': ip }, body });

test('api/ai import_job_url: works without sign-in or OPENAI_API_KEY', async () => {
  const handler = require('../ai');
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    stub({});
    const res = fakeRes();
    await handler(aiReq({ action: 'import_job_url', url: 'https://www.linkedin.com/jobs/view/1' }, '198.51.100.7'), res);
    assert.equal(res.statusCode, 422);
    assert.equal(res.json().blocked, true);

    const res2 = fakeRes();
    await handler(aiReq(JSON.stringify({ action: 'import_job_url' }), '198.51.100.7'), res2);
    assert.equal(res2.statusCode, 400);
  } finally { if (saved !== undefined) process.env.OPENAI_API_KEY = saved; }
});

test('api/ai import_job_url: 21st request per minute from one IP -> 429', async () => {
  const handler = require('../ai');
  stub({});
  for (let i = 0; i < 20; i++) {
    const res = fakeRes();
    await handler(aiReq({ action: 'import_job_url', url: 'https://www.linkedin.com/jobs/view/1' }, '198.51.100.99'), res);
    assert.equal(res.statusCode, 422);
  }
  const res = fakeRes();
  await handler(aiReq({ action: 'import_job_url', url: 'https://www.linkedin.com/jobs/view/1' }, '198.51.100.99'), res);
  assert.equal(res.statusCode, 429);
  assert.ok(res.headers['Retry-After']);
});

// ---------------------------------------------------------------------------
// Workday + SmartRecruiters
// ---------------------------------------------------------------------------

test('workday: myworkdayjobs URL maps to the cxs JSON API', async () => {
  const calls = stub({
    'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/Careers/job/Austin-TX/Senior-Data-Engineer_R123': json({
      jobPostingInfo: { title: 'Senior Data Engineer', jobDescription: '<p>Build pipelines with <b>Spark</b>.</p><ul><li>5+ years SQL</li></ul>', location: 'Austin, TX', additionalLocations: ['Remote - US'], externalUrl: 'https://acme.wd5.myworkdayjobs.com/Careers/job/Austin-TX/Senior-Data-Engineer_R123' },
      hiringOrganization: { name: 'Acme Corp' },
    }),
  });
  const r = await importJobUrl('https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Austin-TX/Senior-Data-Engineer_R123?source=LinkedIn');
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'workday');
  assert.equal(r.body.title, 'Senior Data Engineer');
  assert.equal(r.body.company, 'Acme Corp');
  assert.equal(r.body.location, 'Austin, TX; Remote - US');
  assert.match(r.body.description, /Build pipelines with Spark\./);
  assert.match(r.body.description, /• 5\+ years SQL/);
  assert.equal(calls.fetch[0].init.headers.Accept, 'application/json');
});

test('workday: myworkdaysite recruiting URL is recognized', () => {
  const a = _internal.detectAts(new URL('https://wd3.myworkdaysite.com/en-US/recruiting/acme/External/job/NYC/ML-Engineer_JR99'));
  assert.deepEqual(a, { kind: 'workday', host: 'wd3.myworkdaysite.com', tenant: 'acme', site: 'External', path: ['NYC', 'ML-Engineer_JR99'] });
  assert.equal(_internal.detectAts(new URL('https://acme.wd5.myworkdayjobs.com/Careers')), null);
});

test('smartrecruiters: posting URL maps to the postings API', async () => {
  stub({
    'https://api.smartrecruiters.com/v1/companies/AcmeCorp/postings/744000012345678': json({
      name: 'AI Engineer', company: { name: 'Acme Corp' }, location: { city: 'Berlin', country: 'de', remote: true },
      postingUrl: 'https://jobs.smartrecruiters.com/AcmeCorp/744000012345678-ai-engineer',
      jobAd: { sections: { jobDescription: { title: 'Job Description', text: '<p>Build RAG systems.</p>' }, qualifications: { title: 'Qualifications', text: '<ul><li>Python</li></ul>' } } },
    }),
  });
  const r = await importJobUrl('https://jobs.smartrecruiters.com/AcmeCorp/744000012345678-ai-engineer');
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'smartrecruiters');
  assert.equal(r.body.title, 'AI Engineer');
  assert.equal(r.body.company, 'Acme Corp');
  assert.equal(r.body.location, 'Berlin, de (remote)');
  assert.match(r.body.description, /Build RAG systems\./);
});

test('workday: API failure falls back to the page (and reports not found)', async () => {
  stub({});
  const r = await importJobUrl('https://acme.wd5.myworkdayjobs.com/Careers/job/Austin/Engineer_R1');
  assert.equal(r.status, 422);
  assert.equal(r.body.blocked, true);
});
