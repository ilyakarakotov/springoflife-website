// Life Group helpers shared by the sync (scripts/lib/groups.mjs) and the site (GroupCard).

/** Every audience label a group card can show ("Young Family Group" -> "young family"). */
export const AUDIENCES = ['young family', 'family', 'young adults', 'adults', "women's", "men's", 'couples', 'singles'];

/**
 * The one sentence a card may show, and only when the leaders labeled the group in PCO.
 * Wording from the bulletin ("study the Bible, pray together and fellowship").
 * @param {string | null | undefined} audience
 */
export const groupTagline = (audience) => (audience ? `A ${audience} group for Bible study, prayer and fellowship.` : null);

/**
 * Button text for a group, from its Church Center enrollment settings.
 * @param {{ status: string | null, strategy: string | null }} enrollment
 */
export function joinLabel(enrollment) {
  if (enrollment.status !== 'open') return 'See group on Church Center';
  return enrollment.strategy === 'open_signup' ? 'Join this group' : 'Request to join';
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_RE = /\b(mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?s?\b/gi;

/** "A", "A and B", "A, B and C". */
export function joinList(/** @type {string[]} */ items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Weekdays a group schedule mentions, as indexes 0 (Monday) to 6 (Sunday), in week order.
 * "Tuesdays, 7:00 pm" -> [1]. Unknown or empty -> [].
 * @param {string | null | undefined} schedule
 */
export function scheduleDays(schedule) {
  const days = new Set();
  for (const m of String(schedule ?? '').matchAll(DAY_RE)) {
    const i = WEEKDAYS.findIndex((d) => d.toLowerCase().startsWith(m[1].slice(0, 3).toLowerCase()));
    if (i >= 0) days.add(i);
  }
  return [...days].sort((a, b) => a - b);
}

/** Plural weekday name for an index: 1 -> "Tuesdays". */
export const dayName = (/** @type {number} */ i) => `${WEEKDAYS[i]}s`;

/**
 * Cities in a group's area: "Everett and Mukilteo" -> ["Everett", "Mukilteo"],
 * "Mukilteo (location varies)" -> ["Mukilteo"].
 * @param {string | null | undefined} area
 */
export function areaPlaces(area) {
  return String(area ?? '').replace(/\([^)]*\)/g, '').split(/,|\band\b|&|\//).map((s) => s.trim()).filter(Boolean);
}

/**
 * The days and places across all groups, for "Every week" and the home Life Groups band.
 * @param {Array<{ schedule: string | null, area: string | null }>} groups
 */
export function groupSummary(groups) {
  const days = [...new Set(groups.flatMap((g) => scheduleDays(g.schedule)))].sort((a, b) => a - b).map(dayName);
  const places = [...new Set(groups.flatMap((g) => areaPlaces(g.area)))].sort((a, b) => a.localeCompare(b));
  return { count: groups.length, days, places };
}

/**
 * Card order: by first meeting day (unknown last), then area, then name.
 * @template {{ title: string, schedule: string | null, area: string | null }} T
 * @param {T[]} groups
 * @returns {T[]}
 */
export function sortGroups(groups) {
  const key = (/** @type {T} */ g) => scheduleDays(g.schedule)[0] ?? 9;
  return [...groups].sort((a, b) => key(a) - key(b) || String(a.area ?? '~').localeCompare(String(b.area ?? '~')) || a.title.localeCompare(b.title));
}

/** Display name: "Mark and Louisa Nosov" -> "Mark & Louisa Nosov". */
export const groupDisplayTitle = (/** @type {string} */ title) => title.replace(/\s+and\s+/i, ' & ');

/** Two-letter monogram for a group without a photo: "Ivan and Sveta Ryakhovskiy" -> "IR". */
export function groupMonogram(/** @type {string} */ title) {
  const words = title.replace(/&|\band\b/gi, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return (words[0][0] + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase();
}

/** The one neutral line on every card: the group type when the leaders set it, else what every Life Group does. */
export const groupLine = (/** @type {string | null | undefined} */ audience) => groupTagline(audience) ?? 'Bible study, prayer and fellowship.';
