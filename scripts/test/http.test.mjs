// HTTP client: retries, Retry-After and JSON:API pagination (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttp, retryAfterSeconds } from '../lib/http.mjs';

const NOW = Date.parse('2026-10-01T12:00:00Z');
function client(responses, opts = {}) {
  const sleeps = [], calls = [];
  const queue = [...responses];
  const http = createHttp({
    fetchImpl: async (url) => { calls.push(url); const r = queue.shift(); return typeof r === 'function' ? r(url) : r; },
    sleep: async (ms) => { sleeps.push(ms); },
    now: () => NOW,
    ...opts,
  });
  return { http, sleeps, calls };
}
const ok = (body = { data: [] }) => Response.json(body);
const status = (code, headers = {}) => new Response('x', { status: code, headers });

test('Retry-After: seconds, HTTP date, missing, invalid', () => {
  assert.equal(retryAfterSeconds('7', NOW), 7);
  assert.equal(retryAfterSeconds(' 0 ', NOW), 0);
  assert.equal(retryAfterSeconds('Thu, 01 Oct 2026 12:00:30 GMT', NOW), 30);
  assert.equal(retryAfterSeconds('Thu, 01 Oct 2026 11:00:00 GMT', NOW), 0, 'a date in the past means now');
  assert.equal(retryAfterSeconds(null, NOW), null);
  assert.equal(retryAfterSeconds('soon', NOW), null);
});

test('429 without Retry-After backs off instead of hammering', async () => {
  const { http, sleeps } = client([status(429), status(429), ok()]);
  await http.json('https://api.example/x');
  assert.deepEqual(sleeps, [2000, 4000]);
});

test('429 and 503 honour Retry-After (seconds or date), capped at 60 s', async () => {
  const { http, sleeps } = client([status(429, { 'retry-after': '120' }), status(503, { 'retry-after': 'Thu, 01 Oct 2026 12:00:05 GMT' }), status(429, { 'retry-after': '0' }), ok()]);
  await http.json('https://api.example/x');
  assert.deepEqual(sleeps, [60_000, 5000, 1000]);
});

test('other 5xx back off exponentially and give up after 4 attempts', async () => {
  const { http, sleeps, calls } = client([status(500), status(502), status(500), status(500)]);
  await assert.rejects(http.json('https://api.example/x'), /HTTP 500 after 4 attempts/);
  assert.equal(calls.length, 4);
  assert.deepEqual(sleeps, [2000, 4000, 8000]);
});

test('pagination follows links.next and collects included resources', async () => {
  const { http, calls } = client([
    ok({ data: [{ id: '1', type: 'Signup' }], included: [{ id: 'a', type: 'Category' }], links: { next: 'https://api.example/x?offset=1' } }),
    ok({ data: [{ id: '2', type: 'Signup' }], included: [{ id: 'b', type: 'Category' }], links: {} }),
  ]);
  const { data, included } = await http.listAll('https://api.example/x');
  assert.deepEqual(data.map((d) => d.id), ['1', '2']);
  assert.deepEqual([...included.keys()], ['Category:a', 'Category:b']);
  assert.equal(calls[1], 'https://api.example/x?offset=1');
});

test('pagination refuses another host and stops at maxPages', async () => {
  const cross = client([ok({ data: [], links: { next: 'https://evil.example/x' } })]);
  await assert.rejects(cross.http.listAll('https://api.example/x'), /cross-host/);
  const loop = client(Array.from({ length: 5 }, () => ok({ data: [], links: { next: 'https://api.example/x?again' } })));
  await assert.rejects(loop.http.listAll('https://api.example/x', {}, { maxPages: 3 }), /Gave up after 3 pages/);
  const bad = client([ok({ errors: [] })]);
  await assert.rejects(bad.http.listAll('https://api.example/x'), /Unexpected response shape/);
});
