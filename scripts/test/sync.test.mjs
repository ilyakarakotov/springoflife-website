// node --test scripts/test/   (no network: every request is answered by a mock)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSync, PartialSyncError } from '../sync.mjs';
import { SyncError } from '../lib/http.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const fixture = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));
const NOW = '2026-10-01T23:00:00-07:00';
const SYNCED = 'src/assets/sync'; // where the sync puts images

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), 'sol-sync-'));
  await mkdir(join(root, 'src/content'), { recursive: true });
  await copyFile(join(repo, 'src/content/site.yaml'), join(root, 'src/content/site.yaml'));
  return root;
}

async function snapshot(root) {
  const out = {};
  async function walk(dir) {
    for (const f of await readdir(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) await walk(p);
      else out[p.slice(root.length)] = createHash('sha256').update(await readFile(p)).digest('hex');
    }
  }
  await walk(root);
  return out;
}

const image = (url) => new Response(Buffer.from(`fake-image:${new URL(url).pathname}`), { headers: { 'content-type': 'image/jpeg' } });

/** Mock fetch for the Church Center prototype flow. `override(url)` can return a Response to inject failures. */
function ccFetch(override = () => null) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const o = override(url, init, calls);
    if (o) return typeof o === 'function' ? o() : o;
    if (url.endsWith('/sessions/tokens')) return Response.json({ data: { attributes: { token: 'ort_test' } } });
    if (url.includes('/registrations/v2/events')) return Response.json(fixture('cc-events.json'));
    if (url.includes('/groups/v2/group_types/222818/groups')) return Response.json(fixture('cc-groups.json'));
    if (/planningcenterusercontent|s3\.amazonaws\.com/.test(url)) return image(url);
    throw new TypeError(`fetch failed (unexpected ${url})`);
  };
  fn.calls = calls;
  return fn;
}

const quiet = () => {};
const noSleep = async () => {};
const cc = (root, env = {}, fetchImpl = ccFetch()) => runSync({ root, env: { SYNC_ADAPTER: 'churchcenter', SYNC_NOW: NOW, ...env }, fetchImpl, sleep: noSleep, log: quiet });
const readJsonFile = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

test('churchcenter adapter: only the website-category event and only English Life Groups', async () => {
  const root = await makeRoot();
  const s = await cc(root);
  assert.equal(s.events, 1);
  assert.deepEqual(s.eventTitles, ['Intentional Parenting']);
  assert.equal(s.groups, 7);
  assert.ok(!s.groupTitles.includes('Cafe SOL'), 'serve-team group of another type must be filtered out');

  const [e] = readJsonFile(root, 'src/data/events.json');
  assert.equal(e.id, '3894463');
  assert.equal(e.starts_at, '2026-10-04T01:00:00Z');
  assert.equal(e.all_day, false);
  assert.equal(e.summary, 'Parenting is a gift, and it was never meant to be done alone.');
  assert.deepEqual(e.location, {
    name: 'Spring of Life Church', address: '4711 116th St SW, Mukilteo, WA 98275', city: 'Mukilteo', type: 'address',
    postal: { street: '4711 116th St SW', locality: 'Mukilteo', region: 'WA', postal_code: '98275', country: 'US' },
  });
  assert.deepEqual(e.registration, { open: true, full: false, opens_at: '2026-09-15T07:00:00Z', closes_at: null });
  assert.equal(e.price.free, true);
  assert.equal(e.register_url, 'https://springoflifechurch.churchcenter.com/registrations/events/3894463/reservations/new');
  assert.equal(e.details_url, 'https://springoflifechurch.churchcenter.com/registrations/events/3894463');
  assert.match(e.image, /^signup-3894463-[0-9a-f]{12}\.jpg$/, 'a file name in src/assets/sync/');
  assert.ok(existsSync(join(root, SYNCED, e.image)), 'image copied locally');
  assert.ok(!e.description_html.includes('<script'));

  const groups = readJsonFile(root, 'src/data/groups.json');
  assert.ok(groups.every((g) => g.url.includes('/groups/english-life-groups/')));
  assert.ok(groups.every((g) => g.image?.startsWith('group-') && existsSync(join(root, SYNCED, g.image))));
  assert.ok(!existsSync(join(root, 'public/media')), 'nothing is written under the old SnapPages /media/ path');

  const ics = readFileSync(join(root, 'public/events.ics'), 'utf8');
  assert.match(ics, /SUMMARY:Intentional Parenting\r\n/);
  assert.match(ics, /DTSTART:20261004T010000Z/);
  const digest = readFileSync(join(root, 'out/weekly-digest.md'), 'utf8');
  assert.match(digest, /This week at Spring of Life Church/);
  assert.match(digest, /A person reviews this before it is posted/);
  assert.match(digest, /\*\*Intentional Parenting\*\*/);
});

