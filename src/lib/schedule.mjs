// The regular week, Monday to Sunday, for the weekly schedule (WeekList.astro, WeekGrid.astro) and
// /llms.txt. Built only from what staff already edit, so no time is typed twice:
//   the Sunday services   site.yaml (service.time and length, service.russian_time)
//   weekly ministries     ministry-links.yaml, the `weekly` line: "Tuesdays and Fridays, 4:30–8:40 pm · September–May"
//   Life Groups           their days (and time, when the leaders set one) from Planning Center
// The same files always give the same week.
import { scheduleDays, joinList, areaPlaces } from './groups.mjs';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Minutes the week grid draws an item for when it has no end time (it fades out). */
export const OPEN_END = 60;

/** The grid can show 6:00 am to 11:00 pm; a weekly time outside that fails the build (content.ts). */
export const EARLIEST = 6 * 60;
export const LATEST = 23 * 60;

const CLOCK = /(\d{1,2}):(\d{2})\s*(am|pm)?(?:\s*[–-]\s*(\d{1,2}):(\d{2}))?\s*(am|pm)\b/i;
const to24 = (/** @type {number} */ h, /** @type {string} */ ap) => (h % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0);

/**
 * The first time or time range in a line, in minutes after midnight.
 * "7:00–8:45 pm" -> { start: 1140, end: 1245 }, "6:30 pm" -> { start: 1110, end: null },
 * "11:30–1:00 pm" -> { start: 690, end: 780 }. No time -> null.
 * @param {string | null | undefined} text
 * @returns {{ start: number, end: number | null } | null}
 */
export function parseTimes(text) {
  const m = CLOCK.exec(String(text ?? ''));
  if (!m) return null;
  const [, h1, m1, ap1, h2, m2, ap2] = m;
  const valid = (/** @type {string} */ h, /** @type {string} */ min) => Number(h) >= 1 && Number(h) <= 12 && Number(min) <= 59;
  if (!valid(h1, m1) || (h2 !== undefined && !valid(h2, m2))) return null;
  if (h2 === undefined) return { start: to24(Number(h1), ap2) * 60 + Number(m1), end: null };
  // "4:30–8:40 pm": both pm. "11:30–1:00 pm": the start is the other half of the day (11 > 1 on the clock).
  const startAp = ap1 ?? (Number(h1) % 12 > Number(h2) % 12 ? (ap2.toLowerCase() === 'pm' ? 'am' : 'pm') : ap2);
  const start = to24(Number(h1), startAp) * 60 + Number(m1);
  const end = to24(Number(h2), ap2) * 60 + Number(m2);
  return { start, end: end > start ? end : null };
}

/**
 * A ministry's `weekly` line. Text after " · " is a note.
 * "Wednesdays, 7:00–8:45 pm · September–May" -> { days: [2], start: 1140, end: 1245, note: 'September–May' }.
 * Null when it names no day or no time.
 * @param {string | null | undefined} text
 */
export function parseWeekly(text) {
  const [when, ...rest] = String(text ?? '').split(/\s*·\s*/);
  const days = scheduleDays(when);
  const times = parseTimes(when);
  if (!days.length || !times) return null;
  return { days, ...times, note: rest.join(' · ') || null };
}

/** "About 90 minutes" -> 90, "2 hours" -> 120, anything else -> null. */
export function durationMinutes(/** @type {string | null | undefined} */ text) {
  const s = String(text ?? '');
  const min = /(\d+)\s*min/i.exec(s);
  if (min) return Number(min[1]);
  const hours = /(\d+(?:\.\d+)?)\s*hours?\b/i.exec(s);
  return hours ? Math.round(Number(hours[1]) * 60) : null;
}

// No-break space before am/pm, like every time on the site (src/lib/text.mjs).
const NBSP = ' ';

