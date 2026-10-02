// What an event row or card shows, worked out once: the date block, a short "when" line, where,
// price and registration state. Events at the church say "At Spring of Life" instead of repeating
// the street address; the full address is on the event's own page.
import { site, buildTime, type SyncedEvent } from './content';
import { dateBadge, formatDateLabel, formatTimeLabel, formatRange, localDate } from './time.mjs';
import { registrationStatus, registrationLabel, eventPath } from './events.mjs';
import { syncedImage } from './media';
import { href } from './url';

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function eventDisplay(e: SyncedEvent) {
  const badge = e.starts_at ? dateBadge(e.starts_at) : null;
  const dateLabel = formatDateLabel(e);                 // "Sat, Oct 3" or "Thu, Oct 29 – Sat, Oct 31"
  const time = formatTimeLabel(e);                      // "6:00–9:00 pm", "All day" or null
  const multiDay = Boolean(e.starts_at) && dateLabel.includes('–');
  const weekday = badge ? title(badge.weekday) : null;  // "Sat"
  // Short line next to the date block: "Sat · 6:00–9:00 pm"; multi-day events spell out both dates.
  const when = multiDay ? [dateLabel, time !== 'All day' ? time : null].filter(Boolean).join(' · ') : [weekday, time].filter(Boolean).join(' · ');
  const atChurch = Boolean(e.location?.address?.includes(site.address.street));
  const place = e.location?.type === 'online' ? 'Online' : atChurch ? 'At Spring of Life' : e.location?.name ?? null;
  return {
    badge: badge ? { month: title(badge.month), day: badge.day } : null,
    isoDate: e.starts_at ? localDate(e.starts_at) : null,
    dateLabel,
    when: when || 'Date to be announced',
    fullWhen: formatRange(e),                           // "Sat, Oct 3 · 6:00–9:00 pm"
    place,
    price: e.price?.label ?? null,
    state: registrationStatus(e, buildTime),
    status: registrationLabel(e, buildTime),            // "Full", "Registration opens …", "Registration closed" or null
    moreDates: e.more_times.length,
    page: href(eventPath(e)),
    image: syncedImage(e.image),
  };
}

/** Group events by month for the Events page: [{ label: "October 2026", events }]. */
export function byMonth(events: SyncedEvent[]) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'long', year: 'numeric' });
  const groups: { label: string; events: SyncedEvent[] }[] = [];
  for (const e of events) {
    const label = e.starts_at ? fmt.format(new Date(e.starts_at)) : 'Date to be announced';
    const last = groups.at(-1);
    if (last?.label === label) last.events.push(e);
    else groups.push({ label, events: [e] });
  }
  return groups;
}
