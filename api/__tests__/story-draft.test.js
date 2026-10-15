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
