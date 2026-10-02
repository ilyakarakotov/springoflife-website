// Life Group cards: the deterministic header parser (scripts/lib/groups.mjs) and what the sync
// publishes. Expected output for the 7 current groups: review-content §4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textLines, normalizeDays, normalizeTime, normalizeArea, parseGroupHeader, groupCard, ownHeaderImage } from '../lib/groups.mjs';
import { normalizeGroups, validateGroups, GROUP_KEYS } from '../lib/normalize.mjs';
import { groupTagline, joinLabel } from '../../src/lib/groups.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

/** The 7 English Life Groups as Church Center returned them on 2026-10-01, through the real normalizer. */
function currentGroups() {
  const raw = fixture('cc-groups.json').data.map((g) => ({
    id: g.id, title: g.attributes.name, description: g.attributes.description, schedule: g.attributes.schedule,
    image_url: g.attributes.header_image?.medium, url: g.attributes.church_center_web_url,
    enrollment: { status: g.attributes.enrollment_status, strategy: g.attributes.enrollment_strategy },
    location: null, virtual: false, listed: true, archived: false,
    group_type_id: g.relationships?.group_type?.data?.id ?? (g.attributes.church_center_web_url.includes('/english-life-groups/') ? '222818' : 'other'),
  }));
  return normalizeGroups(raw, { groupTypeId: '222818', source: 'test' });
}

test('the 7 current groups produce exactly the cards in review-content §4', () => {
  const cards = Object.fromEntries(currentGroups().map((g) => [g.id, {
    title: g.title, schedule: g.schedule, area: g.area, tagline: groupTagline(g.audience), button: joinLabel(g.enrollment),
  }]));
  assert.deepEqual(cards, {
    1744406: { title: 'Daniel and Sarra Kulik', schedule: 'Tuesdays, 7:00 pm', area: 'Mukilteo and Kirkland', tagline: null, button: 'Request to join' },
    1568408: { title: 'Eduard and Alena Yarin', schedule: 'Fridays', area: 'Everett', tagline: null, button: 'Request to join' },
    1570021: { title: 'Ivan and Sveta Ryakhovskiy', schedule: 'Tuesdays', area: 'Monroe', tagline: null, button: 'Request to join' },
    1744407: { title: 'Mark and Louisa Nosov', schedule: 'Tuesdays, 7:00 pm', area: 'Everett and Mukilteo', tagline: null, button: 'Request to join' },
    1568410: { title: 'Michael and Anastasia Sagun', schedule: 'Tuesdays', area: 'Everett', tagline: 'A young family group for Bible study, prayer and fellowship.', button: 'Request to join' },
    1568405: { title: 'Michael Verlan', schedule: 'Tuesdays', area: 'Mukilteo (location varies)', tagline: null, button: 'Request to join' },
    1568415: { title: 'Yuriy Velichko', schedule: 'Fridays', area: 'Everett', tagline: null, button: 'Request to join' },
  });
});

test('nothing from the leaders\' bios is published: no family words, no bio fields', () => {
  const groups = currentGroups();
  const published = JSON.stringify(groups.map(({ _image_url, ...g }) => ({ ...g, tagline: groupTagline(g.audience) })));
  const FAMILY = /\b(daughters?|sons?|kids|children|wife|husband|years? old|single|married|newly ?weds?|student|accountant|engineering)\b/i;
  assert.doesNotMatch(published, FAMILY);
  for (const g of groups) {
    const keys = Object.keys(g).filter((k) => k !== '_image_url');
    assert.deepEqual(keys.sort(), [...GROUP_KEYS].sort(), `group ${g.id} publishes only card fields`);
  }
  // The fixture keeps a (synthetic) bio after the header lines, so a regression would show up here.
  assert.match(JSON.stringify(fixture('cc-groups.json')), /Synthetic bio text/);
  assert.doesNotMatch(published, /Synthetic bio|passage together|Alex|Sam Example/);
});

test('a bio full of family details never reaches the card (synthetic example)', () => {
  const description = '<div>Meeting Day - Thursday<br>Meeting City - Lynnwood</div>'
    + '<div>We are a married couple with two kids, ages 3 and 5, and a toddler at home. Our oldest is in first grade.</div>';
  const card = groupCard({ description, schedule: null, locationName: null });
  assert.deepEqual(card, { schedule: 'Thursdays', area: 'Lynnwood', audience: null });
  assert.doesNotMatch(JSON.stringify(card), /married|kids|toddler|grade|ages/);
});

test('only the header lines are read: a matching line inside the bio is ignored', () => {
  const html = '<div>Welcome!<br>We are a fun group of friends who love the Lord and each other very much.<br>Meeting Day - Monday<br>Meeting City - Lynnwood</div>';
  assert.deepEqual(parseGroupHeader(html), { day: null, time: null, area: null, audience: null });
  const sixth = '<p>A</p><p>B</p><p>C</p><p>D</p><p>E</p><p>Meeting Day - Monday</p>';
  assert.equal(parseGroupHeader(sixth).day, null, 'stops after 5 lines');
});

