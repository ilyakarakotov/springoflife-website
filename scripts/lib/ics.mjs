// RFC 5545 calendar feed of the website events (public/events.ics).
// Deterministic on purpose: DTSTAMP comes from the event's updated_at, not the clock,
// so the file only changes when an event changes.
import { localDate, allDayLastDate } from '../../src/lib/time.mjs';

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** "2026-07-17" (+ days) -> "20260717" */
const icsDate = (ymd, addDays = 0) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + addDays)).toISOString().slice(0, 10).replace(/-/g, '');
};

/** Fold lines at 75 octets (UTF-8 safe), as the RFC requires. */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let cur = '', size = 0, limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (size + n > limit) { parts.push(cur); cur = ''; size = 0; limit = 74; }
    cur += ch; size += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function buildIcs(events, { siteUrl, calName = 'Spring of Life Church', domain = 'springoflifechurch.com' }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${calName}//Website events//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-TIMEZONE:America/Los_Angeles',
    `X-WR-CALDESC:${esc(`Public events at ${calName}. ${siteUrl}/events`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const e of events) {
    const times = [e.starts_at ? { starts_at: e.starts_at, ends_at: e.ends_at, all_day: e.all_day } : null, ...(e.more_times || [])].filter(Boolean);
    for (const t of times) {
      const where = [e.location?.name, e.location?.address].filter(Boolean).join(', ');
      const desc = [e.summary, e.price?.label ? `Cost: ${e.price.label}` : '', `Details and registration: ${e.details_url}`].filter(Boolean).join('\n\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:pco-signup-${e.id}-${utc(t.starts_at)}@${domain}`,
        `DTSTAMP:${utc(e.updated_at || t.starts_at)}`,
        ...(t.all_day
          // DTEND of an all-day event is exclusive: the day after the last day.
          ? [`DTSTART;VALUE=DATE:${icsDate(localDate(t.starts_at))}`, `DTEND;VALUE=DATE:${icsDate(allDayLastDate(t), 1)}`]
          : [`DTSTART:${utc(t.starts_at)}`, `DTEND:${utc(t.ends_at || t.starts_at)}`]),
        `SUMMARY:${esc(e.title)}`,
        `DESCRIPTION:${esc(desc)}`,
        ...(where ? [`LOCATION:${esc(where)}`] : []),
        `URL:${e.details_url}`,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
