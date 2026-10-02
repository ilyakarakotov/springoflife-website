import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHtml, summarize } from '../lib/html.mjs';
import { normalizePrice, formatAddress, fixChurchName } from '../lib/normalize.mjs';
import { buildIcs } from '../lib/ics.mjs';
import { formatRange, isoWithOffset } from '../../src/lib/time.mjs';

test('cleanHtml keeps structure, drops anything unsafe', () => {
  const { html } = cleanHtml('<div><p>Hi <script>alert(1)</script><b>there</b></p><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a> <a href="https://ok.example" onclick="x">good</a></div>');
  assert.equal(html, '<p>Hi <strong>there</strong></p>\n<p>bad <a href="https://ok.example" rel="noopener nofollow">good</a></p>');
});

test('cleanHtml turns PCO <div> lines and <br><br> into paragraphs', () => {
  const { html, blocks } = cleanHtml('<div>Meeting Day - Friday<br>Meeting City - Everett<br><br>About us.</div>');
  assert.equal(html, '<p>Meeting Day - Friday<br>Meeting City - Everett</p>\n<p>About us.</p>');
  assert.equal(summarize(blocks), 'Meeting Day - Friday · Meeting City - Everett · About us.');
});

test('contact details are redacted', () => {
  const { text } = cleanHtml('<p>Call (425) 555-0142 or 425.555.0100, email a.b@example.org</p>');
  assert.ok(!/\d{3}.\d{4}|@/.test(text), text);
});

test('summary is cut on a word boundary', () => {
  const s = summarize(cleanHtml(`<p>${'word '.repeat(80)}</p>`).blocks, 50);
  assert.ok(s.length <= 50 && s.endsWith('…'), s);
});

test('prices from cents and from Church Center labels', () => {
  assert.deepEqual(normalizePrice({ cents: [0, 0] }), { free: true, min_cents: 0, max_cents: 0, label: 'Free' });
  assert.equal(normalizePrice({ cents: [35000, 45000] }).label, '$350 – $450');
  assert.equal(normalizePrice({ label: '$65' }).min_cents, 6500);
  assert.equal(normalizePrice({ label: 'Free' }).free, true);
  assert.equal(normalizePrice({ label: '$1,620.50' }).label, '$1,620.50');
  assert.equal(normalizePrice({}), null);
});

test('address and church name clean-up', () => {
  assert.equal(formatAddress('4711 116th St SW\n Mukilteo, WA 98275'), '4711 116th St SW, Mukilteo, WA 98275');
  assert.equal(fixChurchName('Spring Of Life Church'), 'Spring of Life Church');
  assert.equal(fixChurchName('SPRING OF LIFE BAPTIST CHURCH'), 'Spring of Life Church');
});

test('times render in church time', () => {
  assert.equal(formatRange({ starts_at: '2026-10-04T01:00:00Z', ends_at: '2026-10-04T04:00:00Z', all_day: false }), 'Sat, Oct 3 · 6:00–9:00 pm');
  assert.equal(formatRange({ starts_at: '2026-10-30T01:00:00Z', ends_at: '2026-10-31T19:00:00Z', all_day: false }), 'Thu, Oct 29, 6:00 pm – Sat, Oct 31, 12:00 pm');
  assert.equal(formatRange({ starts_at: '2026-09-10T02:00:00Z', ends_at: '2027-05-27T03:45:00Z', all_day: true }), 'Wed, Sep 9, 2026 – Wed, May 26, 2027');
  assert.equal(isoWithOffset('2026-10-04T01:00:00Z'), '2026-10-03T18:00:00-07:00');
  assert.equal(isoWithOffset('2026-12-20T02:00:00Z'), '2026-12-19T18:00:00-08:00');
});

