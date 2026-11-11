'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const P = require('../providers.js');

function hangingServer() {
  const s = http.createServer(() => { /* never answers */ });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

test('getJson gives up after timeoutMs instead of waiting forever', async () => {
  const s = await hangingServer();
  const t0 = Date.now();
  await assert.rejects(P.getJson('http://127.0.0.1:' + s.address().port + '/', { timeoutMs: 300 }), (e) => e.status === 'timeout');
  assert.ok(Date.now() - t0 < 2000);
  s.closeAllConnections(); s.close();
});

test('getJson stops at once when the caller cancels', async () => {
  const s = await hangingServer();
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 100);
  await assert.rejects(P.getJson('http://127.0.0.1:' + s.address().port + '/', { signal: ctl.signal, timeoutMs: 10000 }), (e) => e.status === 'cancelled');
  s.closeAllConnections(); s.close();
});

test('Gemini 3+ models are asked for low thinking, older ones are left alone', () => {
  const g = P.get('gemini');
  assert.deepStrictEqual(g.thinkingConfig('gemini-3.6-flash'), { thinkingLevel: 'low' });
  assert.deepStrictEqual(g.thinkingConfig('gemini-4-pro'), { thinkingLevel: 'low' });
  assert.strictEqual(g.thinkingConfig('gemini-2.5-flash'), null);
});
