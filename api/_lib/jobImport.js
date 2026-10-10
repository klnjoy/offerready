/**
 * api/_lib/jobImport.js — import a job posting from a user-supplied link.
 * ---------------------------------------------------------------------------
 * Used by POST /api/ai { action: "import_job_url", url }.
 *
 * Extraction order:
 *   1. Known ATS public JSON APIs (more reliable than scraping HTML):
 *        Greenhouse  boards.greenhouse.io/{board}/jobs/{id}
 *                    job-boards.greenhouse.io/{board}/jobs/{id}
 *                    -> https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}
 *                       (title, company_name, location.name, content [HTML-escaped HTML], absolute_url)
 *        Lever       jobs.lever.co/{site}/{id}     -> https://api.lever.co/v0/postings/{site}/{id}
 *                    jobs.eu.lever.co/{site}/{id}  -> https://api.eu.lever.co/v0/postings/{site}/{id}
 *                       (text, categories.location/allLocations, workplaceType, description,
 *                        lists[{text,content}], additional, hostedUrl; no company field)
 *        Ashby       jobs.ashbyhq.com/{org}/{id}  -> https://api.ashbyhq.com/posting-api/job-board/{org}
 *                       (jobs[]: title, location, isRemote, descriptionHtml, descriptionPlain, jobUrl).
 *                       The board API has no documented single-posting endpoint, so the posting is
 *                       matched by its id within jobUrl; otherwise the page itself is used.
 *        Workday     {tenant}.wdN.myworkdayjobs.com/[lang/]{site}/job/{path}
 *                    wdN.myworkdaysite.com/[lang/]recruiting/{tenant}/{site}/job/{path}
 *                    -> https://{host}/wday/cxs/{tenant}/{site}/job/{path}
 *                       (jobPostingInfo.title/jobDescription/location/externalUrl,
 *                        hiringOrganization.name). Workday pages are rendered by
 *                        JavaScript, so the page itself has no readable posting.
 *        SmartRecruiters jobs.smartrecruiters.com/{company}/{id}[-slug]
 *                    -> https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}
 *                       (name, company.name, location, jobAd.sections.*.text, postingUrl)
 *   2. schema.org JobPosting JSON-LD on the page (including @graph arrays).
 *   3. The page's readable main text, accepted only if it looks like a posting.
 *
 * SSRF posture (this fetches user-supplied URLs server-side):
 *   - http/https only, ports 80/443 only, no credentials in the URL.
 *   - Localhost-like hostnames rejected; every hostname resolved with
 *     dns.promises.lookup({all:true}) and rejected if ANY address is private,
 *     loopback, link-local, CGNAT, multicast, reserved or metadata.
 *   - Redirects followed manually (max 3), each hop re-validated.
 *   - 8s total deadline, body read capped at 2 MB (streamed, then stopped),
 *     only text/html, application/json, application/ld+json accepted.
 *   - Residual risk: global fetch re-resolves DNS after our check, so a
 *     rebinding DNS server could in theory flip the answer between lookup and
 *     connect. Pinning the connection would need a custom dispatcher (undici
 *     dependency); the short window plus the hop re-validation is accepted here.
 *   - Fetched content is never echoed into error messages; URLs with query
 *     strings are never logged (only the hostname is).
 */

'use strict';

const dns = require('node:dns');
const net = require('node:net');

const USER_AGENT = 'OfferReadyJobImport/1.0 (+https://klnjoy.github.io/offerready-app/)';
const TOTAL_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2048;
const DESCRIPTION_MAX = 20000;
const ALLOWED_TYPES = new Set(['text/html', 'application/json', 'application/ld+json']);

const PASTE_HINT = 'Please copy the job description from the posting and paste it in instead.';
const MSG = {
  invalid: 'Enter a valid job posting link that starts with https://.',
  unsafe: 'That link can\'t be imported. Please use a public job posting link.',
  timeout: 'The job site took too long to respond. Try again, or paste the job description instead.',
  blockedFetch: 'That site doesn\'t allow job imports. ' + PASTE_HINT,
  notFound: 'We couldn\'t find a job posting at that link. ' + PASTE_HINT,
  unreachable: 'We couldn\'t reach that site. ' + PASTE_HINT,
  badRedirect: 'That link redirects somewhere we can\'t import from. ' + PASTE_HINT,
};

