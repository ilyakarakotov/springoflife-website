// schema.org structured data. Church is a Place (not an Organization subtype), so the home page
// publishes an Organization whose location is the Church. Events: only public, in-person events
// with a date and a street address (Google's Event rules since 2025).
import { site, buildTime, type SyncedEvent } from './content';
import { isoWithOffset, localDate, allDayLastDate } from './time.mjs';
import { registrationStatus } from './events.mjs';
import { absoluteUrl } from './url';

const siteUrl = (path = '/') => absoluteUrl(path);

const churchAddress = {
  '@type': 'PostalAddress',
  streetAddress: site.address.street,
  addressLocality: site.address.city,
  addressRegion: site.address.region,
  postalCode: site.address.postal_code,
  addressCountry: site.address.country,
};

export function churchJsonLd() {
  return [{
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl('/')}#organization`,
        name: site.name,
        url: siteUrl('/'),
        logo: siteUrl('/apple-touch-icon.png'),
        email: site.email,
        telephone: site.phone,
        sameAs: [site.links.youtube, site.links.instagram, site.links.facebook],
        location: { '@id': `${siteUrl('/')}#church` },
      },
      {
        '@type': 'Church',
        '@id': `${siteUrl('/')}#church`,
        name: site.name,
        url: siteUrl('/'),
        telephone: site.phone,
        address: churchAddress,
        geo: { '@type': 'GeoCoordinates', latitude: site.address.lat, longitude: site.address.lng },
        hasMap: site.address.maps_url,
      },
    ],
  }];
}

/** schema.org availability: SoldOut when full, PreOrder before registration opens, no offer when closed. */
function offersFor(e: SyncedEvent) {
  if (!e.price) return undefined;
  const state = registrationStatus(e, buildTime);
  if (state === 'closed') return undefined;
  return {
    '@type': 'Offer',
    url: e.register_url || e.details_url,
    price: (e.price.min_cents / 100).toFixed(2),
    priceCurrency: 'USD',
    availability: `https://schema.org/${state === 'full' ? 'SoldOut' : state === 'opens_soon' ? 'PreOrder' : 'InStock'}`,
    validFrom: e.registration.opens_at ? isoWithOffset(e.registration.opens_at) : undefined,
  };
}

/**
 * Event JSON-LD for one event's own page (Google requires one event per page, marked up on that
 * page). Only in-person events with a full US street address qualify; others get no markup.
 * @param pageUrl  absolute URL of the event page
 * @param imageUrl absolute URL of a 720px+ image
 */
export function eventJsonLd(e: SyncedEvent, { pageUrl, imageUrl }: { pageUrl: string; imageUrl?: string | null }) {
  if (!e.starts_at || e.location?.type !== 'address' || !e.location.address) return [];
  const postal = e.location.postal;
  const isChurch = /4711 116th St SW/i.test(e.location.address);
  const address = isChurch ? churchAddress : postal ? {
    '@type': 'PostalAddress',
    streetAddress: postal.street,
    addressLocality: postal.locality,
    addressRegion: postal.region,
    postalCode: postal.postal_code ?? undefined,
    addressCountry: postal.country,
  } : null;
  if (!address) return [];
  // All-day events use dates, not times (Google: "2026-07-13"), with an inclusive end date.
  const start = e.all_day ? localDate(e.starts_at) : isoWithOffset(e.starts_at);
  const end = e.all_day ? allDayLastDate(e) : e.ends_at ? isoWithOffset(e.ends_at) : undefined;
  return [{
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    description: e.summary || undefined,
    startDate: start,
    endDate: end,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: e.location.name || site.name, address },
    image: imageUrl ? [imageUrl] : undefined,
    url: pageUrl,
    offers: offersFor(e),
    organizer: { '@type': 'Organization', name: site.name, url: siteUrl('/') },
  }];
}
