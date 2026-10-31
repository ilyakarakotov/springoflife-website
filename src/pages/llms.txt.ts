import type { APIRoute } from 'astro';
import { site, ministries, steps, groups, events, week, faq } from '../lib/content';
import { groupSummary, joinList } from '../lib/groups.mjs';
import { formatRange } from '../lib/time.mjs';
import { timeSpan } from '../lib/schedule.mjs';
import { eventPath } from '../lib/events.mjs';
import { absoluteUrl } from '../lib/url';

// /llms.txt (llmstxt.org): the plain facts an AI assistant needs to answer "Is there a kids ministry?"
// or "When is the English service?" and point people to the right page. Built from the same content
// files as the pages, so it never says something the site doesn't. No names of members or leaders
// beyond what the pages show, and nothing from the Life Group bios (they're never stored).
const plain = (s: string) => s.replace(/[  ⁠]/g, ' ');
const line = (title: string, url: string, note?: string) => `- [${title}](${url})${note ? `: ${note}` : ''}`;

export const GET: APIRoute = () => {
  const a = site.address;
  const lg = groupSummary(groups);
  const section = (group: string) => ministries.filter((m) => m.group === group);
  const ministry = (m: (typeof ministries)[number]) => {
    const facts = [m.summary, ...(m.details ?? [])].map((f) => (/[.!?]$/.test(f) ? f : `${f}.`)).join(' ');
    return line(m.title, m.href ? absoluteUrl(m.href) : absoluteUrl(`/ministries#${m.id}`), facts);
  };
  const out = [
    `# ${site.name}`,
    '',
    `> ${site.name} is a church in ${a.city}, Washington, that worships in English and in Russian. ${site.mission}`,
    '',
    `- English service: ${site.service.day}s at ${site.service.time}, ${site.service.length.toLowerCase()}. Childcare and activities for all ages during the service.`,
    `- Russian service: ${site.service.day}s at ${site.service.russian_time}. Russian-language website: ${site.links.russian_site}`,
    `- Address: ${a.street}, ${a.city}, ${a.region} ${a.postal_code}. Map: ${a.maps_url}`,
    `- Phone: ${site.phone}. Email: ${site.email}`,
    `- Everyone is welcome. First-time guests: ${absoluteUrl('/visit')}`,
    `- Live stream: ${site.links.youtube_live}. Sermons: ${site.links.sermons}`,
    `- Forms and registration are on Church Center: ${site.links.church_center}`,
    '',
    '## Every week',
    '',
    ...week.filter((d) => d.items.length).map((d) => `- ${d.name}: ${d.items.map((i) => [i.title, i.start !== null ? timeSpan(i.start, i.end) : null, i.detail].filter(Boolean).join(', ')).join('; ')}.`),
    '- Holidays and school breaks can change the schedule.',
    '',
    '## Common questions',
    '',
    ...faq.sections.flatMap((s) => s.questions).map((x) => `- ${x.q} ${x.a}`),
    '',
    '## Pages',
    '',
    line('Plan a visit', absoluteUrl('/visit'), 'service times, what to expect, kids on Sunday, getting here'),
    line('FAQ', absoluteUrl('/faq'), 'answers to common questions: worship, what to wear, parking, kids, beliefs'),
    line('About us', absoluteUrl('/about'), 'our story, what we believe (Baptist Faith and Message 2000), associations, pastors and leaders'),
    line('Ministries', absoluteUrl('/ministries'), 'kids, groups, missions, schools and serving'),
    line('Life Groups', absoluteUrl('/life-groups'), 'small groups during the week'),
    line('Events', absoluteUrl('/events'), 'special events with registration'),
    line('Next steps', absoluteUrl('/next-steps'), 'baptism, membership, serving, prayer requests and more'),
    line('Watch', absoluteUrl('/watch'), 'the latest sermon and the live stream'),
    line('Give', absoluteUrl('/give'), 'give online or by check'),
    '',
    '## Kids',
    '',
    ...section('kids').map(ministry),
    '',
    '## Groups',
    '',
    ...section('groups').map(ministry),
    ...(groups.length ? [`- ${lg.count} English Life Groups${lg.days.length ? ` meet on ${joinList(lg.days)}` : ''}${lg.places.length ? ` in ${joinList(lg.places)}` : ''}. Join on Church Center: ${site.links.groups}`] : []),
    '',
    '## Missions and serving',
    '',
    ...section('missions').map(ministry),
    ...section('serve').map(ministry),
    '',
    '## Schools',
    '',
    ...section('schools').map(ministry),
    '',
    '## Next steps',
    '',
    ...steps.map((s) => line(s.title, s.url.startsWith('/') ? absoluteUrl(s.url) : s.url, s.text)),
    '',
    '## Upcoming events',
    '',
    ...(events.length
      ? events.map((e) => line(e.title, absoluteUrl(eventPath(e)), [formatRange(e), e.summary].filter(Boolean).join('. ')))
      : [`- No special events are listed right now. All signups: ${site.links.signups}`]),
    '',
  ];
  return new Response(plain(out.join('\n')), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