test('second run with identical data writes nothing and re-downloads no images', async () => {
  const root = await makeRoot();
  await cc(root);
  const before = await snapshot(root);
  const f = ccFetch();
  const s = await cc(root, {}, f);
  assert.deepEqual(s.changed, []);
  assert.equal(s.media.downloaded, 0);
  assert.equal(f.calls.filter((c) => /amazonaws|planningcenterusercontent/.test(c.url)).length, 0);
  assert.deepEqual(await snapshot(root), before);
});

test('ended events drop out and their images are removed', async () => {
  const root = await makeRoot();
  await cc(root);
  const s = await cc(root, { SYNC_NOW: '2026-10-05T12:00:00Z' });
  assert.equal(s.events, 0);
  assert.deepEqual(readJsonFile(root, 'src/data/events.json'), []);
  assert.ok(!(await readdir(join(root, SYNCED))).some((f) => f.startsWith('signup-')));
  assert.match(readFileSync(join(root, 'out/weekly-digest.md'), 'utf8'), /No website events this week/);
});

test('pco adapter: auth + version headers, 429 retry, privacy rules for groups', async () => {
  const root = await makeRoot();
  let first = true;
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (/\/signups\/\d+\/logo$/.test(url)) {
      return new Response(null, { status: 302, headers: { location: 'https://images.planningcenterusercontent.com/v1/transform?key=logo3894463&version=1&expires_at=1&signature=abc' } });
    }
    if (url.includes('/registrations/v2/signups?')) {
      if (first) { first = false; return new Response('slow down', { status: 429, headers: { 'retry-after': '1' } }); }
      assert.equal(init.headers['X-PCO-API-Version'], '2025-05-01');
      assert.equal(init.headers.Authorization, `Basic ${Buffer.from('app:secret').toString('base64')}`);
      assert.match(url, /where\[categories\]=111199/);
      assert.match(url, /fields\[Signup\]=[^&]*at_maximum_capacity/, 'capacity is only returned when requested');
      assert.match(url, /fields\[Signup\]=[^&]*selection_types/, 'relationships must stay in the sparse fieldset');
      assert.match(url, /fields\[SelectionType\]=[^&]*at_maximum_capacity/);
      return Response.json(fixture('pco-signups.json'));
    }
    if (url.includes('/groups/v2/groups?')) {
      assert.equal(init.headers['X-PCO-API-Version'], '2023-07-10');
      assert.match(url, /filter=group_type,published&group_type_id=222818/);
      return Response.json(fixture('pco-groups.json'));
    }
    if (/planningcenterusercontent|amazonaws/.test(url)) return image(url);
    throw new TypeError(`unexpected ${url}`);
  };
  const sleeps = [];
  const s = await runSync({ root, env: { SYNC_ADAPTER: 'pco', PCO_APP_ID: 'app', PCO_SECRET: 'secret', SYNC_NOW: NOW }, fetchImpl, sleep: async (ms) => sleeps.push(ms), log: quiet });
  assert.deepEqual(sleeps, [1000], 'honours Retry-After');
  assert.equal(s.events, 1);
  const [e] = readJsonFile(root, 'src/data/events.json');
  assert.equal(e.price.label, 'Free');
  assert.equal(e.details_url, 'https://springoflifechurch.churchcenter.com/registrations/events/3894463');
  assert.equal(e.updated_at, '2026-09-20T17:22:01Z');

  const groupsText = readFileSync(join(root, 'src/data/groups.json'), 'utf8');
  const groups = JSON.parse(groupsText);
  assert.deepEqual(groups.map((g) => g.title), ['Test Group Friday', 'Test Group Tuesday'], 'unlisted group dropped');
  const tue = groups.find((g) => g.title === 'Test Group Tuesday');
  assert.equal(tue.area, 'Church fellowship hall', 'exact location: the place name only');
  assert.equal(tue.schedule, 'Tuesdays at 7:00 pm', 'the PCO schedule field, as typed');
  assert.equal(groups.find((g) => g.title === 'Test Group Friday').area, null, 'approximate location is not published');
  assert.ok(groups.every((g) => !('description_html' in g) && !('summary' in g) && !('location' in g)), 'no bio or location object is stored');
  assert.ok(!/A test group/.test(groupsText), 'the description is never stored');
  assert.ok(!/123 Example|4711 116th|Test family home/.test(groupsText), 'no street address or private place name');
  assert.ok(!/555-0199|leader@example\.com/.test(groupsText), 'phones and emails are redacted');
});

