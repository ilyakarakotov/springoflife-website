// Event helpers shared by the sync (scripts/) and the site (src/).
import { occurrenceEnd, formatDate } from './time.mjs';

/**
 * Whether an event still has an occurrence that hasn't ended. Events without a date are live.
 * @param {{ starts_at: string | null, ends_at: string | null, all_day: boolean, more_times?: Array<{ starts_at: string, ends_at: string | null, all_day: boolean }> }} e
 * @param {Date} now
 */
export function isLive(e, now) {
  if (!e.starts_at) return true;
  return [e, ...(e.more_times ?? [])].some((t) => occurrenceEnd(t).getTime() > now.getTime());
}

/**
 * Registration state for buttons and labels, worked out at build time:
 *   "open"       Register button
 *   "full"       sold out (signup cap reached, or every public ticket type full without a waitlist)
 *   "opens_soon" registration opens later (opens_at in the future)
 *   "closed"     registration closed
 *   "none"       announcement only, no registration
 * @param {{ register_url: string | null, registration: { open: boolean, full: boolean, opens_at?: string | null } }} e
 * @param {Date} now
 */
export function registrationStatus(e, now) {
  if (!e.register_url) return 'none';
  if (e.registration.full) return 'full';
  if (e.registration.open) return 'open';
  if (e.registration.opens_at && new Date(e.registration.opens_at) > now) return 'opens_soon';
  return 'closed';
}

/**
 * Short status text for cards and the feed: "Full", "Registration opens Sat, Oct 10",
 * "Registration closed", or null when registration is open or not needed.
 * @param {Parameters<typeof registrationStatus>[0]} e
 * @param {Date} now
 */
export function registrationLabel(e, now) {
  const state = registrationStatus(e, now);
  if (state === 'full') return 'Full';
  if (state === 'opens_soon' && e.registration.opens_at) return `Registration opens ${formatDate(e.registration.opens_at)}`;
  if (state === 'closed') return 'Registration closed';
  return null;
}

/**
 * URL slug of an event's own page: title words plus the Planning Center ID, so it is unique and a
 * renamed event can still be found by its ID ("intentional-parenting-3894463"). Titles without
 * Latin letters (e.g. Cyrillic) give just the ID.
 * @param {{ id: string, title: string }} e
 */
export function eventSlug(e) {
  const words = String(e.title).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
  let slug = '';
  for (const w of words) {
    if ((slug ? slug.length + 1 : 0) + w.length > 60) break;
    slug = slug ? `${slug}-${w}` : w;
  }
  return slug ? `${slug}-${e.id}` : String(e.id);
}

/** Site path of an event's page ("/events/intentional-parenting-3894463/"). */
export const eventPath = (/** @type {{ id: string, title: string }} */ e) => `/events/${eventSlug(e)}/`;

/** The PCO ID from an event page path, also from an old slug ("/events/old-name-3894463/" -> "3894463"). */
export function eventIdFromPath(/** @type {string} */ path) {
  return /^\/events\/(?:[^/]*-)?(\d+)\/?$/.exec(path)?.[1] ?? null;
}
