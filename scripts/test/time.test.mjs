// Church-time edge cases: DST changes, all-day encodings and multi-date events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startOfLocalDay, isoWithOffset, formatRange, formatDateLabel, formatTimeLabel, occurrenceEnd, allDayLastDate } from '../../src/lib/time.mjs';
import { isLive } from '../../src/lib/events.mjs';
import { buildIcs } from '../lib/ics.mjs';
import { buildDigest } from '../lib/digest.mjs';
import { normalizeEvents } from '../lib/normalize.mjs';

const iso = (d) => d.toISOString().replace('.000', '');

test('startOfLocalDay is right on both DST change days', () => {
  assert.equal(iso(startOfLocalDay('2026-11-01T15:00:00Z')), '2026-11-01T07:00:00Z'); // PDT midnight, PST by noon
  assert.equal(iso(startOfLocalDay('2027-03-14T15:00:00Z')), '2027-03-14T08:00:00Z'); // PST midnight, PDT by noon
  assert.equal(iso(startOfLocalDay('2026-10-31T15:00:00Z', 1)), '2026-11-01T07:00:00Z');
  assert.equal(iso(startOfLocalDay('2026-10-31T15:00:00Z', 2)), '2026-11-02T08:00:00Z');
  assert.equal(iso(startOfLocalDay('2027-03-13T20:00:00Z', 1)), '2027-03-14T08:00:00Z');
  assert.equal(iso(startOfLocalDay('2027-03-13T20:00:00Z', 2)), '2027-03-15T07:00:00Z');
  assert.equal(iso(startOfLocalDay('2026-11-01T06:59:00Z')), '2026-10-31T07:00:00Z', 'still Oct 31 locally');
});

test('UTC offsets across the 1:00-2:00 am overlap on Nov 1 2026', () => {
  assert.equal(isoWithOffset('2026-11-01T08:30:00Z'), '2026-11-01T01:30:00-07:00');
  assert.equal(isoWithOffset('2026-11-01T09:30:00Z'), '2026-11-01T01:30:00-08:00');
  assert.equal(formatRange({ starts_at: '2026-11-01T07:30:00Z', ends_at: '2026-11-01T11:00:00Z', all_day: false }), 'Sun, Nov 1 · 12:30–3:00 am');
});

test('the weekly digest on a DST Sunday covers the right week', () => {
  const site = { name: 'Spring of Life Church', service: { time: '12:00 pm' }, address: { street: '4711 116th St SW', city: 'Mukilteo', region: 'WA' }, links: { youtube_live: 'https://y', give: 'https://g' } };
  const ev = (id, starts_at) => ({ id, title: `E${id}`, summary: '', starts_at, ends_at: null, all_day: false, more_times: [], location: null, price: null, register_url: null, details_url: 'https://d', registration: { open: false, full: false, closes_at: null } });
  const digest = buildDigest([ev('1', '2026-11-08T06:30:00Z'), ev('2', '2026-11-08T08:30:00Z')], { now: new Date('2026-11-01T18:00:00Z'), site, siteUrl: 'https://s' });
  assert.match(digest, /_Sunday, November 1 – Saturday, November 7, 2026_/);
  assert.match(digest, /Join us Sunday, November 1 at 12:00 pm/);
  const thisWeek = digest.split('## This week')[1].split('##')[0];
  assert.match(thisWeek, /E1/, 'Sat Nov 7, 10:30 pm PST is still this week');
  assert.doesNotMatch(thisWeek, /E2/, 'Sun Nov 8, 12:30 am PST is next week');
});

// Planning Center keeps the underlying times on all-day signups (AWANA: 7:00-8:45 pm each day).
// An all-day end stored at local midnight would be exclusive. Both must mean the same days.
const CAMP_TIMES = { starts_at: '2026-07-13T16:00:00Z', ends_at: '2026-07-17T23:00:00Z', all_day: true }; // Mon 9 am – Fri 4 pm
const CAMP_MIDNIGHT = { starts_at: '2026-07-13T07:00:00Z', ends_at: '2026-07-18T07:00:00Z', all_day: true }; // Mon 00:00 – Sat 00:00 (exclusive)
const DAY_TIMES = { starts_at: '2026-07-17T16:00:00Z', ends_at: '2026-07-17T23:00:00Z', all_day: true };
const DAY_MIDNIGHT = { starts_at: '2026-07-17T07:00:00Z', ends_at: '2026-07-17T07:00:00Z', all_day: true }; // zero-length at local midnight

