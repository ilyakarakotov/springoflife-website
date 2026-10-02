// Turns adapter output into the stable website schema (see README "Data files").
// Both adapters feed the same functions, so the site never knows which source was used.
import { cleanHtml, summarize, redactContacts } from './html.mjs';
import { SyncError } from './http.mjs';
import { groupCard, ownHeaderImage, AUDIENCES } from './groups.mjs';
import { occurrenceEnd } from '../../src/lib/time.mjs';

/** The public name is "Spring of Life Church" (PCO data sometimes says "Spring Of Life" or adds "Baptist"). */
export const fixChurchName = (s) => (s == null ? s : String(s).replace(/spring\s+of\s+life(\s+baptist)?\s+church/gi, 'Spring of Life Church'));

/** "4711 116th St SW\n Mukilteo, WA 98275" -> "4711 116th St SW, Mukilteo, WA 98275" */
export function formatAddress(address) {
  if (!address) return null;
  return String(address).split(/\s*\n\s*/).map((s) => s.trim()).filter(Boolean).join(', ').replace(/\s+/g, ' ') || null;
}

const pick = (o, keys) => keys.map((k) => o?.[k]).find((v) => typeof v === 'string' && v.trim())?.trim() ?? null;

/**
 * Structured US address for schema.org PostalAddress and the event's city:
 * "4711 116th St SW, Mukilteo, WA 98275" -> { street, locality, region, postal_code, country }.
 * Uses PCO's address_data when it has the parts, otherwise parses the formatted address. null if
 * the address doesn't look like "street, city, ST 12345".
 */
export function postalAddress(formatted, data = null) {
  const fromData = {
    street: pick(data, ['street', 'street_address', 'address1', 'line1', 'street_line_1']),
    locality: pick(data, ['city', 'locality']),
    region: pick(data, ['state', 'region', 'province']),
    postal_code: pick(data, ['zip', 'postal_code', 'postcode', 'zip_code']),
  };
  if (fromData.street && fromData.locality && fromData.region) return { ...fromData, country: pick(data, ['country', 'country_code']) || 'US' };
  if (!formatted) return null;
  const parts = String(formatted).split(',').map((s) => s.trim()).filter(Boolean);
  if (/^(usa|us|united states( of america)?)$/i.test(parts.at(-1) ?? '')) parts.pop();
  const m = /^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(parts.at(-1) ?? '');
  if (!m || parts.length < 3) return null;
  return { street: parts.slice(0, -2).join(', '), locality: parts.at(-2), region: m[1], postal_code: m[2], country: 'US' };
}

const dollars = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** Price from a list of cents (PCO selection types) or a Church Center label ("Free", "$65", "$350 – $450"). */
export function normalizePrice({ cents, label } = {}) {
  let values = Array.isArray(cents) ? cents.filter(Number.isFinite) : null;
  if (!values && label) {
    if (/^\s*free\s*$/i.test(label)) values = [0];
    else values = [...String(label).matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)].map((m) => Math.round(Number(m[1].replace(/,/g, '')) * 100));
  }
  if (!values || !values.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  return {
    free: max === 0,
    min_cents: min,
    max_cents: max,
    label: max === 0 ? 'Free' : min === max ? dollars(min) : min === 0 ? `Free – ${dollars(max)}` : `${dollars(min)} – ${dollars(max)}`,
  };
}

/** One entry per start time; if a start appears twice (next_signup_time + signup_times), keep the longer one. */
function uniqueByStart(times) {
  const byStart = new Map();
  for (const t of times) {
    const prev = byStart.get(t.starts_at);
    if (!prev || (t.ends_at ?? '') > (prev.ends_at ?? '')) byStart.set(t.starts_at, t);
  }
  return [...byStart.values()];
}

/**
 * @param {Array} raw  adapter events
 * @param {{categoryId: string, now: Date, source: string}} opts
 */