// Sites known to block automated access. Never fetched: answered immediately.
const BLOCKED_SITES = [
  { re: /(^|\.)linkedin\.(com|cn|[a-z]{2})$/, name: 'LinkedIn' },
  { re: /(^|\.)lnkd\.in$/, name: 'LinkedIn' },
  { re: /(^|\.)indeed\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/, name: 'Indeed' },
  { re: /(^|\.)glassdoor\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/, name: 'Glassdoor' },
];

class ImportError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || {};
  }
}
const blocked = (msg) => new ImportError(422, msg, { blocked: true });

// ---------------------------------------------------------------------------
// URL + address validation
// ---------------------------------------------------------------------------

/** Parse + validate a user URL. Throws ImportError(400) when unusable. */
function parseUserUrl(raw) {
  let s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || s.length > MAX_URL_LENGTH) throw new ImportError(400, MSG.invalid);
  // Be forgiving of a bare "boards.greenhouse.io/..." paste, but never of
  // another scheme ("javascript:", "file:", "ftp:" ...).
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch (_e) { throw new ImportError(400, MSG.invalid); }
  checkUrlShape(u, 400);
  return u;
}

/** Scheme / port / credentials / hostname shape. */
function checkUrlShape(u, status) {
  const bad = (m) => { throw new ImportError(status, m, status === 422 ? { blocked: true } : undefined); };
  if (u.protocol !== 'http:' && u.protocol !== 'https:') bad(status === 400 ? MSG.invalid : MSG.badRedirect);
  if (u.username || u.password) bad(status === 400 ? MSG.unsafe : MSG.badRedirect);
  if (u.port && u.port !== '80' && u.port !== '443') bad(status === 400 ? MSG.unsafe : MSG.badRedirect);
  const host = normHost(u.hostname);
  if (!host || isLocalHostname(host)) bad(status === 400 ? MSG.unsafe : MSG.badRedirect);
  const lit = stripBrackets(host);
  if (net.isIP(lit) && isBlockedAddress(lit)) bad(status === 400 ? MSG.unsafe : MSG.badRedirect);
}

function normHost(h) { return String(h || '').toLowerCase().replace(/\.+$/, ''); }
function stripBrackets(h) { return h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h; }

function isLocalHostname(host) {
  if (net.isIP(stripBrackets(host))) return false;
  if (!host.includes('.')) return true; // "localhost", "intranet", "metadata" ...
  return /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|home\.arpa)$/.test(host)
    || host === 'metadata.google.internal';
}

function blockedSite(host) {
  for (const b of BLOCKED_SITES) if (b.re.test(host)) return b.name;
  return null;
}

function ipv4ToInt(a) {
  const p = a.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => ({ base: ipv4ToInt(base), mask: bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0 }));

function isBlockedV4(a) {
  const n = ipv4ToInt(a);
  if (n === null) return true;
  return V4_BLOCKS.some((b) => ((n & b.mask) >>> 0) === b.base);
}

/** Expand an IPv6 literal to 8 16-bit groups (handles :: and dotted tail). */
function expandV6(a) {
  let s = a.toLowerCase().split('%')[0];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    const n = ipv4ToInt(dotted[1]);
    if (n === null) return null;
    s = s.slice(0, -dotted[1].length) + ((n >>> 16).toString(16)) + ':' + ((n & 0xffff).toString(16));
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = head.concat(new Array(fill).fill('0'), tail).map((g) => parseInt(g, 16));
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) return null;
  return groups;
}

function isBlockedV6(a) {
  const g = expandV6(a);
  if (!g) return true;
  const v4 = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  if (g.slice(0, 7).every((x) => x === 0)) return true;                  // ::, ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isBlockedV4(v4()); // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return true;                  // ::a.b.c.d (deprecated compat)
  if (g[0] === 0x64 && g[1] === 0xff9b) return isBlockedV4(v4());        // NAT64 64:ff9b::/96
  if ((g[0] & 0xfe00) === 0xfc00) return true;                           // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true;                           // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true;                           // fec0::/10 site-local
  if ((g[0] & 0xff00) === 0xff00) return true;                           // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;                   // documentation
  return false;
}