/** 1110 -> "6:30 pm", 720 -> "12:00 pm". */
export function clock(/** @type {number} */ minutes) {
  const h = Math.floor(minutes / 60) % 24;
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, '0')}${NBSP}${h < 12 ? 'am' : 'pm'}`;
}

/** "7:00–8:45 pm", "11:30 am–1:00 pm", or "6:30 pm" when there's no end. */
export function timeSpan(/** @type {number} */ start, /** @type {number | null} */ end) {
  if (end === null) return clock(start);
  const sameHalf = (start < 720) === (end < 720);
  return `${sameHalf ? clock(start).split(NBSP)[0] : clock(start)}–${clock(end)}`;
}

/** "10 am", "12 pm": the hour labels of the week grid. */
export const hourLabel = (/** @type {number} */ hour) => `${hour % 12 || 12}${NBSP}${hour % 24 < 12 ? 'am' : 'pm'}`;

/**
 * @typedef {'service' | 'kids' | 'groups' | 'missions' | 'schools' | 'serve'} WeekKind
 * @typedef {{
 *   key: string, title: string, short: string, detail: string | null, href: string, external: boolean,
 *   kind: WeekKind, start: number | null, end: number | null,
 * }} WeekItem
 * @typedef {{ name: string, short: string, items: WeekItem[] }} WeekDay
 */

/**
 * The week, Monday first. Each day's items run by start time; items without a time (most Life
 * Groups) come last.
 * @param {{
 *   service: { day: string, time: string, length: string, russian_time: string },
 *   russianSite: string,
 *   ministries: Array<{ id: string, group: string, title: string, weekly?: string }>,
 *   groups: Array<{ schedule: string | null, area: string | null }>,
 * }} input
 * @returns {WeekDay[]}
 */
export function buildWeek({ service, russianSite, ministries, groups }) {
  /** @type {WeekItem[][]} */
  const days = DAYS.map(() => []);
  /** @param {number} day @param {Omit<WeekItem, 'short'>} item */
  const add = (day, item) => days[day].push({ ...item, short: item.title.replace(/^SOL\s+/, '') });

  const sunday = scheduleDays(service.day)[0] ?? 6;
  const russian = parseTimes(service.russian_time);
  if (russian) add(sunday, { key: 'russian-service', title: 'Russian service', detail: null, href: russianSite, external: true, kind: 'service', start: russian.start, end: null });
  const english = parseTimes(service.time);
  if (english) {
    const length = durationMinutes(service.length);
    add(sunday, { key: 'english-service', title: 'English service', detail: null, href: '/visit', external: false, kind: 'service', start: english.start, end: length ? english.start + length : null });
  }

  for (const m of ministries) {
    const w = parseWeekly(m.weekly);
    if (!w) continue;
    for (const d of w.days) {
      add(d, { key: `${m.id}-${d}`, title: m.title, detail: w.note, href: `/ministries#${m.id}`, external: false, kind: /** @type {WeekKind} */ (m.group), start: w.start, end: w.end });
    }
  }

  // Life Groups meeting on the same day at the same time (or with no time set) share one item:
  // "2 Life Groups", "Everett and Lynnwood".
  for (let d = 0; d < 7; d++) {
    /** @type {Map<number | null, { n: number, places: string[] }>} */
    const byTime = new Map();
    for (const g of groups) {
      if (!scheduleDays(g.schedule).includes(d)) continue;
      const start = parseTimes(g.schedule)?.start ?? null;
      const slot = byTime.get(start) ?? { n: 0, places: [] };
      byTime.set(start, { n: slot.n + 1, places: [...slot.places, ...areaPlaces(g.area)] });
    }
    for (const [start, { n, places }] of byTime) {
      add(d, {
        key: `life-groups-${d}-${start ?? 'any'}`, title: n === 1 ? 'Life Group' : `${n} Life Groups`,
        detail: joinList([...new Set(places)].sort((a, b) => a.localeCompare(b))) || null,
        href: '/life-groups', external: false, kind: 'groups', start, end: null,
      });
    }
  }

  return days.map((items, i) => ({
    name: DAYS[i],
    short: DAYS[i].slice(0, 3),
    items: items.sort((a, b) => (a.start ?? 24 * 60) - (b.start ?? 24 * 60) || a.title.localeCompare(b.title)),
  }));
}

/**
 * The hours the week grid shows: from the hour of the earliest start to the hour after the latest
 * end (an item without an end counts OPEN_END minutes). { from: 10, to: 21 } for the current week.
 * @param {WeekDay[]} week
 */
export function gridHours(week) {
  const timed = week.flatMap((d) => d.items).filter((i) => i.start !== null);
  if (!timed.length) return { from: 18, to: 21 };
  const from = Math.floor(Math.min(...timed.map((i) => /** @type {number} */ (i.start))) / 60);
  const to = Math.ceil(Math.max(...timed.map((i) => i.end ?? /** @type {number} */ (i.start) + OPEN_END)) / 60);
  return { from, to: Math.max(to, from + 1) };
}

/**
 * Where an item sits in the grid, in quarter hours from the top of the grid, and how it shares the
 * column with items it overlaps, the way a calendar app draws them:
 *   side    two items starting less than 45 minutes apart sit side by side ('left', 'right'), so
 *           both titles show
 *   indent  otherwise a later item steps in by the number of earlier items still running (at most 2)
 * @param {WeekItem[]} items one day's items
 * @param {number} fromHour
 */
export function gridPlaces(items, fromHour) {
  const endOf = (/** @type {WeekItem} */ i) => i.end ?? /** @type {number} */ (i.start) + OPEN_END;
  /** @type {Array<{ item: WeekItem, offset: number, length: number, indent: number, side: 'left' | 'right' | null, open: boolean }>} */
  const places = [];
  for (const item of items.filter((i) => i.start !== null)) {
    const start = /** @type {number} */ (item.start);
    const running = places.filter((p) => endOf(p.item) > start);
    const pair = running.length === 1 && running[0].side === null && running[0].indent === 0 && start - /** @type {number} */ (running[0].item.start) < 45;
    if (pair) running[0].side = 'left';
    places.push({
      item,
      offset: Math.round((start - fromHour * 60) / 15),
      length: Math.max(2, Math.round((endOf(item) - start) / 15)),
      indent: pair ? 0 : Math.min(running.length, 2),
      side: pair ? 'right' : null,
      open: item.end === null,
    });
  }
  return places;
}