test('ICS is deterministic, escaped and folded', () => {
  const ev = {
    id: '1', title: 'Concert, with; commas', summary: 'x'.repeat(200), starts_at: '2026-12-20T02:00:00Z', ends_at: '2026-12-20T04:00:00Z',
    all_day: false, more_times: [], location: { name: 'Spring of Life Church', address: '4711 116th St SW, Mukilteo, WA 98275' },
    price: { label: 'Free' }, details_url: 'https://example.org/e/1', updated_at: '2026-09-01T00:00:00Z',
  };
  const a = buildIcs([ev], { siteUrl: 'https://example.org' });
  assert.equal(a, buildIcs([ev], { siteUrl: 'https://example.org' }));
  assert.match(a, /SUMMARY:Concert\\, with\\; commas\r\n/);
  assert.match(a, /DTSTAMP:20260901T000000Z/);
  assert.ok(a.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'lines folded at 75 octets');
});

import { postalAddress } from '../lib/normalize.mjs';
import { registrationStatus, registrationLabel } from '../../src/lib/events.mjs';

test('postal addresses for schema.org: parsed, from address_data, or null', () => {
  assert.deepEqual(postalAddress('4711 116th St SW, Mukilteo, WA 98275'), { street: '4711 116th St SW', locality: 'Mukilteo', region: 'WA', postal_code: '98275', country: 'US' });
  assert.deepEqual(postalAddress('Camp Casey, 1276 Engle Rd, Coupeville, WA 98239, USA'), { street: 'Camp Casey, 1276 Engle Rd', locality: 'Coupeville', region: 'WA', postal_code: '98239', country: 'US' });
  assert.deepEqual(postalAddress('x', { street: '1 Main St', city: 'Everett', state: 'WA', zip: '98201' }), { street: '1 Main St', locality: 'Everett', region: 'WA', postal_code: '98201', country: 'US' });
  assert.equal(postalAddress('Somewhere in the woods'), null);
  assert.equal(postalAddress(null), null);
});

test('registration state and label', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const ev = (registration, register_url = 'https://cc/r') => ({ register_url, registration: { open: false, full: false, opens_at: null, closes_at: null, ...registration } });
  assert.equal(registrationStatus(ev({ open: true }), now), 'open');
  assert.equal(registrationStatus(ev({ open: true, full: true }), now), 'full');
  assert.equal(registrationStatus(ev({ opens_at: '2026-10-10T16:00:00Z' }), now), 'opens_soon');
  assert.equal(registrationStatus(ev({ opens_at: '2026-09-10T16:00:00Z' }), now), 'closed');
  assert.equal(registrationStatus(ev({ open: true }, null), now), 'none');
  assert.equal(registrationLabel(ev({ opens_at: '2026-10-10T16:00:00Z' }), now), 'Registration opens Sat, Oct 10');
  assert.equal(registrationLabel(ev({ full: true }), now), 'Full');
  assert.equal(registrationLabel(ev({}), now), 'Registration closed');
  assert.equal(registrationLabel(ev({ open: true }), now), null);
});

import { eventSlug, eventPath, eventIdFromPath } from '../../src/lib/events.mjs';

test('event page slugs: readable, unique by ID, stable when a title is edited', () => {
  assert.equal(eventSlug({ id: '3894463', title: 'Intentional Parenting' }), 'intentional-parenting-3894463');
  assert.equal(eventSlug({ id: '1', title: "Men's Breakfast & Prayer" }), 'mens-breakfast-and-prayer-1');
  assert.equal(eventSlug({ id: '2', title: 'Café Night: Q&A!' }), 'cafe-night-q-and-a-2');
  assert.equal(eventSlug({ id: '3', title: 'Молодёжная конференция' }), '3', 'no Latin letters: the ID alone');
  const long = eventSlug({ id: '4', title: 'A very long event title that keeps going well past the sixty character limit for slugs' });
  assert.ok(long.length <= 62 && long.endsWith('-4') && !long.includes('--'), long);
  assert.equal(eventPath({ id: '3894463', title: 'Intentional Parenting' }), '/events/intentional-parenting-3894463/');
  assert.equal(eventIdFromPath('/events/intentional-parenting-3894463/'), '3894463');
  assert.equal(eventIdFromPath('/events/old-title-3894463'), '3894463', 'a renamed event is found by its ID');
  assert.equal(eventIdFromPath('/events/3894463/'), '3894463');
  assert.equal(eventIdFromPath('/events/'), null);
  assert.equal(eventIdFromPath('/events/feed.json'), null);
});