/** True when an IP address must never be fetched. */
function isBlockedAddress(addr) {
  const a = String(addr || '');
  const fam = net.isIP(a);
  if (fam === 4) return isBlockedV4(a);
  if (fam === 6) return isBlockedV6(a);
  return true;
}

/** Resolve and check every address for the URL's hostname. */
async function assertPublicHost(u, status, race) {
  const host = stripBrackets(normHost(u.hostname));
  if (net.isIP(host)) return; // literal already checked in checkUrlShape
  let addrs;
  try {
    addrs = await race(dns.promises.lookup(host, { all: true, verbatim: true }));
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw blocked(MSG.unreachable);
  }
  const list = Array.isArray(addrs) ? addrs : [addrs];
  if (!list.length) throw blocked(MSG.unreachable);
  for (const r of list) {
    const ip = r && typeof r === 'object' ? r.address : r;
    if (isBlockedAddress(ip)) {
      throw status === 400 ? new ImportError(400, MSG.unsafe) : blocked(MSG.badRedirect);
    }
  }
}

// ---------------------------------------------------------------------------
// Safe fetch
// ---------------------------------------------------------------------------

/**
 * Fetch `startUrl` with redirect/body/content-type limits. Returns
 * { status, url, mediaType, text }. `ctx` carries the shared deadline.
 */
async function safeFetch(startUrl, ctx, accept) {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // The user's own host was already checked (400 path); every hop here,
    // including redirects and ATS API hosts, is re-validated.
    checkUrlShape(current, 422);
    await assertPublicHost(current, 422, ctx.race);

    let resp;
    try {
      resp = await ctx.race(globalThis.fetch(current.href, {
        method: 'GET',
        redirect: 'manual',
        signal: ctx.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: accept || 'text/html,application/xhtml+xml;q=0.9,application/json;q=0.8,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.8',
        },
      }));
    } catch (e) {
      if (e instanceof ImportError) throw e;
      if (ctx.timedOut() || (e && e.name === 'AbortError')) throw new ImportError(504, MSG.timeout);
      throw blocked(MSG.unreachable);
    }

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      cancelBody(resp);
      if (!loc || hop === MAX_REDIRECTS) throw blocked(MSG.badRedirect);
      let next;
      try { next = new URL(loc, current); } catch (_e) { throw blocked(MSG.badRedirect); }
      current = next;
      continue;
    }

    if (resp.status === 404 || resp.status === 410) { cancelBody(resp); throw blocked(MSG.notFound); }
    if (!resp.ok) { cancelBody(resp); throw blocked(MSG.blockedFetch); }

    const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
    const mediaType = contentType.split(';')[0].trim();
    if (!ALLOWED_TYPES.has(mediaType)) { cancelBody(resp); throw blocked(MSG.notFound); }

    const text = await readCapped(resp, contentType, ctx);
    return { status: resp.status, url: current, mediaType, text };
  }
  throw blocked(MSG.badRedirect);
}

function cancelBody(resp) {
  try { if (resp.body && typeof resp.body.cancel === 'function') resp.body.cancel().catch(() => {}); } catch (_e) { /* ignore */ }
}

function decoderFor(contentType) {
  const m = /charset\s*=\s*"?([\w-]+)/i.exec(contentType || '');
  try { return new TextDecoder(m ? m[1] : 'utf-8'); } catch (_e) { return new TextDecoder('utf-8'); }
}

/** Read at most MAX_BODY_BYTES, then stop reading (and cancel the stream). */
async function readCapped(resp, contentType, ctx) {
  const decoder = decoderFor(contentType);
  try {
    if (resp.body && typeof resp.body.getReader === 'function') {
      const reader = resp.body.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await ctx.race(reader.read());
        if (done) break;
        const room = MAX_BODY_BYTES - total;
        if (value.byteLength >= room) {
          chunks.push(value.subarray(0, room));
          total += room;
          reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
        total += value.byteLength;
      }
      const buf = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
      return decoder.decode(buf);
    }
    const ab = await ctx.race(resp.arrayBuffer());
    return decoder.decode(new Uint8Array(ab).subarray(0, MAX_BODY_BYTES));
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if (ctx.timedOut() || (e && e.name === 'AbortError')) throw new ImportError(504, MSG.timeout);
    throw blocked(MSG.unreachable);
  }
}

