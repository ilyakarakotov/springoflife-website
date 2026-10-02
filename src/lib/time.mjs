// Date/time helpers shared by the sync script (ICS, digest) and the Astro pages.
// Planning Center sends UTC; everything people read is shown in church time.
export const TZ = 'America/Los_Angeles';

const cache = new Map();
function fmt(opts) {
  const key = JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts }));
  return cache.get(key);
}

/** Local calendar date in church time, as YYYY-MM-DD. */
export function localDate(iso) {
  const p = Object.fromEntries(fmt({ year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** "6:00 pm" */
export function formatTime(iso) {
  return fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(iso)).replace(/\s?(AM|PM)$/, (m, ap) => ' ' + ap.toLowerCase());
}

/** "Sat, Oct 3" (add year: "Sat, Oct 3, 2026") */
export function formatDate(iso, { year = false, weekday = true } = {}) {
  return fmt({ weekday: weekday ? 'short' : undefined, month: 'short', day: 'numeric', year: year ? 'numeric' : undefined })
    .format(new Date(iso));
}

/** "Saturday, October 3" */
export function formatLongDate(iso, { year = false } = {}) {
  return fmt({ weekday: 'long', month: 'long', day: 'numeric', year: year ? 'numeric' : undefined }).format(new Date(iso));
}

/** Parts for a calendar-style date badge: { month: "OCT", day: "3", weekday: "SAT" } */
export function dateBadge(iso) {
  const d = new Date(iso);
  return {
    month: fmt({ month: 'short' }).format(d).toUpperCase(),
    day: fmt({ day: 'numeric' }).format(d),
    weekday: fmt({ weekday: 'short' }).format(d).toUpperCase(),
  };
}

/** Noon (church time) on a YYYY-MM-DD date, as an ISO instant: safe to format as that date. */
const middayOf = (ymd) => `${ymd}T20:00:00Z`;

/**
 * Human range for one occurrence:
 *  same day   -> "Sat, Oct 3 · 6:00–9:00 pm"
 *  multi-day  -> "Thu, Oct 29, 6:00 pm – Sat, Oct 31, 12:00 pm"
 *  all-day    -> "Sat, Oct 3" or "Wed, Sep 9, 2026 – Wed, May 26, 2027"
 */
export function formatRange({ starts_at, ends_at, all_day }) {
  if (!starts_at) return 'Date to be announced';
  if (all_day) {
    const first = localDate(starts_at), last = allDayLastDate({ starts_at, ends_at });
    if (first === last) return formatDate(middayOf(first));
    const crossYear = first.slice(0, 4) !== last.slice(0, 4);
    return `${formatDate(middayOf(first), { year: crossYear })} – ${formatDate(middayOf(last), { year: crossYear })}`;
  }
  const end = ends_at || starts_at;
  if (localDate(starts_at) === localDate(end)) {
    const a = formatTime(starts_at), b = formatTime(end);
    if (a === b) return `${formatDate(starts_at)} · ${a}`;
    const sameHalf = a.slice(-2) === b.slice(-2);
    return `${formatDate(starts_at)} · ${sameHalf ? a.slice(0, -3) : a}–${b}`;
  }
  return `${formatDate(starts_at)}, ${formatTime(starts_at)} – ${formatDate(end)}, ${formatTime(end)}`;
}

/** Date part of an occurrence for display: "Sat, Oct 3" or "Sat, Oct 3 – Mon, Oct 5". */
export function formatDateLabel({ starts_at, ends_at, all_day }) {
  if (!starts_at) return 'Date to be announced';
  const first = localDate(starts_at);
  const last = all_day ? allDayLastDate({ starts_at, ends_at }) : localDate(ends_at || starts_at);
  if (first === last) return formatDate(middayOf(first));
  return `${formatDate(middayOf(first))} – ${formatDate(middayOf(last))}`;
}

/** Time part for display: "6:00–9:00 pm", "All day", or null when there is no date. */
export function formatTimeLabel({ starts_at, ends_at, all_day }) {
  if (!starts_at) return null;
  if (all_day) return 'All day';
  const end = ends_at || starts_at;
  const a = formatTime(starts_at), b = formatTime(end);
  if (a === b || localDate(starts_at) !== localDate(end)) return a;
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** ISO 8601 with the church's UTC offset, for schema.org ("2026-10-03T18:00:00-07:00"). */
export function isoWithOffset(iso) {
  const d = new Date(iso);
  const parts = Object.fromEntries(fmt({
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const offset = parts.timeZoneName.replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/** The church's UTC offset at an instant, in milliseconds (PDT -> -25200000). */
function offsetMs(ms) {
  const off = isoWithOffset(new Date(ms).toISOString()).slice(-6); // "-07:00"
  const [h, m] = off.slice(1).split(':').map(Number);
  return (off[0] === '-' ? -1 : 1) * (h * 60 + m) * 60_000;
}

/**
 * Midnight (church time) of the local day containing `iso`, plus `days`, as a UTC Date.
 * DST-safe: the offset is looked up at local midnight itself, not at noon (on Nov 1 2026 and
 * Mar 14 2027 midnight and noon have different offsets).
 */
export function startOfLocalDay(iso, days = 0) {
  const [y, m, d] = localDate(iso).split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d + days); // local midnight, written as if it were UTC
  let t = wall - offsetMs(wall);
  t = wall - offsetMs(t); // settle: the first guess can sit on the other side of a DST change
  return new Date(t);
}

const isLocalMidnight = (iso) => isoWithOffset(iso).slice(11, 19) === '00:00:00';

/**
 * Last local date (YYYY-MM-DD) of an all-day occurrence. Planning Center keeps the underlying
 * times on all-day signups (AWANA: 7:00-8:45 pm), but an end stored at exactly local midnight is
 * exclusive and belongs to the day before. Both encodings give the same, inclusive last day.
 */
export function allDayLastDate({ starts_at, ends_at }) {
  const end = ends_at || starts_at;
  if (new Date(end) > new Date(starts_at) && isLocalMidnight(end)) return localDate(new Date(new Date(end).getTime() - 1).toISOString());
  return localDate(end);
}

/** When an occurrence is over: its end, or for all-day events midnight after their last day. */
export function occurrenceEnd({ starts_at, ends_at, all_day }) {
  if (all_day) return startOfLocalDay(middayOf(allDayLastDate({ starts_at, ends_at })), 1);
  return new Date(ends_at || starts_at);
}
