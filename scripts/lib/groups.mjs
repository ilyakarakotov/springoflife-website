// Life Group cards, derived deterministically from Planning Center Groups.
//
// The group "description" is the leaders' bio, with family details (children's ages, spouses,
// jobs). The website never shows it and never stores it. Many leaders start the description with
// short header lines:
//
//   Meeting Day - Tuesday            Tue. 7PM - Mukilteo/Kirkland        Young Family Group
//   Meeting City - Everett           Michael & Anastasiya Sagun
//
// This module reads ONLY those header lines (it stops at the first line over 60 characters, and
// after 5 lines) and keeps only what matches a known pattern: meeting day, time, area and an
// audience label. Everything else (names, greetings, the bio) is ignored and never output.
// Rules and the expected output for the current groups: review-content §4.
import { parseDocument } from 'htmlparser2';
import { hasContactInfo } from './html.mjs';
import { AUDIENCES } from '../../src/lib/groups.mjs';

const BLOCK = new Set(['p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'blockquote', 'tr', 'table']);
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'svg']);

/** Plain-text lines of rich text: <br> and block ends become line breaks; tags stripped, entities decoded. */
export function textLines(html) {
  let out = '';
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.type === 'text') out += n.data;
      else if (n.type === 'tag') {
        const name = n.name.toLowerCase();
        if (SKIP.has(name)) continue;
        if (name === 'br') { out += '\n'; continue; }
        walk(n.children ?? []);
        if (BLOCK.has(name)) out += '\n';
      }
    }
  };
  walk(parseDocument(String(html ?? ''), { decodeEntities: true }).children);
  return out.split('\n').map((l) => l.replace(/[\s ]+/g, ' ').trim()).filter(Boolean);
}

// A weekday as people type it: "Tue", "Tue.", "Tues", "Tuesday", "Tuesdays". Never "Monroe" or "monthly".
const WEEKDAY = String.raw`(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)s?`;
const PLURAL = { mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays', thu: 'Thursdays', fri: 'Fridays', sat: 'Saturdays', sun: 'Sundays' };
// "Every other Tuesday", "1st and 3rd Friday", "monthly": not weekly, so "Tuesdays" would be wrong.
const NOT_WEEKLY = /\b(other|alternate|alternating|every\s+\w+\s+week|bi-?weekly|monthly|month|1st|2nd|3rd|4th|first|second|third|fourth|last)\b/i;
const DASH = '[-–—:]';
const RE = {
  day: new RegExp(`^meeting\\s*day\\s*${DASH}\\s*(?<day>.+)$`, 'i'),
  city: new RegExp(`^meeting\\s*(?:city|area|place|location)\\s*${DASH}\\s*(?<city>.+)$`, 'i'),
  time: new RegExp(`^meeting\\s*time\\s*${DASH}\\s*(?<time>.+)$`, 'i'),
  compact: new RegExp(`^(?<day>${WEEKDAY})\\.?,?\\s+(?<h>\\d{1,2})(?::(?<m>\\d{2}))?\\s*(?<ap>am|pm)\\s*[-–—]\\s*(?<city>.+)$`, 'i'),
  compactNoTime: new RegExp(`^(?<day>${WEEKDAY})\\.?\\s*[-–—]\\s*(?<city>.+)$`, 'i'),
  audience: /^(?<aud>young famil(?:y|ies)|famil(?:y|ies)|young adults?|adults|women'?s|men'?s|couples|singles)\s+group$/i,
};

/** "Tuesday" -> "Tuesdays"; "Tue & Thu" -> "Tuesdays and Thursdays"; no weekday or not weekly -> null. */
export function normalizeDays(text) {
  const s = String(text);
  if (NOT_WEEKLY.test(s)) return null;
  const days = [...s.matchAll(new RegExp(`\\b${WEEKDAY}\\b\\.?`, 'gi'))]
    .map((m) => PLURAL[m[1].toLowerCase().slice(0, 3)])
    .filter((d, i, a) => d && a.indexOf(d) === i);
  if (!days.length || days.length > 2) return null;
  return days.length === 1 ? days[0] : `${days[0]} and ${days[1]}`;
}

/** "7PM" / "7:30 pm" -> "7:00 pm" / "7:30 pm"; anything else -> null. */
export function normalizeTime(text) {
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(String(text));
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12 || Number(m[2] ?? 0) > 59) return null;
  return `${Number(m[1])}:${m[2] ?? '00'} ${m[3].toLowerCase()}`;
}