// ---------------------------------------------------------------------------
// HTML -> text
// ---------------------------------------------------------------------------

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”',
  bdquo: '„', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£',
  yen: '¥', cent: '¢', deg: '°', times: '×', divide: '÷', plusmn: '±', laquo: '«', raquo: '»',
  sect: '§', para: '¶', shy: '', zwj: '', zwnj: '', lrm: '', rlm: '', iexcl: '¡', iquest: '¿',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', agrave: 'à', egrave: 'è',
  igrave: 'ì', ograve: 'ò', ugrave: 'ù', acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü', ntilde: 'ñ', ccedil: 'ç', szlig: 'ß',
  Aacute: 'Á', Eacute: 'É', Oacute: 'Ó', Uacute: 'Ú', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', Ntilde: 'Ñ',
  rarr: '→', larr: '←', check: '✓', star: '☆', hearts: '♥',
};

/** Decode HTML entities in ONE pass ("&amp;lt;" -> "&lt;", not "<"). */
function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
      if (code === 0xa0) return ' ';
      return String.fromCodePoint(code);
    }
    // Named entities need their ";" except the handful browsers accept bare.
    if (!m.endsWith(';') && !/^(amp|lt|gt|quot|nbsp)$/i.test(body)) return m;
    const v = Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : NAMED[body.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function stripNonContent(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe|object|canvas|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(script|style|noscript|template)\b[^>]*\/?>/gi, ' ');
}

/** Convert an HTML fragment/document into readable plain text. */
function htmlToText(html) {
  // Source newlines are just whitespace in HTML; structure comes from tags.
  let s = stripNonContent(html).replace(/[\s\u00a0]+/g, (m) => (m.includes('\u00a0') ? '\u00a0' : ' '));
  s = s
    .replace(/(<li\b[^>]*>)\s*<(p|div|span)\b[^>]*>/gi, '$1')
    .replace(/<\/(p|div)>\s*(<\/li\s*>)/gi, '$2')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/li\s*>/gi, '')
    .replace(/<\/?(p|h[1-6]|ul|ol|dl|blockquote|pre|section|article|table|main|header|footer|aside|nav|figure|hr)\b[^>]*>/gi, '\n\n')
    .replace(/<\/?(div|tr|dd|dt|caption|thead|tbody|tfoot|form|fieldset|legend|address)\b[^>]*>/gi, '\n')
    .replace(/<\/?(td|th)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '');
  s = decodeEntities(s)
    .replace(/\r\n?/g, '\n')
    .replace(/[   \t\f\v]/g, ' ')
    .replace(/[​-‍﻿]/g, '');
  const lines = s.split('\n').map((l) => l.replace(/ {2,}/g, ' ').trim())
    .map((l) => (/^[•·*\-–]\s*$/.test(l) ? '' : l.replace(/^•\s*[•·]\s*/, '• ')));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** HTML (possibly entity-escaped HTML, as Greenhouse returns) -> text. */
function richToText(s) {
  let h = String(s || '');
  for (let i = 0; i < 2 && !/<[a-z!/]/i.test(h) && /&lt;\s*\/?[a-z]/i.test(h); i++) h = decodeEntities(h);
  return htmlToText(h);
}

