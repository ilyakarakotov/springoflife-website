// The public events feed (src/lib/feed.mjs -> /feed/events.json) and the SnapPages widget
// (public/embed/sol-events.js). The widget's behaviour in a browser is checked with headless Chrome
// (see docs/SNAPPAGES-EVENTS-EMBED.md "Testing"); here: the schema, privacy and the size budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildEventsFeed, FEED_VERSION } from '../../src/lib/feed.mjs';
import { eventPath } from '../../src/lib/events.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = new Date('2026-10-01T19:00:00Z');

const event = (over = {}) => ({
  id: '3894463', title: 'Intentional Parenting', summary: 'Parenting is a gift.',
  description_html: '<p>Long text with <a href="https://x.example">links</a></p>',
  starts_at: '2026-10-04T01:00:00Z', ends_at: '2026-10-04T04:00:00Z', all_day: false, more_times: [],
  location: { name: 'Spring of Life Church', address: '4711 116th St SW, Mukilteo, WA 98275', city: 'Mukilteo', postal: null, type: 'address' },
  price: { free: true, min_cents: 0, max_cents: 0, label: 'Free' },
  image: 'signup-3894463-a014ac68ca5a.jpg',
  register_url: 'https://springoflifechurch.churchcenter.com/registrations/events/3894463/reservations/new',
  details_url: 'https://springoflifechurch.churchcenter.com/registrations/events/3894463',
  registration: { open: true, full: false, opens_at: null, closes_at: null },
  updated_at: '2026-09-20T17:22:01Z', source: 'pco',
  ...over,
});
const feedOf = (events, preview = false) => buildEventsFeed(events, {
  now: NOW, preview,
  site: { name: 'Spring of Life Church', url: 'https://example.org/', events_url: 'https://example.org/events/', signups_url: 'https://springoflifechurch.churchcenter.com/registrations' },
  pageUrl: (e) => `https://example.org${eventPath(e)}`,
  imageFor: (e) => (e.image ? { url: `https://example.org/_astro/${e.image}`, width: 720, height: 405 } : null),
});

test('feed: version 1 schema, labels in church time, absolute URLs', () => {
  const feed = feedOf([event()]);
  assert.equal(feed.version, FEED_VERSION);
  assert.equal(feed.version, 1);
  assert.equal(feed.timezone, 'America/Los_Angeles');
  assert.match(feed.generated_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.deepEqual(feed.events[0], {
    id: '3894463', title: 'Intentional Parenting', summary: 'Parenting is a gift.',
    starts_at: '2026-10-04T01:00:00Z', ends_at: '2026-10-04T04:00:00Z', all_day: false, timezone: 'America/Los_Angeles',
    live_until: '2026-10-04T04:00:00Z', date_label: 'Sat, Oct 3', time_label: '6:00–9:00 pm', badge: { month: 'OCT', day: '3', weekday: 'SAT' },
    more_dates: 0, location_name: 'Spring of Life Church', city: 'Mukilteo', price_label: 'Free', free: true,
    image_url: 'https://example.org/_astro/signup-3894463-a014ac68ca5a.jpg', image_width: 720, image_height: 405,
    register_url: 'https://springoflifechurch.churchcenter.com/registrations/events/3894463/reservations/new',
    details_url: 'https://example.org/events/intentional-parenting-3894463/',
    church_center_url: 'https://springoflifechurch.churchcenter.com/registrations/events/3894463',
    full: false, registration: 'open', status_label: null,
  });
});

test('feed: no internal or private data (description HTML, street address, PCO internals)', () => {
  const text = JSON.stringify(feedOf([event()]));
  for (const leak of ['description_html', '4711 116th', 'updated_at', '"source"', 'links</a>']) assert.ok(!text.includes(leak), leak);
});

test('feed: full or not-yet-open events have no register_url, and say why', () => {
  const full = feedOf([event({ registration: { open: true, full: true, opens_at: null, closes_at: null } })]).events[0];
  assert.equal(full.register_url, null);
  assert.equal(full.full, true);
  assert.equal(full.status_label, 'Full');
  const soon = feedOf([event({ registration: { open: false, full: false, opens_at: '2026-10-10T16:00:00Z', closes_at: null } })]).events[0];
  assert.equal(soon.register_url, null);
  assert.equal(soon.registration, 'opens_soon');
  assert.equal(soon.status_label, 'Registration opens Sat, Oct 10');
  const info = feedOf([event({ register_url: null, price: null })]).events[0];
  assert.equal(info.registration, 'none');
  assert.equal(info.price_label, null);
  assert.equal(info.free, null);
});

test('feed: a multi-date event stays live until its last date; all-day labels', () => {
  const multi = feedOf([event({ more_times: [{ starts_at: '2026-10-11T01:00:00Z', ends_at: '2026-10-11T04:00:00Z', all_day: false }] })]).events[0];
  assert.equal(multi.more_dates, 1);
  assert.equal(multi.live_until, '2026-10-11T04:00:00Z');
  const allDay = feedOf([event({ starts_at: '2026-10-17T07:00:00Z', ends_at: '2026-10-18T07:00:00Z', all_day: true })]).events[0];
  assert.equal(allDay.time_label, 'All day');
  assert.equal(allDay.date_label, 'Sat, Oct 17');
  assert.equal(allDay.live_until, '2026-10-18T07:00:00Z', 'midnight after the last day');
});

test('feed: preview builds say so (the widget then links to Church Center, not the unlisted preview site)', () => {
  assert.equal(feedOf([], true).preview, true);
  assert.equal(feedOf([]).preview, false);
  assert.deepEqual(feedOf([]).events, []);
});

test('widget: under 6 KB minified, valid JavaScript, no dependencies, never writes outside its shadow root', async () => {
  const src = readFileSync(join(repo, 'public/embed/sol-events.js'), 'utf8');
  const { transform } = await import('esbuild');
  const { code } = await transform(src, { minify: true, target: 'es2017', legalComments: 'inline' });
  assert.ok(code.length < 6 * 1024, `minified size ${code.length} bytes`);
  assert.ok(gzipSync(code).length < 3 * 1024, `gzip size ${gzipSync(code).length} bytes`);
  assert.doesNotMatch(src, /\bimport\b|\brequire\(|document\.write|\beval\(|new Function/);
  assert.match(src, /attachShadow\(/);
  assert.doesNotMatch(src.replace(/root\.innerHTML/g, ''), /\.innerHTML\s*=/, 'only the shadow root is written');
  assert.match(src, /TIMEOUT_MS = 5000/);
  assert.match(src, /feed\.version !== FEED_VERSION/, 'refuses unknown feed versions');
});