/** Run the pco adapter against (possibly modified) fixtures. */
async function pcoRun({ signups = fixture('pco-signups.json'), groups = fixture('pco-groups.json'), now = NOW } = {}) {
  const root = await makeRoot();
  const fetchImpl = async (url) => {
    if (/\/signups\/\d+\/logo$/.test(url)) return new Response(null, { status: 302, headers: { location: 'https://images.planningcenterusercontent.com/v1/transform?key=x&version=1' } });
    if (url.includes('/registrations/v2/signups?')) return Response.json(signups);
    if (url.includes('/groups/v2/groups?')) return Response.json(groups);
    if (/planningcenterusercontent|amazonaws/.test(url)) return image(url);
    throw new TypeError(`unexpected ${url}`);
  };
  await runSync({ root, env: { SYNC_ADAPTER: 'pco', PCO_APP_ID: 'app', PCO_SECRET: 'secret', SYNC_NOW: now }, fetchImpl, sleep: noSleep, log: quiet });
  return { events: readJsonFile(root, 'src/data/events.json'), groups: readJsonFile(root, 'src/data/groups.json') };
}

test('pco adapter: sold out at the signup level, or every public ticket type full without a waitlist', async () => {
  const signupCap = fixture('pco-signups.json');
  signupCap.data[0].attributes.at_maximum_capacity = true;
  assert.equal((await pcoRun({ signups: signupCap })).events[0].registration.full, true);

  const ticketsFull = fixture('pco-signups.json');
  for (const t of ticketsFull.included.filter((i) => i.type === 'SelectionType')) t.attributes.at_maximum_capacity = true;
  assert.equal((await pcoRun({ signups: ticketsFull })).events[0].registration.full, true);

  const withWaitlist = fixture('pco-signups.json');
  for (const t of withWaitlist.included.filter((i) => i.type === 'SelectionType')) Object.assign(t.attributes, { at_maximum_capacity: true, waitlist: true });
  assert.equal((await pcoRun({ signups: withWaitlist })).events[0].registration.full, false, 'a waitlist keeps registration available');

  const oneFull = fixture('pco-signups.json');
  oneFull.included.find((i) => i.type === 'SelectionType').attributes.at_maximum_capacity = true;
  assert.equal((await pcoRun({ signups: oneFull })).events[0].registration.full, false, 'other tickets are still available');
});

test('pco adapter: registration that opens later keeps its opening time', async () => {
  const later = fixture('pco-signups.json');
  Object.assign(later.data[0].attributes, { open: false, closed: true, open_at: '2026-10-10T16:00:00Z' });
  const { events } = await pcoRun({ signups: later });
  assert.deepEqual(events[0].registration, { open: false, full: false, opens_at: '2026-10-10T16:00:00Z', closes_at: null });
});

test('pco adapter: a group without an explicit listed=true is not published', async () => {
  const groups = fixture('pco-groups.json');
  delete groups.data[0].attributes.listed;
  const { groups: out } = await pcoRun({ groups });
  assert.ok(!out.some((g) => g.id === groups.data[0].id));
});

test('pco adapter without a token fails with a helpful message', async () => {
  const root = await makeRoot();
  await assert.rejects(runSync({ root, env: { SYNC_ADAPTER: 'pco' }, fetchImpl: ccFetch(), log: quiet }), /PCO_APP_ID and PCO_SECRET are required/);
  assert.ok(!existsSync(join(root, 'src/data')));
});

for (const [name, env, fetchImpl, pattern] of [
  ['unknown adapter', { SYNC_ADAPTER: 'bogus' }, ccFetch(), /Unknown SYNC_ADAPTER/],
  ['network is down', {}, ccFetch(() => () => { throw new TypeError('fetch failed'); }), /Network error after 4 attempts/],
  ['both feeds fail', {}, ccFetch((url) => (url.includes('/registrations/') || url.includes('/groups/') ? new Response('boom', { status: 500 }) : null)), /Nothing was updated[\s\S]*events: HTTP 500[\s\S]*groups: HTTP 500/],
  ['bad category id', { PCO_WEBSITE_CATEGORY_ID: 'Website Category ' }, ccFetch(), /must be a numeric ID/],
  ['prototype adapter in GitHub Actions', { GITHUB_ACTIONS: 'true' }, ccFetch(), /refused in GitHub Actions/],
]) {
  test(`failure leaves every file untouched: ${name}`, async () => {
    const root = await makeRoot();
    await cc(root); // last good data
    await writeFile(join(root, 'marker.txt'), 'x');
    const before = await snapshot(root);
    await assert.rejects(cc(root, env, fetchImpl), pattern);
    assert.deepEqual(await snapshot(root), before);
    assert.ok(!existsSync(join(root, '.sync.lock')), 'lock released');
    assert.ok(!(await readdir(root)).some((f) => f.startsWith('.sync-staging-')), 'staging cleaned up');
  });
}

