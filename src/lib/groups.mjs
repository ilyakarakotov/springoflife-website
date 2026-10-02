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
  if (enrollment.status !== 'open') return 'Learn more';
  return enrollment.strategy === 'open_signup' ? 'Join this group' : 'Request to join';
}
