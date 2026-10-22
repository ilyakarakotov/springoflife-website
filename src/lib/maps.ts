// Map links for "Get directions" (Directions.astro, the Visit page). Google: the church's maps_url
// from site.yaml, or a search for another address. Apple Maps: directions to the same address.
import { site } from './content';

const a = site.address;
export const churchAddress = `${a.street}, ${a.city}, ${a.region} ${a.postal_code}`;

export function mapLinks(address?: string) {
  const full = address ?? churchAddress;
  return {
    full,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(full)}`,
    google: address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : a.maps_url,
  };
}