function capDescription(text) {
  const t = String(text || '').trim();
  if (t.length <= DESCRIPTION_MAX) return t;
  const cut = t.slice(0, DESCRIPTION_MAX - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > DESCRIPTION_MAX - 200 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

function clean(s, max) {
  const t = decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).trim() : t;
}

function humanizeSlug(slug) {
  return String(slug || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// ATS detection + mapping
// ---------------------------------------------------------------------------

function detectAts(u) {
  const host = normHost(u.hostname);
  const parts = u.pathname.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch (_e) { return p; } });
  const slug = /^[A-Za-z0-9_.-]{1,100}$/;
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    if (parts.length >= 3 && parts[1] === 'jobs' && slug.test(parts[0]) && /^\d{1,20}$/.test(parts[2])) {
      return { kind: 'greenhouse', board: parts[0], id: parts[2] };
    }
    const forBoard = u.searchParams.get('for');
    const token = u.searchParams.get('token') || u.searchParams.get('gh_jid');
    if (parts[0] === 'embed' && forBoard && slug.test(forBoard) && token && /^\d{1,20}$/.test(token)) {
      return { kind: 'greenhouse', board: forBoard, id: token };
    }
  }
  if ((host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') && parts.length >= 2
      && slug.test(parts[0]) && /^[0-9a-f-]{8,64}$/i.test(parts[1])) {
    return { kind: 'lever', site: parts[0], id: parts[1], eu: host === 'jobs.eu.lever.co' };
  }
  if (host === 'jobs.ashbyhq.com' && parts.length >= 2 && slug.test(parts[0]) && /^[0-9a-f-]{8,64}$/i.test(parts[1])) {
    return { kind: 'ashby', org: parts[0], id: parts[1].toLowerCase() };
  }
  // Workday: optional language segment ("en-US"), then the site, then /job/...
  const lang = (p) => /^[a-z]{2}(-[A-Za-z]{2})?$/.test(p);
  let wd = /^([a-z0-9-]{1,63})\.(wd\d{1,3})\.myworkdayjobs\.com$/.exec(host);
  if (wd) {
    const rest = lang(parts[0] || '') ? parts.slice(1) : parts;
    const at = rest.indexOf('job');
    if (at === 1 && slug.test(rest[0]) && rest.length > 2) {
      return { kind: 'workday', host, tenant: wd[1], site: rest[0], path: rest.slice(2) };
    }
  }
  wd = /^(wd\d{1,3})\.myworkdaysite\.com$/.exec(host);
  if (wd) {
    const rest = lang(parts[0] || '') ? parts.slice(1) : parts;
    if (rest[0] === 'recruiting' && slug.test(rest[1] || '') && slug.test(rest[2] || '') && rest[3] === 'job' && rest.length > 4) {
      return { kind: 'workday', host, tenant: rest[1], site: rest[2], path: rest.slice(4) };
    }
  }
  if (host === 'jobs.smartrecruiters.com' && parts.length >= 2 && slug.test(parts[0])) {
    const m = /^(\d{6,20})/.exec(parts[1]);
    if (m) return { kind: 'smartrecruiters', company: parts[0], id: m[1] };
  }
  return null;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (_e) { return null; }
}

function httpUrlOr(candidate, fallback) {
  try {
    const u = new URL(String(candidate || ''));
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
  } catch (_e) { /* fall through */ }
  return fallback;
}

async function fromGreenhouse(ats, userUrl, ctx) {
  const api = new URL(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ats.board)}/jobs/${encodeURIComponent(ats.id)}`);
  const r = await safeFetch(api, ctx, 'application/json');
  const j = parseJson(r.text);
  if (!j || typeof j !== 'object' || !j.title) return null;
  const description = capDescription(richToText(j.content));
  if (!description) return null;
  return {
    title: clean(j.title, 300),
    company: clean(j.company_name, 200) || humanizeSlug(ats.board),
    location: clean(j.location && j.location.name, 300),
    description,
    source_url: httpUrlOr(j.absolute_url, userUrl.href),
    source: 'greenhouse',
  };
}

async function fromLever(ats, userUrl, ctx) {
  const base = ats.eu ? 'https://api.eu.lever.co' : 'https://api.lever.co';
  const api = new URL(`${base}/v0/postings/${encodeURIComponent(ats.site)}/${encodeURIComponent(ats.id)}`);
  const r = await safeFetch(api, ctx, 'application/json');
  const j = parseJson(r.text);
  if (!j || typeof j !== 'object' || !j.text) return null;
  const parts = [];
  if (j.description) parts.push(String(j.description));
  else if (j.descriptionPlain) parts.push(escapeHtml(j.descriptionPlain).replace(/\n/g, '<br>'));
  for (const l of Array.isArray(j.lists) ? j.lists : []) {
    if (!l || typeof l !== 'object') continue;
    parts.push(`<h3>${escapeHtml(l.text || '')}</h3><ul>${String(l.content || '')}</ul>`);
  }
  if (j.additional) parts.push(String(j.additional));
  const description = capDescription(htmlToText(parts.join('\n')));
  if (!description) return null;
  const cats = j.categories && typeof j.categories === 'object' ? j.categories : {};
  let location = clean(cats.location, 300);
  if (!location && Array.isArray(cats.allLocations)) location = clean(cats.allLocations.join('; '), 300);
  if (!location && String(j.workplaceType || '').toLowerCase() === 'remote') location = 'Remote';
  return {
    title: clean(j.text, 300),
    company: humanizeSlug(ats.site), // Lever's posting API has no company-name field
    location,
    description,
    source_url: httpUrlOr(j.hostedUrl, userUrl.href),
    source: 'lever',
  };
}

async function fromAshby(ats, userUrl, ctx) {
  const api = new URL(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ats.org)}`);
  const r = await safeFetch(api, ctx, 'application/json');
  const j = parseJson(r.text);
  const jobs = j && Array.isArray(j.jobs) ? j.jobs : [];
  const job = jobs.find((x) => x && typeof x === 'object' && (
    String(x.id || '').toLowerCase() === ats.id
    || String(x.jobUrl || '').toLowerCase().split(/[?#]/)[0].split('/').includes(ats.id)
  ));
  if (!job || !job.title) return null;
  const description = capDescription(job.descriptionHtml ? richToText(job.descriptionHtml) : String(job.descriptionPlain || '').trim());
  if (!description) return null;
  let location = clean(job.location, 300);
  if (!location && (job.isRemote === true || String(job.workplaceType || '').toLowerCase() === 'remote')) location = 'Remote';
  return {
    title: clean(job.title, 300),
    company: humanizeSlug(ats.org),
    location,
    description,
    source_url: httpUrlOr(job.jobUrl, userUrl.href),
    source: 'ashby',
  };
}

async function fromWorkday(ats, userUrl, ctx) {
  const path = ats.path.map((p) => encodeURIComponent(p)).join('/');
  const api = new URL(`https://${ats.host}/wday/cxs/${encodeURIComponent(ats.tenant)}/${encodeURIComponent(ats.site)}/job/${path}`);
  const r = await safeFetch(api, ctx, 'application/json');
  const j = parseJson(r.text);
  const info = j && typeof j === 'object' && j.jobPostingInfo && typeof j.jobPostingInfo === 'object' ? j.jobPostingInfo : null;
  if (!info || !info.title) return null;
  const description = capDescription(richToText(info.jobDescription));
  if (!description) return null;
  const extra = Array.isArray(info.additionalLocations) ? info.additionalLocations.filter((x) => typeof x === 'string') : [];
  let location = clean([info.location].concat(extra).filter(Boolean).join('; '), 300);
  if (!location && /remote/i.test(String(info.remoteType || ''))) location = 'Remote';
  const org = j.hiringOrganization && typeof j.hiringOrganization === 'object' ? j.hiringOrganization.name : '';
  return {
    title: clean(info.title, 300),
    company: clean(org, 200) || humanizeSlug(ats.tenant),
    location,
    description,
    source_url: httpUrlOr(info.externalUrl, userUrl.href),
    source: 'workday',
  };
}

async function fromSmartRecruiters(ats, userUrl, ctx) {
  const api = new URL(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(ats.company)}/postings/${encodeURIComponent(ats.id)}`);
  const r = await safeFetch(api, ctx, 'application/json');
  const j = parseJson(r.text);
  if (!j || typeof j !== 'object' || !j.name) return null;
  const sec = j.jobAd && j.jobAd.sections && typeof j.jobAd.sections === 'object' ? j.jobAd.sections : {};
  const html = ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']
    .map((k) => sec[k] && typeof sec[k] === 'object' ? `<h3>${escapeHtml(sec[k].title || '')}</h3>${String(sec[k].text || '')}` : '')
    .join('\n');
  const description = capDescription(htmlToText(html));
  if (!description) return null;
  const loc = j.location && typeof j.location === 'object' ? j.location : {};
  let location = clean([loc.city, loc.region, loc.country].filter(Boolean).join(', '), 300);
  if (loc.remote === true) location = location ? location + ' (remote)' : 'Remote';
  return {
    title: clean(j.name, 300),
    company: clean(j.company && j.company.name, 200) || humanizeSlug(ats.company),
    location,
    description,
    source_url: httpUrlOr(j.postingUrl, userUrl.href),
    source: 'smartrecruiters',
  };
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Generic page: JSON-LD, then readable text
// ---------------------------------------------------------------------------

function isJobPostingType(t) {
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => typeof x === 'string' && /(^|[/:])JobPosting$/i.test(x.trim()));
}

/** Depth-first search for a JobPosting node in parsed JSON-LD. */
function findJobPosting(node, depth) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const f = findJobPosting(n, depth + 1); if (f) return f; }
    return null;
  }
  if (isJobPostingType(node['@type'])) return node;
  if (node['@graph']) { const f = findJobPosting(node['@graph'], depth + 1); if (f) return f; }
  if (node.mainEntity) { const f = findJobPosting(node.mainEntity, depth + 1); if (f) return f; }
  return null;
}

function extractJsonLd(html) {
  const re = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html))) {
    let raw = m[1].trim().replace(/^<!--/, '').replace(/-->$/, '')
      .replace(/^\/\/\s*<!\[CDATA\[/, '').replace(/\/\/\s*\]\]>$/, '').trim();
    let data = parseJson(raw);
    // Some sites leave raw control characters inside strings.
    if (!data) data = parseJson(raw.replace(/[\u0000-\u001f]+/g, ' '));
    const job = findJobPosting(data, 0);
    if (job) return job;
  }
  return null;
}

function textOf(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return textOf(v[0]);
  if (typeof v === 'object') return textOf(v.name || v['@value'] || '');
  return '';
}

function jsonLdLocation(job) {
  const types = (Array.isArray(job.jobLocationType) ? job.jobLocationType : [job.jobLocationType])
    .map((t) => String(t || '').toUpperCase());
  if (types.includes('TELECOMMUTE')) return 'Remote';
  const locs = Array.isArray(job.jobLocation) ? job.jobLocation : (job.jobLocation ? [job.jobLocation] : []);
  const out = [];
  for (const loc of locs) {
    if (!loc) continue;
    if (typeof loc === 'string') { out.push(loc); continue; }
    const addr = loc.address || loc;
    if (typeof addr === 'string') { out.push(addr); continue; }
    const bits = [textOf(addr.addressLocality), textOf(addr.addressRegion), textOf(addr.addressCountry)]
      .map((b) => clean(b, 100)).filter(Boolean);
    const uniq = bits.filter((b, i) => bits.indexOf(b) === i);
    if (uniq.length) out.push(uniq.join(', '));
    else if (loc.name) out.push(textOf(loc.name));
  }
  const uniqLocs = out.map((l) => clean(l, 200)).filter((l, i, a) => l && a.indexOf(l) === i);
  return clean(uniqLocs.join('; '), 300);
}

function metaContent(html, prop) {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${prop}["'][^>]*>`, 'i');
  const tag = re.exec(html);
  if (!tag) return '';
  const c = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag[0]);
  return c ? (c[2] !== undefined ? c[2] : c[3]) : '';
}

