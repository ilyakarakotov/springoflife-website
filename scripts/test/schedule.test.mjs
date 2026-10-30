// The weekly schedule (src/lib/schedule.mjs): reading the `weekly` lines, building the week from the
// real content files, and placing items on the week grid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { parseTimes, parseWeekly, durationMinutes, clock, timeSpan, hourLabel, buildWeek, gridHours, gridPlaces } from '../../src/lib/schedule.mjs';
import { keepTimesDeep } from '../../src/lib/text.mjs';

const content = (name) => keepTimesDeep(parse(readFileSync(new URL(`../../src/content/${name}`, import.meta.url), 'utf8')));
const NB = ' ';

test('times and ranges in minutes after midnight', () => {
  assert.deepEqual(parseTimes('7:00–8:45 pm'), { start: 1140, end: 1245 });
  assert.deepEqual(parseTimes('Mondays, 6:30 pm'), { start: 1110, end: null });
  assert.deepEqual(parseTimes(`12:00${NB}pm`), { start: 720, end: null });
  assert.deepEqual(parseTimes('10:00 am'), { start: 600, end: null });
  assert.deepEqual(parseTimes('11:30–1:00 pm'), { start: 690, end: 780 });
  assert.deepEqual(parseTimes('12:00–1:30 pm'), { start: 720, end: 810 });
  assert.deepEqual(parseTimes('9:00 am - 12:00 pm'), { start: 540, end: 720 });
  assert.equal(parseTimes('Fridays'), null);
  assert.equal(parseTimes('13:00 pm'), null);
  assert.equal(parseTimes(null), null);
});

test('a weekly line: days, time and an optional note after " · "', () => {
  assert.deepEqual(parseWeekly('Wednesdays, 7:00–8:45 pm · September–May'), { days: [2], start: 1140, end: 1245, note: 'September–May' });
  assert.deepEqual(parseWeekly('Tuesdays and Fridays, 4:30–8:40 pm'), { days: [1, 4], start: 990, end: 1240, note: null });
  assert.equal(parseWeekly('7:00 pm'), null, 'no day');
  assert.equal(parseWeekly('Thursdays'), null, 'no time');
  assert.equal(parseWeekly(undefined), null);
});

test('durations, clock times and spans', () => {
  assert.equal(durationMinutes('About 90 minutes'), 90);
  assert.equal(durationMinutes('2 hours'), 120);
  assert.equal(durationMinutes('About an hour and a half'), null);
  assert.equal(clock(1110), `6:30${NB}pm`);
  assert.equal(clock(720), `12:00${NB}pm`);
  assert.equal(clock(0), `12:00${NB}am`);
  assert.equal(timeSpan(1140, 1245), `7:00–8:45${NB}pm`);
  assert.equal(timeSpan(690, 780), `11:30${NB}am–1:00${NB}pm`);
  assert.equal(timeSpan(1110, null), `6:30${NB}pm`);
  assert.equal(hourLabel(10), `10${NB}am`);
  assert.equal(hourLabel(12), `12${NB}pm`);
  assert.equal(hourLabel(21), `9${NB}pm`);
});

test('every confirmed weekly line in ministry-links.yaml can be read', () => {
  for (const m of content('ministry-links.yaml').ministries.filter((x) => x.weekly)) {
    assert.ok(parseWeekly(m.weekly), `${m.id}: ${m.weekly}`);
  }
});

test('the week from the real content files, Monday to Sunday', () => {
  const site = content('site.yaml');
  const groups = [
    { schedule: 'Fridays', area: 'Everett' },
    { schedule: 'Tuesdays', area: 'Everett' },
    { schedule: 'Tuesdays', area: 'Lynnwood' },
    { schedule: 'Thursdays, 7:00 pm', area: 'Mukilteo' },
  ];
  const week = buildWeek({ service: site.service, russianSite: site.links.russian_site, ministries: content('ministry-links.yaml').ministries, groups });
  const view = Object.fromEntries(week.map((d) => [d.short, d.items.map((i) => `${i.title}${i.start !== null ? ` ${timeSpan(i.start, i.end)}` : ''}${i.detail ? ` (${i.detail})` : ''}`)]));
  assert.deepEqual(view, {
    Mon: [`SOL Russian School 6:30${NB}pm`, `Young Adults 7:00${NB}pm`],
    Tue: [`SOL Music Academy 4:30–8:40${NB}pm`, '2 Life Groups (Everett and Lynnwood)'],
    Wed: [`AWANA 7:00–8:45${NB}pm (September–May)`],
    Thu: [`Art Class 6:00${NB}pm`, `Life Group 7:00${NB}pm (Mukilteo)`, `Special Needs Ministry 7:00${NB}pm`, `Teens 7:00${NB}pm`],
    Fri: [`SOL Music Academy 4:30–8:40${NB}pm`, `SOL Kids Choir 5:30–7:00${NB}pm`, 'Life Group (Everett)'],
    Sat: [],
    Sun: [`Russian service 10:00${NB}am`, `English service 12:00–1:30${NB}pm`],
  });
  const fri = week[4].items;
  assert.deepEqual(fri.map((i) => i.short), ['Music Academy', 'Kids Choir', 'Life Group']);
  assert.deepEqual(fri.map((i) => i.href), ['/ministries#music-academy', '/ministries#kids-choir', '/life-groups']);
  assert.equal(week[6].items[0].external, true, 'the Russian service links to the Russian site');
  assert.equal(new Set(week.flatMap((d) => d.items.map((i) => i.key))).size, week.flatMap((d) => d.items).length, 'keys are unique');
});

test('grid hours and places: overlaps step in, open-ended items count an hour', () => {
  const at = (title, start, end = null) => ({ key: title, title, short: title, detail: null, href: '/', external: false, kind: 'kids', start, end });
  const week = [{ name: 'Friday', short: 'Fri', items: [at('Music', 990, 1240), at('Choir', 1050, 1140), at('Late', 1200), at('Group', null)] }];
  assert.deepEqual(gridHours(week), { from: 16, to: 21 });
  assert.deepEqual(gridHours([{ name: 'Sunday', short: 'Sun', items: [at('Service', 600)] }]), { from: 10, to: 11 });
  const places = (items) => gridPlaces(items, 16).map((p) => [p.item.title, p.offset, p.length, p.indent, p.side, p.open]);
  assert.deepEqual(places(week[0].items), [
    ['Music', 2, 17, 0, null, false],
    ['Choir', 6, 6, 1, null, false],
    ['Late', 16, 4, 1, null, true],
  ]);
  // Monday: two open-ended items 30 minutes apart sit side by side.
  assert.deepEqual(places([at('Russian School', 1110), at('Young Adults', 1140)]), [
    ['Russian School', 10, 4, 0, 'left', true],
    ['Young Adults', 12, 4, 0, 'right', true],
  ]);
  // Thursday: two items at the same time; the right one leads by 0 quarter hours.
  assert.deepEqual(gridPlaces([at('Special Needs', 1140), at('Teens', 1140)], 16).map((p) => [p.item.title, p.side, p.lead]), [
    ['Special Needs', 'left', null],
    ['Teens', 'right', 0],
  ]);
  assert.equal(gridPlaces([at('Russian School', 1110), at('Young Adults', 1140)], 16)[1].lead, 2);
});
