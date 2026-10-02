// PRODUCTION adapter: the official Planning Center API with a Personal Access Token.
//   Registrations: X-PCO-API-Version 2025-05-01 (the public Signup schema)
//   Groups:        X-PCO-API-Version 2023-07-10
// The token acts as the person who created it, so that person needs Registrations administrator
// (to see every signup) and Groups viewer access. See README "Switching to the pco adapter".
import { SyncError, rel, relIds } from '../lib/http.mjs';

export const name = 'pco';
export const label = 'pco (official Planning Center API, Personal Access Token)';

const REGISTRATIONS_VERSION = '2025-05-01';
const GROUPS_VERSION = '2023-07-10';

// Sparse fieldsets. `at_maximum_capacity` (signup and ticket type) and `address_data` are "only
// available when requested with the ?fields param" (Registrations 2025-05-01 OpenAPI); without them
// a sold-out event would keep showing Register. Relationship names must be listed too.
export const SIGNUP_FIELDS = [
  'fields[Signup]=name,description,logo_url,new_registration_url,open_at,close_at,open,closed,archived,at_maximum_capacity,updated_at,'
    + 'categories,signup_location,signup_times,next_signup_time,selection_types',
  'fields[SelectionType]=name,price_cents,publicly_available,waitlist,at_maximum_capacity',
  'fields[SignupLocation]=name,location_type,formatted_address,full_formatted_address,address_data',
].join('&');

function auth(config) {
  if (!config.appId || !config.secret) {
    throw new SyncError('PCO_APP_ID and PCO_SECRET are required for the pco adapter. For the local prototype run SYNC_ADAPTER=churchcenter (npm run sync:cc).');
  }
  return { Authorization: 'Basic ' + Buffer.from(`${config.appId}:${config.secret}`).toString('base64') };
}

/** Signups that carry the website category (Registrations). */
export async function fetchEvents({ http, config }) {
  // Server-side category filter (by ID; filtering by name returns 404). The normalizer re-checks it.
  const reg = await http.listAll(
    `${config.pcoApi}/registrations/v2/signups?filter=unarchived&where[categories]=${config.categoryId}&per_page=100`
      + `&include=categories,signup_location,signup_times,next_signup_time,selection_types&${SIGNUP_FIELDS}`,
    { headers: { ...auth(config), 'X-PCO-API-Version': REGISTRATIONS_VERSION } },
  );
  return reg.data.map((s) => mapSignup(s, reg.included, config));
}

/** Groups of the Life Groups type (Groups). Fetched separately, so a Groups problem never blocks events. */
export async function fetchGroups({ http, config }) {
  // `published` keeps unlisted groups (and their exact addresses) from ever reaching the runner.
  const grp = await http.listAll(
    `${config.pcoApi}/groups/v2/groups?filter=group_type,published&group_type_id=${config.groupTypeId}&include=enrollment,location&per_page=100`,
    { headers: { ...auth(config), 'X-PCO-API-Version': GROUPS_VERSION } },
  );
  return grp.data.map((g) => mapGroup(g, grp.included, config));
}

function mapSignup(s, inc, config) {
  const a = s.attributes;
  const times = [rel(s, 'next_signup_time', inc), ...(rel(s, 'signup_times', inc) || [])]
    .filter(Boolean).map((t) => t.attributes);
  const loc = rel(s, 'signup_location', inc)?.attributes;
  const selection = (rel(s, 'selection_types', inc) || []).map((t) => t.attributes).filter((t) => t.publicly_available !== false);
  const register = a.new_registration_url || null;
  return {
    id: s.id,
    title: a.name,
    description: a.description,
    times,
    location: loc ? { name: loc.name, address: loc.full_formatted_address || loc.formatted_address, address_data: parseAddressData(loc.address_data), type: loc.location_type } : null,
    price: { cents: selection.map((t) => t.price_cents) },
    image_url: a.logo_url, // stable https://registrations.planningcenteronline.com/signups/{id}/logo (302 -> signed URL)
    register_url: register,
    details_url: register ? register.replace(/\/reservations\/new\/?$/, '') : `${config.churchCenterUrl}/registrations/events/${s.id}`,
    // PCO doesn't expose the signup type; no selection types is the best signal for "announcement only".
    registration: {
      open: a.open === true,
      // Full when the signup-level cap is reached, or every public ticket type is full with no waitlist.
      full: a.at_maximum_capacity === true || (selection.length > 0 && selection.every((t) => t.at_maximum_capacity === true && !t.waitlist)),
      opens_at: a.open_at ?? null,
      closes_at: a.close_at,
      required: selection.length > 0,
    },
    updated_at: a.updated_at,
    category_ids: relIds(s, 'categories') || [],
  };
}

function mapGroup(g, inc, config) {
  const a = g.attributes;
  const enr = rel(g, 'enrollment', inc)?.attributes;
  const loc = rel(g, 'location', inc)?.attributes;
  return {
    id: g.id,
    title: a.name,
    description: a.description,
    schedule: a.schedule,
    image_url: a.header_image?.medium || null,
    url: a.public_church_center_web_url,
    enrollment: { status: enr?.status ?? null, strategy: enr?.strategy ?? null },
    // The admin token sees exact addresses; only name + the leader's display choice leave this function.
    location: loc ? { name: loc.name, display_preference: loc.display_preference } : null,
    virtual: a.location_type_preference === 'virtual',
    group_type_id: relIds(g, 'group_type') ?? config.groupTypeId, // already filtered server-side
    listed: a.listed === true, // fail closed: a missing flag is not "listed"
    archived: Boolean(a.archived_at),
    updated_at: a.updated_at,
  };
}

/** `address_data` is documented as a string; accept a JSON string or an object, ignore anything else. */
function parseAddressData(v) {
  let d = v;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return null; } }
  return d && typeof d === 'object' && !Array.isArray(d) ? d : null;
}