test('a second sync while one is running fails cleanly and leaks nothing', async () => {
  const root = await makeRoot();
  await writeFile(join(root, '.sync.lock'), '123\n');
  await assert.rejects(cc(root), (err) => err instanceof SyncError && /Another sync is running/.test(err.message));
  assert.ok(!(await readdir(root)).some((f) => f.startsWith('.sync-staging-')), 'no staging dir created');
});

// ---- Partial failures: one feed or image failing must not block the other ----

test('Groups failing (e.g. the token has no Groups access) still publishes events', async () => {
  const root = await makeRoot();
  await cc(root);
  const groupsBefore = readFileSync(join(root, 'src/data/groups.json'), 'utf8');
  const events = fixture('cc-events.json');
  events.data.find((e) => e.id === '3894463').attributes.name = 'Intentional Parenting (updated)';
  const f = ccFetch((url) => {
    if (url.includes('/groups/')) return new Response('{"errors":[{"status":"403"}]}', { status: 403 });
    if (url.includes('/registrations/v2/events')) return Response.json(events);
    return null;
  });
  const err = await cc(root, {}, f).then(() => null, (e) => e);
  assert.ok(err instanceof PartialSyncError, 'the run still fails, so someone is alerted');
  assert.match(err.message, /groups: HTTP 403/);
  assert.equal(readJsonFile(root, 'src/data/events.json')[0].title, 'Intentional Parenting (updated)', 'events were published');
  assert.equal(readFileSync(join(root, 'src/data/groups.json'), 'utf8'), groupsBefore, 'groups kept their last good data');
  assert.ok(readJsonFile(root, 'src/data/groups.json').every((g) => !g.image || existsSync(join(root, SYNCED, g.image))), 'group images kept');
});

test('Registrations failing still publishes Life Groups', async () => {
  const root = await makeRoot();
  await cc(root);
  const eventsBefore = readFileSync(join(root, 'src/data/events.json'), 'utf8');
  const groups = fixture('cc-groups.json');
  groups.data[0].attributes.name = 'Daniel and Sarra Kulik (updated)';
  const f = ccFetch((url) => {
    if (url.includes('/registrations/')) return new Response('boom', { status: 500 });
    if (url.includes('/groups/')) return Response.json(groups);
    return null;
  });
  await assert.rejects(cc(root, {}, f), (e) => e instanceof PartialSyncError && /events: HTTP 500 after 4 attempts/.test(e.message));
  assert.equal(readFileSync(join(root, 'src/data/events.json'), 'utf8'), eventsBefore);
  assert.ok(readJsonFile(root, 'src/data/groups.json').some((g) => g.title.endsWith('(updated)')));
  assert.ok(existsSync(join(root, SYNCED, readJsonFile(root, 'src/data/events.json')[0].image)), 'event image kept on disk');
});

// ---- The empty-feed guard ----

function threeEventsFetch(override = () => null) {
  const ev = fixture('cc-events.json');
  const base = ev.data.find((e) => e.id === '3894463');
  ev.data = ['1', '2', '3'].map((id) => ({ ...structuredClone(base), id }));
  return ccFetch((url, init, calls) => override(url, init, calls) ?? (url.includes('/registrations/v2/events') ? Response.json(ev) : null));
}

test('guard: three events ending the same weekend is normal; the next run publishes []', async () => {
  const root = await makeRoot();
  assert.equal((await cc(root, {}, threeEventsFetch())).events, 3);
  const s = await cc(root, { SYNC_NOW: '2026-10-05T12:00:00Z' }, threeEventsFetch());
  assert.equal(s.events, 0);
  assert.deepEqual(readJsonFile(root, 'src/data/events.json'), []);
});

test('guard: 0 events from the API while 3 are still upcoming is refused (unless allow-empty)', async () => {
  const root = await makeRoot();
  await cc(root, {}, threeEventsFetch());
  const before = readFileSync(join(root, 'src/data/events.json'), 'utf8');
  const empty = () => threeEventsFetch((url) => (url.includes('/registrations/v2/events') ? Response.json({ data: [], included: [], links: {} }) : null));
  await assert.rejects(cc(root, {}, empty()), (e) => e instanceof PartialSyncError && /returned 0 events, but the site still lists 3 current events/.test(e.message));
  assert.equal(readFileSync(join(root, 'src/data/events.json'), 'utf8'), before, 'events kept');
  const s = await cc(root, { SYNC_ALLOW_EMPTY: '1' }, empty());
  assert.equal(s.events, 0, 'allow-empty accepts it');
});

