// The weekly schedule (WeekSchedule.astro): marks today, in church time, picks today in the phone
// day picker, and moves the current-time line on the calendar week. Everything here only reveals or
// moves things that already hold their place, so nothing shifts (the head script in Base.astro has
// already put the weekday on <html>, so the picker shows today from the first paint). Checked once a
// minute, so a page left open past midnight moves on to the new day, unless a day was picked by hand.
import { TZ } from '../lib/time.mjs';

const clock = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function mark() {
  const parts = Object.fromEntries(clock.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  document.documentElement.setAttribute('data-weekday', parts.weekday);
  document.querySelectorAll<HTMLElement>('[data-week] [data-day]').forEach((day) => {
    const today = day.dataset.day === parts.weekday;
    day.toggleAttribute('data-today', today);
    if (today) day.setAttribute('aria-current', 'date');
    else day.removeAttribute('aria-current');
  });
  document.querySelectorAll<HTMLElement>('[data-week]:not([data-picked])').forEach((schedule) => {
    const radio = schedule.querySelector<HTMLInputElement>(`.ws-pick[value="${parts.weekday}"]`);
    if (radio) radio.checked = true;
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
  const schedules = document.querySelectorAll<HTMLElement>('[data-week]');
  if (!schedules.length) return;
  schedules.forEach((schedule) => {
    // A day picked by hand stays picked.
    schedule.addEventListener('change', (e) => {
      if ((e.target as HTMLElement).matches('.ws-pick')) schedule.setAttribute('data-picked', '');
    });
    // "See Sunday" on an empty day picks the next day that has something, and moves focus to it.
    schedule.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((button) => {
      button.hidden = false;
      button.addEventListener('click', () => {
        const radio = schedule.querySelector<HTMLInputElement>(`.ws-pick[value="${button.dataset.pick}"]`);
        if (!radio) return;
        radio.checked = true;
        schedule.setAttribute('data-picked', '');
        radio.focus();
      });
    });
  });
  mark();
  setInterval(mark, 60_000);
}