function pageTitle(html) {
  const og = metaContent(html, 'og:title');
  if (og) return clean(og, 300);
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(stripNonContent(html));
  if (h1 && clean(h1[1], 300)) return clean(h1[1], 300);
  const t = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return t ? clean(t[1], 300) : '';
}

/** Readable main text: prefer <main>/<article>/[role=main], strip chrome. */
function readableText(html) {
  const body = stripNonContent(html);
  const pick = (re) => { const m = re.exec(body); return m ? m[1] : null; };
  let region = pick(/<main\b[^>]*>([\s\S]*)<\/main\s*>/i)
    || pick(/<[a-z0-9]+\b[^>]*\brole\s*=\s*["']main["'][^>]*>([\s\S]*)$/i);
  if (!region) {
    const arts = [];
    const re = /<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi;
    let m;
    while ((m = re.exec(body))) arts.push(m[1]);
    if (arts.length) region = arts.sort((a, b) => b.length - a.length)[0];
  }
  if (!region) region = pick(/<body\b[^>]*>([\s\S]*)<\/body\s*>/i) || body;
  region = region.replace(/<(nav|header|footer|aside|form|button|select|dialog)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  return htmlToText(region);
}

const POSTING_KEYWORDS = [
  /responsibilit/i, /requirements?\b/i, /qualifications?\b/i, /\bexperience\b/i,
  /what you('|’)ll do/i, /about the (role|job|position)/i, /\byou will\b/i, /\bskills\b/i,
  /\bbenefits\b/i, /\bnice to have\b/i,
];

function looksLikePosting(text) {
  if (!text || text.length < 400) return false;
  const hits = POSTING_KEYWORDS.filter((re) => re.test(text)).length;
  return hits >= 2;
}

function fromHtmlPage(html, finalUrl) {
  const job = extractJsonLd(html);
  let ld = null;
  if (job) {
    ld = {
      title: clean(textOf(job.title) || textOf(job.name), 300),
      company: clean(typeof job.hiringOrganization === 'string' ? job.hiringOrganization : textOf(job.hiringOrganization), 200),
      location: jsonLdLocation(job),
      description: capDescription(richToText(textOf(job.description))),
    };
    if (ld.description.length >= 100 && (ld.title || ld.company)) {
      return Object.assign(ld, { source_url: httpUrlOr(textOf(job.url), finalUrl.href), source: 'jsonld' });
    }
  }
  const text = readableText(html);
  if (!looksLikePosting(text)) return null;
  return {
    title: (ld && ld.title) || pageTitle(html),
    company: (ld && ld.company) || clean(metaContent(html, 'og:site_name'), 200),
    location: (ld && ld.location) || '',
    description: capDescription(text),
    source_url: finalUrl.href,
    source: 'html',
  };
}

async function fromGenericPage(userUrl, ctx) {
  const r = await safeFetch(userUrl, ctx);
  if (r.mediaType !== 'text/html') {
    // A bare JSON-LD document is acceptable; other JSON is not a page we understand.
    const job = r.mediaType === 'application/ld+json' ? findJobPosting(parseJson(r.text), 0) : null;
    if (!job) return null;
    const html = `<script type="application/ld+json">${JSON.stringify(job)}</script>`;
    return fromHtmlPage(html, r.url);
  }
  return fromHtmlPage(r.text, r.url);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Import a job posting. Never throws: returns { status, body } where body is
 * the JSON payload for the response.
 * @param {string} rawUrl
 * @param {{timeoutMs?:number}} [opts]
 */
async function importJobUrl(rawUrl, opts) {
  const timeoutMs = (opts && opts.timeoutMs) || TOTAL_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new ImportError(504, MSG.timeout));
    }, timeoutMs);
  });
  deadline.catch(() => {});
  const ctx = {
    signal: controller.signal,
    timedOut: () => timedOut,
    race: (p) => Promise.race([p, deadline]),
  };
  let host = '';
  try {
    const u = parseUserUrl(rawUrl);
    host = normHost(u.hostname);
    const site = blockedSite(host);
    if (site) {
      throw blocked(`${site} doesn't allow job imports. Open the posting on ${site}, copy the job description, and paste it here instead.`);
    }
    // Validate the user's own host up front so a private target yields 400
    // even for ATS-shaped paths.
    checkUrlShape(u, 400);
    await assertPublicHost(u, 400, ctx.race);

    let result = null;
    const ats = detectAts(u);
    if (ats) {
      try {
        if (ats.kind === 'greenhouse') result = await fromGreenhouse(ats, u, ctx);
        else if (ats.kind === 'lever') result = await fromLever(ats, u, ctx);
        else if (ats.kind === 'ashby') result = await fromAshby(ats, u, ctx);
        else if (ats.kind === 'workday') result = await fromWorkday(ats, u, ctx);
        else if (ats.kind === 'smartrecruiters') result = await fromSmartRecruiters(ats, u, ctx);
      } catch (e) {
        // Timeouts are final; other ATS API failures fall back to the page.
        if (e instanceof ImportError && e.status === 504) throw e;
        result = null;
      }
    }
    if (!result) result = await fromGenericPage(u, ctx);
    if (!result || !result.description) throw blocked(MSG.notFound);
    return { status: 200, body: Object.assign({ ok: true }, result) };
  } catch (e) {
    if (e instanceof ImportError) {
      if (e.status >= 500) console.warn(`[import_job_url] ${e.status} host=${host || '-'}`);
      return { status: e.status, body: Object.assign({ error: e.message }, e.extra) };
    }
    console.error(`[import_job_url] unexpected failure host=${host || '-'}:`, e && e.name);
    return { status: 422, body: { error: MSG.notFound, blocked: true } };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  importJobUrl,
  USER_AGENT, MAX_BODY_BYTES, DESCRIPTION_MAX, TOTAL_TIMEOUT_MS,
  _internal: {
    parseUserUrl, isBlockedAddress, htmlToText, richToText, decodeEntities,
    extractJsonLd, detectAts, readableText, looksLikePosting, blockedSite,
  },
};
