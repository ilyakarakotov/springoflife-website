// The weekly schedule (WeekList.astro, WeekGrid.astro): marks today, in church time, and on the
// week grid moves the current-time line. Both only reveal or move things that already hold their
// place, so nothing shifts. Checked once a minute, so a page left open past midnight moves on.
import { TZ } from '../lib/time.mjs';

const clock = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function mark() {
  const parts = Object.fromEntries(clock.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  document.querySelectorAll<HTMLElement>('[data-week] [data-day]').forEach((day) => {
    const today = day.dataset.day === parts.weekday;
    day.toggleAttribute('data-today', today);
    if (today) day.setAttribute('aria-current', 'date');
    else day.removeAttribute('aria-current');
  });
  // The line shows only within the hours the grid draws. A custom property set from script is
  // allowed by the CSP (only inline style attributes in the HTML are blocked).
  document.querySelectorAll<HTMLElement>('[data-week-grid]').forEach((grid) => {
    const since = minutes - Number(grid.dataset.from);
    grid.style.setProperty('--now', String(since));
    grid.toggleAttribute('data-now', since >= 0 && minutes <= Number(grid.dataset.to));
  });
}

export function initWeek() {
  if (!document.querySelector('[data-week]')) return;
  mark();
  setInterval(mark, 60_000);
}