/**
 * "Mukilteo/Kirkland" -> "Mukilteo and Kirkland"; "Mukilteo (varies)" -> "Mukilteo (location varies)".
 * Anything with a digit (a street address), a non-letter character or over 40 characters is
 * dropped entirely, so no address can slip through.
 */
export function normalizeArea(text) {
  let s = String(text).trim();
  let varies = false;
  s = s.replace(/\s*\(\s*varies\s*\)\s*$/i, () => { varies = true; return ''; });
  const parts = s.split(/\s*(?:\/|,|&|\band\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.some((p) => /\d/.test(p) || p.length > 40 || !/^\p{L}[\p{L} .'’-]*$/u.test(p))) return null;
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  if (joined.length > 40) return null;
  return varies ? `${joined} (location varies)` : joined;
}

// Header label -> the normalized audience (one of AUDIENCES in src/lib/groups.mjs).
const AUDIENCE = [
  [/^young famil/i, 'young family'], [/^famil/i, 'family'], [/^young adult/i, 'young adults'], [/^adults/i, 'adults'],
  [/^women/i, "women's"], [/^men/i, "men's"], [/^couples/i, 'couples'], [/^singles/i, 'singles'],
];
export { AUDIENCES };

/** Parse the header lines of a group description. Returns only recognized, normalized fields. */
export function parseGroupHeader(html) {
  const found = { day: null, time: null, area: null, audience: null };
  const lines = textLines(html);
  for (const [i, line] of lines.entries()) {
    if (i >= 5 || line.length > 60) break; // past the header: the bio starts here and is never read
    let m;
    if ((m = RE.day.exec(line))) found.day ??= normalizeDays(m.groups.day);
    else if ((m = RE.time.exec(line))) found.time ??= normalizeTime(m.groups.time);
    else if ((m = RE.city.exec(line))) found.area ??= normalizeArea(m.groups.city);
    else if ((m = RE.compact.exec(line))) {
      found.day ??= normalizeDays(m.groups.day);
      found.time ??= normalizeTime(`${m.groups.h}:${m.groups.m ?? '00'} ${m.groups.ap}`);
      found.area ??= normalizeArea(m.groups.city);
    } else if ((m = RE.compactNoTime.exec(line))) {
      found.day ??= normalizeDays(m.groups.day);
      found.area ??= normalizeArea(m.groups.city);
    } else if ((m = RE.audience.exec(line))) {
      found.audience ??= AUDIENCE.find(([re]) => re.test(m.groups.aud))?.[1] ?? null;
    }
    // Anything else (the leaders' names, "Welcome!", a first sentence) is ignored, never output.
  }
  return found;
}

/**
 * The public fields of one group card. Precedence (review-content §4):
 *   schedule: the PCO "schedule" field as typed -> parsed "Day, time" -> parsed "Day" -> null
 *   area:     the PCO location name (pass it only when the leader chose "exact") if it has no
 *             digit -> the parsed area -> null
 *   audience: a recognized header line ("Young Family Group") -> null
 */
export function groupCard({ description, schedule, locationName }) {
  const h = parseGroupHeader(description);
  const typed = String(schedule ?? '').replace(/\s+/g, ' ').trim();
  const parsedSchedule = h.day ? (h.time ? `${h.day}, ${h.time}` : h.day) : null;
  const place = String(locationName ?? '').replace(/\s+/g, ' ').trim();
  return {
    schedule: typed && typed.length <= 80 && !hasContactInfo(typed) ? typed : parsedSchedule,
    area: place && !/\d/.test(place) && place.length <= 60 && !hasContactInfo(place) ? place : h.area,
    audience: h.audience,
  };
}

/**
 * A header image counts only if the leader uploaded it to this group (PCO stores uploads under
 * /uploads/group/header_image/<group id>/). Anything else, such as PCO's generic default
 * illustration, is treated as "no image" (review S6: real church photos only).
 */
export function ownHeaderImage(url, groupId) {
  if (!url) return null;
  let decoded = String(url);
  try { decoded = decodeURIComponent(decoded); } catch { /* keep */ }
  return decoded.includes(`/header_image/${groupId}/`) ? url : null;
}
