const test = require('node:test');
const assert = require('node:assert');
const P = require('../providers.js');

const ids = (list) => list.map((id) => ({ id }));

test('fast-tier match uses whole name parts ("gemini" is not "mini")', () => {
  for (const id of ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gpt-6-sol-mini', 'claude-haiku-5-5', 'gpt-5-nano', 'deepseek-flash']) assert.ok(P.FAST.test(id), id);
  for (const id of ['gemini-4-argon', 'google/gemini-4-carbon', 'claude-opus-5-5', 'gpt-6-sol', 'deepseek-v4-pro']) assert.ok(!P.FAST.test(id), id);
});

test('unstable match: preview / exp / latest / :free', () => {
  for (const id of ['gemini-3-flash-preview', 'gemini-2.0-flash-exp', 'gemini-flash-latest', 'x/y:free']) assert.ok(P.UNSTABLE.test(id), id);
  for (const id of ['gemini-3.8-flash', 'claude-haiku-5-5', 'openai/gpt-6-sol-mini']) assert.ok(!P.UNSTABLE.test(id), id);
});

test('default pick: newest stable fast model, no fixed id', () => {
  assert.strictEqual(P.pickDefault(ids(['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-4-argon', 'gemini-3-flash-preview'])).id, 'gemini-3.8-flash');
  assert.strictEqual(P.pickDefault([
    { id: 'claude-opus-5-5', created: 2 }, { id: 'claude-haiku-5-5', created: 3 }, { id: 'claude-haiku-4-5', created: 1 },
  ]).id, 'claude-haiku-5-5');
  assert.strictEqual(P.pickDefault(ids(['deepseek-v4-pro'])).id, 'deepseek-v4-pro'); // no fast model -> newest stable
  assert.strictEqual(P.pickDefault([]), null);
});

test('every provider has a models endpoint and a reader', () => {
  assert.deepStrictEqual(P.list.map((p) => p.id), ['gemini', 'claude', 'openai', 'deepseek', 'openrouter']);
  for (const p of P.list) {
    assert.strictEqual(typeof p.listModels, 'function', p.id);
    assert.strictEqual(typeof p.read, 'function', p.id);
    assert.ok(/^https:\/\//.test(p.keyUrl), p.id);
  }
});

// Live: OpenRouter's public model list (no key). Skipped offline.
test('OpenRouter live list: vision models only, sensible default', async (t) => {
  let models;
  try { models = await P.get('openrouter').listModels(''); } catch (e) { t.skip('offline: ' + e.message); return; }
  assert.ok(models.length > 20, 'got ' + models.length);
  assert.ok(models.every((m) => !/:batch$/.test(m.id)));
  const pick = P.pickDefault(models);
  assert.ok(P.FAST.test(pick.id) && !P.UNSTABLE.test(pick.id), 'default ' + pick.id);
  console.log('# openrouter models:', models.length, 'default:', pick.id);
});
