// ⚠ PROTOTYPE ONLY. NOT FOR PRODUCTION. ⚠
// Reads Church Center's own, UNDOCUMENTED web API the way the public Church Center pages do:
//   1. POST https://<church>.churchcenter.com/sessions/tokens  -> anonymous 2-hour visitor token
//   2. GET  https://api.churchcenter.com/...                     with that bearer token
// Planning Center doesn't document or support this; it can change or be blocked without notice.
// It only sees *listed* signups and *published* groups. Use the `pco` adapter (Personal Access
// Token) in production. Keep it to one run at a time: 3 API requests plus images per run.
import { SyncError, rel, relIds } from '../lib/http.mjs';

export const name = 'churchcenter';
export const label = 'churchcenter (UNDOCUMENTED Church Center web API, prototype only, not for production)';

/** Anonymous visitor token, fetched once per run and shared by both feeds. */
const sessions = new WeakMap();
function session({ http, config }) {
  if (!sessions.has(http)) {
    sessions.set(http, (async () => {
      const org = config.churchCenterUrl;
      const res = await http.json(`${org}/sessions/tokens`, { method: 'POST', headers: { Origin: org } });
      const token = res?.data?.attributes?.token;
      if (!token) throw new SyncError('Church Center did not return a visitor token (the undocumented flow may have changed).');
      return { Authorization: `Bearer ${token}`, Origin: org };
    })());
  }
  return sessions.get(http);
}

export async function fetchEvents(ctx) {
  const { http, config } = ctx;
  const ev = await http.listAll(
    `${config.churchCenterApi}/registrations/v2/events?order=starts_at&filter=unarchived,published&where[categories]=${config.categoryId}`
      + '&include=categories,event_location,event_times&per_page=100',
    { headers: await session(ctx) },
  );
  return ev.data.map((e) => mapEvent(e, ev.included));
}

export async function fetchGroups(ctx) {
  const { http, config } = ctx;
  // The group type endpoint returns only that type's published groups; the normalizer re-checks the type.
  const gr = await http.listAll(`${config.churchCenterApi}/groups/v2/group_types/${config.groupTypeId}/groups?include=location&per_page=100`, { headers: await session(ctx) });
  return gr.data.map((g) => mapGroup(g, gr.included));
}

function mapEvent(e, inc) {
  const a = e.attributes;
  let times = (rel(e, 'event_times', inc) || []).map((t) => t.attributes);
  if (!times.length && a.starts_at) times = [{ starts_at: a.starts_at, ends_at: a.ends_at, all_day: false }];
  const loc = rel(e, 'event_location', inc)?.attributes;
  return {
    id: e.id,
    title: a.name,
    description: a.description,
    times,
    location: loc ? { name: loc.name, address: loc.full_formatted_address || loc.formatted_address, type: loc.location_type } : null,
    price: { label: a.event_price_with_range },
    image_url: a.logo_url, // already a signed, expiring URL: copied locally, never hotlinked
    register_url: a.new_registration_url || null,
    details_url: a.public_url,
    registration: {
      open: a.registration_state ? a.registration_state === 'open' : a.open === true,
      full: a.at_maximum_capacity === true,
      opens_at: a.open_at ?? null,
      closes_at: a.close_at,
      required: a.registration_type !== 'none',
    },
    updated_at: a.updated_at ?? null,
    category_ids: relIds(e, 'categories') || [],
  };
}

function mapGroup(g, inc) {
  const a = g.attributes;
  const loc = rel(g, 'location', inc)?.attributes;
  return {
    id: g.id,
    title: a.name,
    description: a.description,
    schedule: a.schedule,
    image_url: a.header_image?.medium || null,
    url: a.church_center_web_url,
    enrollment: { status: a.enrollment_status ?? null, strategy: a.enrollment_strategy ?? null },
    location: loc ? { name: loc.name, display_preference: loc.display_preference ?? 'approximate' } : null,
    virtual: a.location_type_preference === 'virtual',
    group_type_id: relIds(g, 'group_type'),
    listed: true,
    archived: false,
    updated_at: a.updated_at ?? null,
  };
}