test('all-day: last day and end are the same under both encodings', () => {
  assert.equal(allDayLastDate(CAMP_TIMES), '2026-07-17');
  assert.equal(allDayLastDate(CAMP_MIDNIGHT), '2026-07-17');
  assert.equal(allDayLastDate(DAY_MIDNIGHT), '2026-07-17');
  for (const t of [CAMP_TIMES, CAMP_MIDNIGHT, DAY_TIMES, DAY_MIDNIGHT]) assert.equal(iso(occurrenceEnd(t)), '2026-07-18T07:00:00Z');
  assert.equal(formatRange(CAMP_MIDNIGHT), 'Mon, Jul 13 – Fri, Jul 17');
  assert.equal(formatRange(CAMP_TIMES), 'Mon, Jul 13 – Fri, Jul 17');
  assert.equal(formatRange(DAY_MIDNIGHT), 'Fri, Jul 17');
  assert.equal(formatTimeLabel(DAY_MIDNIGHT), 'All day');
  assert.equal(formatDateLabel(CAMP_TIMES), 'Mon, Jul 13 – Fri, Jul 17');
});

test('all-day: still listed at 6 pm on its last day, gone after midnight', () => {
  for (const t of [CAMP_TIMES, CAMP_MIDNIGHT, DAY_TIMES, DAY_MIDNIGHT]) {
    const e = { ...t, more_times: [] };
    assert.equal(isLive(e, new Date('2026-07-18T01:00:00Z')), true, `Fri 6 pm: ${JSON.stringify(t)}`);
    assert.equal(isLive(e, new Date('2026-07-18T07:00:01Z')), false, `Sat 0:00:01: ${JSON.stringify(t)}`);
    const raw = [{ id: '9', title: 'Camp', category_ids: ['111199'], times: [t], details_url: 'https://x', registration: {} }];
    assert.equal(normalizeEvents(raw, { categoryId: '111199', now: new Date('2026-07-18T01:00:00Z'), source: 't' }).length, 1);
  }
});

test('all-day ICS uses VALUE=DATE with an exclusive DTEND (single and multi-day, both encodings)', () => {
  const ev = (t) => ({ id: '7', title: 'Camp', summary: '', more_times: [], location: null, price: null, details_url: 'https://x/e/7', updated_at: '2026-06-01T00:00:00Z', ...t });
  for (const t of [CAMP_TIMES, CAMP_MIDNIGHT]) {
    const ics = buildIcs([ev(t)], { siteUrl: 'https://x' });
    assert.match(ics, /DTSTART;VALUE=DATE:20260713\r\n/);
    assert.match(ics, /DTEND;VALUE=DATE:20260718\r\n/);
  }
  for (const t of [DAY_TIMES, DAY_MIDNIGHT]) {
    const ics = buildIcs([ev(t)], { siteUrl: 'https://x' });
    assert.match(ics, /DTSTART;VALUE=DATE:20260717\r\nDTEND;VALUE=DATE:20260718\r\n/);
  }
});

test('multi-date events: in-progress, duplicates, unsorted input, cap, same start with different ends', () => {
  const t = (s, e) => ({ starts_at: s, ends_at: e });
  const times = [
    t('2026-10-08T02:00:00Z', '2026-10-08T04:00:00Z'),
    t('2026-10-01T02:00:00Z', '2026-10-01T04:00:00Z'), // in progress at 03:00Z
    t('2026-09-24T02:00:00Z', '2026-09-24T04:00:00Z'), // ended
    t('2026-10-01T02:00:00Z', '2026-10-01T03:30:00Z'), // duplicate start (next_signup_time), shorter
  ];
  const later = Array.from({ length: 15 }, (_, i) => t(`2026-11-${String(i + 10).padStart(2, '0')}T02:00:00Z`, `2026-11-${String(i + 10).padStart(2, '0')}T04:00:00Z`));
  const raw = [{ id: '8', title: 'Class', category_ids: ['111199'], times: [...later.reverse(), ...times], details_url: 'https://x', registration: {} }];
  const [e] = normalizeEvents(raw, { categoryId: '111199', now: new Date('2026-10-01T03:00:00Z'), source: 't' });
  assert.equal(e.starts_at, '2026-10-01T02:00:00Z', 'an occurrence in progress is the next one');
  assert.equal(e.ends_at, '2026-10-01T04:00:00Z', 'the longer of two identical starts wins');
  assert.equal(e.more_times[0].starts_at, '2026-10-08T02:00:00Z', 'sorted');
  assert.equal(e.more_times.length, 11, 'at most 12 dates in total');
  assert.ok(e.more_times.every((x, i, a) => i === 0 || a[i - 1].starts_at < x.starts_at), 'ascending');
  assert.equal(isLive({ ...e, starts_at: '2026-09-01T02:00:00Z', ends_at: '2026-09-01T04:00:00Z' }, new Date('2026-10-01T05:00:00Z')), true, 'a later date keeps the event live');
});