export function normalizeEvents(raw, { categoryId, now, source }) {
  const nowMs = now.getTime();
  const out = [];
  for (const e of raw) {
    if (!e.category_ids?.map(String).includes(String(categoryId))) continue; // opt-in category, matched by ID
    const allTimes = (e.times || []).filter((t) => t?.starts_at)
      .map((t) => ({ starts_at: t.starts_at, ends_at: t.ends_at || null, all_day: Boolean(t.all_day) }));
    const unique = uniqueByStart(allTimes);
    const upcoming = unique.filter((t) => occurrenceEnd(t).getTime() > nowMs).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    if (unique.length && !upcoming.length) continue; // every occurrence has ended
    const next = upcoming[0] || { starts_at: null, ends_at: null, all_day: false };
    const desc = cleanHtml(fixChurchName(e.description));
    const loc = e.location;
    out.push({
      id: String(e.id),
      title: redactContacts(fixChurchName(String(e.title || '').trim())),
      summary: summarize(desc.blocks),
      description_html: desc.html,
      starts_at: next.starts_at,
      ends_at: next.ends_at,
      all_day: next.all_day,
      more_times: upcoming.slice(1, 12),
      // Online meeting links (which can carry passcodes) are never stored; Church Center has them.
      location: loc && (loc.name || loc.address || loc.type === 'online') ? (() => {
        const address = loc.type === 'online' ? null : formatAddress(loc.address);
        const postal = address ? postalAddress(address, loc.address_data) : null;
        return {
          name: loc.name?.trim() ? redactContacts(fixChurchName(loc.name.trim())) : null,
          address,
          city: postal?.locality ?? null,
          postal,
          type: loc.type || null,
        };
      })() : null,
      price: normalizePrice(e.price || {}),
      image: null, // filled in by the media step
      register_url: e.registration?.required === false ? null : e.register_url || null,
      details_url: e.details_url,
      registration: {
        open: Boolean(e.registration?.open),
        full: Boolean(e.registration?.full),
        opens_at: e.registration?.opens_at || null,
        closes_at: e.registration?.closes_at || null,
      },
      updated_at: e.updated_at || null,
      source,
      _image_url: e.image_url || null,
    });
  }
  return out.sort((a, b) => (a.starts_at ?? '9999').localeCompare(b.starts_at ?? '9999') || a.title.localeCompare(b.title));
}

/**
 * Life Groups. Privacy (brief: "never publish home addresses, phone numbers of individuals, or
 * children's details"):
 *   - The description is the leaders' bio. It is never stored: only the meeting day/time, the
 *     area and an audience label are parsed from its header lines (scripts/lib/groups.mjs).
 *   - Never a street address. A meeting place name is used only when the leader chose "exact" in
 *     PCO and it has no digits; "approximate"/"hidden" show only the parsed area, if any.
 */
export function normalizeGroups(raw, { groupTypeId, source }) {
  const out = [];
  for (const g of raw) {
    if (String(g.group_type_id) !== String(groupTypeId)) continue; // Church Center mixes in ministry/serve groups
    if (g.listed !== true || g.archived) continue; // fail closed: unknown visibility is not published
    const id = String(g.id);
    const exactPlace = g.location?.display_preference === 'exact' ? g.location.name?.trim() || null : null;
    const card = groupCard({ description: g.description, schedule: g.schedule, locationName: fixChurchName(exactPlace) });
    out.push({
      id,
      title: String(g.title || '').trim(),
      schedule: card.schedule,
      area: card.area,
      audience: card.audience,
      virtual: Boolean(g.virtual),
      enrollment: { status: g.enrollment?.status || null, strategy: g.enrollment?.strategy || null },
      image: null,
      url: g.url,
      updated_at: g.updated_at || null,
      source,
      _image_url: ownHeaderImage(g.image_url, id),
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/** Every key a published group may have. Anything else (a bio, an address) fails validation. */
export const GROUP_KEYS = ['id', 'title', 'schedule', 'area', 'audience', 'virtual', 'enrollment', 'image', 'url', 'updated_at', 'source'];

const isIso = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s));
const isUrl = (s) => typeof s === 'string' && /^https:\/\//.test(s);

/** Fail closed: a malformed feed is not published (the previous data for that feed stays). */
export function validateEvents(events) {
  const problems = [];
  for (const e of events) {
    const p = `event ${e.id}`;
    if (!e.id || !/^\d+$/.test(e.id)) problems.push(`${p}: bad id`);
    if (!e.title) problems.push(`${p}: missing title`);
    if (e.starts_at !== null && !isIso(e.starts_at)) problems.push(`${p}: bad starts_at`);
    if (e.ends_at !== null && !isIso(e.ends_at)) problems.push(`${p}: bad ends_at`);
    if (!isUrl(e.details_url)) problems.push(`${p}: details_url must be https`);
    if (e.register_url !== null && !isUrl(e.register_url)) problems.push(`${p}: register_url must be https`);
  }
  if (problems.length) throw new SyncError(`Validation failed:\n  - ${problems.join('\n  - ')}`);
}

export function validateGroups(groups) {
  const problems = [];
  for (const g of groups) {
    const p = `group ${g.id}`;
    if (!g.id) problems.push(`${p}: missing id`);
    if (!g.title) problems.push(`${p}: missing title`);
    if (!isUrl(g.url)) problems.push(`${p}: url must be https`);
    const extra = Object.keys(g).filter((k) => !GROUP_KEYS.includes(k) && k !== '_image_url');
    if (extra.length) problems.push(`${p}: unexpected field(s) ${extra.join(', ')} (only card fields are published)`);
    if (g.area !== null && (typeof g.area !== 'string' || /\d/.test(g.area))) problems.push(`${p}: area must be a place name without digits`);
    if (g.audience !== null && !AUDIENCES.includes(g.audience)) problems.push(`${p}: unknown audience "${g.audience}"`);
  }
  if (problems.length) throw new SyncError(`Validation failed:\n  - ${problems.join('\n  - ')}`);
}
