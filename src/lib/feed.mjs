// The public events feed (/feed/events.json): a small, stable JSON file for other sites, first of
// all the SnapPages widget (public/embed/sol-events.js). Schema: docs/SNAPPAGES-EVENTS-EMBED.md.
//
// Stability rules: version 1 fields are never renamed or removed. New optional fields may be
// added. A breaking change bumps `version`, and the widget refuses versions it doesn't know.
// Only public data: no descriptions with links, no street addresses, no PCO internals.
import { TZ, occurrenceEnd, formatDateLabel, formatTimeLabel, dateBadge } from './time.mjs';
import { registrationStatus, registrationLabel } from './events.mjs';

export const FEED_VERSION = 1;

/**
 * @param {Array<any>} events  synced events that are still live, soonest first
 * @param {{
 *   now: Date,
 *   preview: boolean,
 *   site: { name: string, url: string, events_url: string, signups_url: string },
 *   pageUrl: (e: any) => string,
 *   imageFor: (e: any) => { url: string, width: number, height: number } | null,
 * }} opts  every URL must already be absolute
 */
export function buildEventsFeed(events, { now, preview, site, pageUrl, imageFor }) {
  return {
    version: FEED_VERSION,
    generated_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    preview,
    timezone: TZ,
    site,
    events: events.map((e) => {
      const last = e.more_times?.length ? e.more_times.at(-1) : e;
      const state = registrationStatus(e, now);
      const image = imageFor(e);
      return {
        id: e.id,
        title: e.title,
        summary: e.summary || null,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        all_day: e.all_day,
        timezone: TZ,
        // When the last date is over. Clients hide the event after this, even if the file is stale.
        live_until: e.starts_at ? occurrenceEnd(last).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
        date_label: formatDateLabel(e),
        time_label: formatTimeLabel(e),
        badge: e.starts_at ? dateBadge(e.starts_at) : null,
        more_dates: e.more_times?.length ?? 0,
        location_name: e.location?.name ?? null,
        city: e.location?.city ?? e.location?.postal?.locality ?? null,
        price_label: e.price?.label ?? null,
        free: e.price ? e.price.free : null,
        image_url: image?.url ?? null,
        image_width: image?.width ?? null,
        image_height: image?.height ?? null,
        // Only while registration is open; otherwise use details_url / church_center_url.
        register_url: state === 'open' ? e.register_url : null,
        details_url: pageUrl(e),
        church_center_url: e.details_url,
        full: state === 'full',
        registration: state,
        status_label: registrationLabel(e, now),
      };
    }),
  };
}
