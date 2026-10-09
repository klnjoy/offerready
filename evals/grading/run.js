#!/usr/bin/env node
/**
 * Grading eval: runs every case in cases.json through the SAME prompt and
 * validation as /api/premium/grade-answer, against the real model, and checks
 * the score lands in the expected band.
 *
 *   OPENAI_API_KEY=… node evals/grading/run.js            # all cases
 *   OPENAI_API_KEY=… node evals/grading/run.js sd- rag-   # cases whose id starts with these
 *   OPENAI_MODEL=gpt-4o node evals/grading/run.js         # compare models
 *
 * Exit code 1 when the pass rate is below EVAL_MIN_PASS (default 0.85) or a
 * guardrail case (injection / off_topic / unsafe / very_short) passes its cap.
 * Writes evals/grading/last-report.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { SYSTEM_PROMPT, buildUserMessage, validateGrade } = require('../../api/_lib/gradeAnswer');
const { RUBRIC_VERSION } = require('../../api/_lib/rubrics');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MIN_PASS = Number(process.env.EVAL_MIN_PASS || 0.85);
const GUARD_TAGS = ['injection', 'off_topic', 'unsafe', 'very_short'];

async function grade(c) {
  const ctx = { prompt: c.question, topic: c.topic, answer: c.answer, signals: [], model: '' };
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({
      model: MODEL, temperature: 0.2, max_tokens: 1200, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserMessage(ctx) }],
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status);
  const data = await resp.json();
  let parsed = null;
  try { parsed = JSON.parse(data.choices[0].message.content); } catch (_) { /* invalid */ }
  return validateGrade(parsed, ctx);
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY not set: skipping the live grading eval.');
    return;
  }
  const { cases } = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
  const prefixes = process.argv.slice(2);
  const pick = prefixes.length ? cases.filter((c) => prefixes.some((p) => c.id.startsWith(p))) : cases;
  const rows = [];
  for (const c of pick) {
    let row;
    try {
      const r = await grade(c);
      if (!r.ok) row = { id: c.id, ok: false, error: r.reason };
      else {
        const s = r.feedback.score;
        row = { id: c.id, ok: s >= c.expect[0] && s <= c.expect[1], score: s, expect: c.expect, level: r.feedback.level, rubric: r.feedback.rubric.id, caps: r.feedback.caps, downgraded: r.feedback.downgraded };
      }
    } catch (e) {
      row = { id: c.id, ok: false, error: String(e.message || e) };
    }
    row.tags = c.tags;
    rows.push(row);
    console.log((row.ok ? 'PASS ' : 'FAIL ') + c.id.padEnd(16) + (row.score != null ? String(row.score).padStart(4) + '  expect ' + c.expect.join('-') + '  ' + row.level + (row.caps && row.caps.length ? '  caps:' + row.caps.join(',') : '') + (row.downgraded ? '  downgraded:' + row.downgraded : '') : '  ' + row.error));
  }
  const passed = rows.filter((r) => r.ok).length;
  const rate = rows.length ? passed / rows.length : 0;
  const guardFail = rows.filter((r) => !r.ok && (r.tags || []).some((t) => GUARD_TAGS.includes(t)));
  const scored = rows.filter((r) => r.score != null);
  const mae = scored.length ? scored.reduce((s, r) => s + (r.score < r.expect[0] ? r.expect[0] - r.score : r.score > r.expect[1] ? r.score - r.expect[1] : 0), 0) / scored.length : 0;
  const report = { at: new Date().toISOString(), model: MODEL, rubric_version: RUBRIC_VERSION, cases: rows.length, passed, pass_rate: Math.round(rate * 1000) / 1000, mean_distance_outside_band: Math.round(mae * 10) / 10, guard_failures: guardFail.map((r) => r.id), rows };
  fs.writeFileSync(path.join(__dirname, 'last-report.json'), JSON.stringify(report, null, 1));
  console.log(`\n${passed}/${rows.length} in band (${Math.round(rate * 100)}%), mean distance outside band ${report.mean_distance_outside_band}, model ${MODEL}, rubrics ${RUBRIC_VERSION}`);
  if (rate < MIN_PASS || guardFail.length) {
    console.log(guardFail.length ? 'Guardrail cases failed: ' + guardFail.map((r) => r.id).join(', ') : 'Pass rate below ' + MIN_PASS);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