test('guard: the API suddenly returning no groups keeps the groups (events still update)', async () => {
  const root = await makeRoot();
  await cc(root);
  const before = readFileSync(join(root, 'src/data/groups.json'), 'utf8');
  const f = ccFetch((url) => (url.includes('/groups/') ? Response.json({ data: [], included: [], links: {} }) : null));
  await assert.rejects(cc(root, {}, f), /groups: Planning Center returned 0 groups, but the site still lists 7/);
  assert.equal(readFileSync(join(root, 'src/data/groups.json'), 'utf8'), before);
});

test('a group whose photo is overridden in group-overrides.yaml has its PCO image skipped entirely', async () => {
  const root = await makeRoot();
  await cc(root);
  const file = readJsonFile(root, 'src/data/groups.json').find((g) => g.id === '1570021').image;
  assert.ok(existsSync(join(root, SYNCED, file)));
  await writeFile(join(root, 'src/content/group-overrides.yaml'), 'groups:\n  - id: "1570021"\n    image: none\n');
  const f = ccFetch();
  await cc(root, {}, f);
  assert.equal(readJsonFile(root, 'src/data/groups.json').find((g) => g.id === '1570021').image, null);
  assert.ok(!existsSync(join(root, SYNCED, file)), 'the old file is removed from src/assets/sync');
  assert.ok(!Object.values(readJsonFile(root, 'src/data/media-manifest.json')).includes(file));
  assert.ok(!f.calls.some((c) => c.url.includes('/1570021/')), 'never downloaded');
});

// ---- Images ----

test('a known image that now fails keeps the previous file; a new one shows no image', async () => {
  const root = await makeRoot();
  await cc(root);
  const before = readJsonFile(root, 'src/data/groups.json');
  const groups = fixture('cc-groups.json');
  groups.data[0].attributes.header_image.medium += '?v=2'; // changed image for group 0 -> must download
  groups.data.push({ ...structuredClone(groups.data[1]), id: '9999999' }); // brand-new group whose image fails
  groups.data.at(-1).attributes.name = 'New Group';
  groups.data.at(-1).attributes.header_image.medium = 'https://groups-production.s3.amazonaws.com/uploads/group/header_image/9999999/medium_new.jpg';
  const f = ccFetch((url) => {
    if (url.includes('/groups/')) return Response.json(groups);
    if (url.includes('?v=2') || url.includes('/9999999/')) return new Response('nope', { status: 404 });
    return null;
  });
  const err = await cc(root, {}, f).then(() => null, (e) => e);
  assert.ok(err instanceof PartialSyncError);
  assert.match(err.message, new RegExp(`image group-${groups.data[0].id}: HTTP 404 \\(kept the previous image\\)`));
  assert.match(err.message, /image group-9999999: HTTP 404 \(shown without an image\)/);
  const after = readJsonFile(root, 'src/data/groups.json');
  const g0 = after.find((g) => g.id === groups.data[0].id);
  assert.equal(g0.image, before.find((g) => g.id === g0.id).image, 'previous image kept');
  assert.ok(existsSync(join(root, SYNCED, g0.image)));
  assert.equal(after.find((g) => g.id === '9999999').image, null);
  assert.equal(after.length, 8, 'the group list itself was published');
});

for (const [name, response, pattern] of [
  ['HTML instead of an image', () => new Response('<html>', { headers: { 'content-type': 'text/html' } }), /unexpected content-type "text\/html"/],
  ['an SVG (scriptable) image', () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }), /unexpected content-type "image\/svg\+xml"/],
  ['an image over 8 MB', () => new Response(Buffer.alloc(8 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/jpeg' } }), /size 8388609 bytes is out of range/],
]) {
  test(`images: ${name} is rejected`, async () => {
    const root = await makeRoot();
    const err = await cc(root, {}, ccFetch((url) => (/amazonaws|planningcenterusercontent/.test(url) ? response() : null))).then(() => null, (e) => e);
    assert.ok(err instanceof PartialSyncError);
    assert.match(err.message, pattern);
    assert.ok(readJsonFile(root, 'src/data/groups.json').every((g) => g.image === null));
    assert.ok(!existsSync(join(root, SYNCED)) || (await readdir(join(root, SYNCED))).length === 0, 'nothing written');
  });
}