test('header line formats', () => {
  assert.deepEqual(parseGroupHeader('<div>Tue. 7PM - Mukilteo/Kirkland</div>'), { day: 'Tuesdays', time: '7:00 pm', area: 'Mukilteo and Kirkland', audience: null });
  assert.deepEqual(parseGroupHeader('<p>Thursdays, 6:30 pm – Lynnwood</p>'), { day: 'Thursdays', time: '6:30 pm', area: 'Lynnwood', audience: null });
  assert.deepEqual(parseGroupHeader('<p>Sat - Mill Creek</p>'), { day: 'Saturdays', time: null, area: 'Mill Creek', audience: null });
  assert.deepEqual(parseGroupHeader('<p>Meeting Day: Wednesday<br>Meeting Time: 7:30 PM<br>Meeting Area - Everett, Mukilteo &amp; Lynnwood</p>'),
    { day: 'Wednesdays', time: '7:30 pm', area: 'Everett, Mukilteo and Lynnwood', audience: null });
  assert.equal(parseGroupHeader('<p>Young Adults Group</p>').audience, 'young adults');
  assert.equal(parseGroupHeader("<p>Women's Group</p>").audience, "women's");
});

test('normalizers', () => {
  assert.equal(normalizeDays('Tuesday'), 'Tuesdays');
  assert.equal(normalizeDays('Tue & Thu'), 'Tuesdays and Thursdays');
  assert.equal(normalizeDays('Every other Tuesday'), null, 'not weekly: no claim');
  assert.equal(normalizeDays('1st and 3rd Friday'), null);
  assert.equal(normalizeDays('monthly'), null);
  assert.equal(normalizeDays('Monroe'), null, '"Mon" inside a word is not Monday');
  assert.equal(normalizeTime('7PM'), '7:00 pm');
  assert.equal(normalizeTime('7:30 pm'), '7:30 pm');
  assert.equal(normalizeTime('19:00'), null);
  assert.equal(normalizeArea('Mukilteo (varies)'), 'Mukilteo (location varies)');
  assert.equal(normalizeArea('Everett/Mukilteo'), 'Everett and Mukilteo');
  assert.equal(normalizeArea('4711 116th St SW'), null, 'a street address never passes');
  assert.equal(normalizeArea('Everett, 98201'), null);
  assert.equal(normalizeArea('call me for the address!'), null);
  assert.equal(normalizeArea('A really long description of where we meet each week'), null);
});

test('precedence: the typed PCO schedule, then the parsed header; exact place name, then the parsed area', () => {
  const description = '<p>Meeting Day - Friday<br>Meeting City - Everett</p>';
  assert.deepEqual(groupCard({ description, schedule: 'Fridays at 7:00 pm', locationName: null }), { schedule: 'Fridays at 7:00 pm', area: 'Everett', audience: null });
  assert.deepEqual(groupCard({ description, schedule: null, locationName: 'Church fellowship hall' }), { schedule: 'Fridays', area: 'Church fellowship hall', audience: null });
  assert.equal(groupCard({ description, locationName: '123 Example Ln' }).area, 'Everett', 'a place name with digits is never used');
  assert.equal(groupCard({ description, schedule: 'Call 425-555-0100' }).schedule, 'Fridays', 'contact info in the schedule field is not published');
  assert.deepEqual(groupCard({ description: null }), { schedule: null, area: null, audience: null });
});

test('the line splitter handles <br>, blocks and entities', () => {
  assert.deepEqual(textLines('<div>A&nbsp;&amp;&nbsp;B<br>C</div><div><p>D</p></div>  '), ['A & B', 'C', 'D']);
});

test("header images: only the group's own upload counts (PCO's default illustration does not)", () => {
  const own = 'https://groups-production.s3.amazonaws.com/uploads/group/header_image/1568405/medium_photo.jpeg';
  assert.equal(ownHeaderImage(own, '1568405'), own);
  assert.equal(ownHeaderImage(own, '1568408'), null);
  assert.equal(ownHeaderImage('https://groups.planningcenteronline.com/assets/default_header-1a2b.png', '1568405'), null);
  assert.equal(ownHeaderImage(null, '1'), null);
});

test('validation rejects a group that carries anything but card fields', () => {
  const [g] = currentGroups();
  const { _image_url, ...clean } = g;
  assert.doesNotThrow(() => validateGroups([clean]));
  assert.throws(() => validateGroups([{ ...clean, description_html: '<p>bio</p>' }]), /unexpected field\(s\) description_html/);
  assert.throws(() => validateGroups([{ ...clean, area: '123 Main St' }]), /area must be a place name without digits/);
  assert.throws(() => validateGroups([{ ...clean, audience: 'kids' }]), /unknown audience/);
});

test('button text follows the Church Center enrollment setting', () => {
  assert.equal(joinLabel({ status: 'open', strategy: 'request_to_join' }), 'Request to join');
  assert.equal(joinLabel({ status: 'open', strategy: 'open_signup' }), 'Join this group');
  assert.equal(joinLabel({ status: 'full', strategy: 'request_to_join' }), 'See group on Church Center');
});
