/**
 * seed_scenarios.js — load authored scenario JSON into Supabase premium_content.
 * ---------------------------------------------------------------------------
 * Run SERVER-SIDE only, with the service-role key (bypasses RLS). Reads every
 * *.json in supabase/premium/scenarios/ and upserts a premium_content row:
 *   - teaser  = the public-safe teaser object
 *   - content = the full { start, nodes } tree (PROTECTED)
 *
 * The full node tree lives ONLY in Supabase after this runs — it is never part
 * of the public static site (spec §21).
 *
 * Usage (locally, with your own env — NEVER commit the key):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/premium/seed_scenarios.js
 *
 * No external deps (global fetch on Node 18+).
 */

'use strict';

const fs = require('fs');
const path = require('path');

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment first.');
    process.exit(1);
  }

  const dir = path.join(__dirname, 'scenarios');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (!files.length) { console.log('No scenario JSON files found.'); return; }

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const row = {
      slug: raw.slug,
      title: raw.title,
      category: raw.category || null,
      required_entitlement: raw.required_entitlement,
      teaser: raw.teaser || {},
      content: { start: raw.start, nodes: raw.nodes },  // PROTECTED body
      published: true,
    };

    const resp = await fetch(url.replace(/\/+$/, '') + '/rest/v1/premium_content?on_conflict=slug', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (resp.ok) console.log(`upserted: ${row.slug}`);
    else console.error(`FAILED ${row.slug}: ${resp.status} ${await resp.text()}`);
  }
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
