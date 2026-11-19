'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildDraftMessages, parseDraft } = require('../_lib/storyDraft');

test('prompt carries the notes and the job only as emphasis', () => {
  const m = buildDraftMessages('Moved nightly ETL to dbt incremental models', { title: 'Data Engineer', skills: ['dbt', 'Snowflake'] });
  assert.strictEqual(m[0].role, 'system');
  assert.match(m[0].content, /Never invent numbers/);
  assert.match(m[1].content, /NOTES:\nMoved nightly ETL/);
  assert.match(m[1].content, /never as facts/);
  assert.match(m[1].content, /Skills: dbt, Snowflake/);
});

test('parseDraft keeps the known fields and allowed tags only', () => {
  const d = parseDraft(JSON.stringify({ title: 'Cut the load to 40m', situation: 'S', task: 'T', action: 'A', result: 'R [how long before?]', metrics: '', tags: ['Technical', 'nonsense', 'delivery'], extra: 'x' }));
  assert.deepStrictEqual(d, { title: 'Cut the load to 40m', situation: 'S', task: 'T', action: 'A', result: 'R [how long before?]', metrics: '', tags: ['technical', 'delivery'] });
});

test('parseDraft refuses empty or broken output', () => {
  assert.strictEqual(parseDraft('not json'), null);
  assert.strictEqual(parseDraft('{}'), null);
  assert.ok(parseDraft('```json\n{"situation":"S"}\n```'));
});

const { buildBatchMessages, parseBatch } = require('../_lib/storyDraft');

test('a title alone is enough for a single draft', () => {
  assert.ok(parseDraft('{"title":"Moved ETL to dbt"}'));
});

test('batch prompt lists only known competencies and the resume', () => {
  const m = buildBatchMessages('Led a team of 4. Cut cost by 30%.', ['leadership', 'nonsense', 'failure'], { title: 'Lead Data Engineer' });
  assert.match(m[1].content, /COMPETENCIES NEEDED: leadership, failure/);
  assert.match(m[1].content, /RESUME:\nLed a team of 4/);
  assert.match(m[0].content, /Never invent numbers/);
});

test('parseBatch keeps valid stories, at most 4', () => {
  const one = { title: 'T', situation: 'S', action: 'A', result: 'R', tags: ['leadership'] };
  const out = parseBatch(JSON.stringify({ stories: [one, {}, one, one, one, one] }));
  assert.strictEqual(out.length, 4);
  assert.deepStrictEqual(out[0].tags, ['leadership']);
  assert.strictEqual(parseBatch('{"stories":[]}'), null);
  assert.strictEqual(parseBatch('x'), null);
});

// ---- number fact check -------------------------------------------------------
{
  const { test: t2 } = require('node:test');
  const assert2 = require('node:assert');
  const { checkNumbers } = require('../_lib/storyDraft');
  const RESUME = 'Data engineer, 2019-2024. Cut the nightly load from 6h to 40m for 12 teams; saved $120,000 a year; 99.9% uptime.';

  t2('numbers the resume gives stay as they are', () => {
    const d = { title: 'Cut the load from 6h to 40m', situation: '', task: '', action: 'Moved 12 teams to dbt.', result: 'Saved $120,000 a year at 99.9% uptime.', metrics: '' };
    const r = checkNumbers(d, RESUME);
    assert2.strictEqual(r.replaced, 0);
    assert2.deepStrictEqual(r.draft, d);
  });

  t2('a number the resume does not give becomes [number?]', () => {
    const d = { title: 'Led a team', situation: 'In 2021 I led 5 engineers.', task: '', action: '', result: 'Revenue grew 30% and cost $2,500 less.', metrics: '' };
    const r = checkNumbers(d, RESUME);
    assert2.strictEqual(r.replaced, 4);
    assert2.strictEqual(r.draft.situation, 'In [number?] I led [number?] engineers.');
    assert2.strictEqual(r.draft.result, 'Revenue grew [number?]% and cost [number?] less.');
  });

  t2('bracketed questions, version names and words with digits are left alone', () => {
    const d = { title: '', situation: 'Moved S3 data to Python3 [how many tables?]', task: '', action: 'Ran the Q3 audit.', result: '', metrics: '' };
    const r = checkNumbers(d, RESUME);
    assert2.strictEqual(r.replaced, 0);
    assert2.strictEqual(r.draft.situation, d.situation);
  });

  t2('numbers with a unit are checked too', () => {
    const d = { title: 'From 6h to 40m', situation: '', task: '', action: '', result: 'Made it 10x faster for 5k users.', metrics: '' };
    const r = checkNumbers(d, RESUME);
    assert2.strictEqual(r.draft.title, 'From 6h to 40m');
    assert2.strictEqual(r.draft.result, 'Made it [number?] faster for [number?] users.');
  });

  t2('tags and other fields pass through', () => {
    const d = { title: 'x', situation: '', task: '', action: '', result: '', metrics: '', tags: ['delivery'] };
    assert2.deepStrictEqual(checkNumbers(d, '').draft.tags, ['delivery']);
  });
}
