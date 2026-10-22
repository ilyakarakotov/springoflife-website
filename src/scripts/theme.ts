// The footer's theme switch (Footer.astro): Auto follows the device, Light and Dark override it.
// The choice is kept in localStorage on this device only (no cookie) and applied before first paint
// by the inline script in Base.astro. Here: show the switch, mark the current choice, apply clicks.
const KEY = 'sol-theme';
type Theme = 'auto' | 'light' | 'dark';

function stored(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch { return 'auto'; }
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  // The browser bar colour: forced themes set both entries; Auto restores light/dark by media query.
  const [light, dark] = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (light) light.content = theme === 'dark' ? '#0d0f12' : '#ffffff';
  if (dark) dark.content = theme === 'light' ? '#ffffff' : '#0d0f12';
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch { /* private mode: the choice lasts for this page only */ }
}

export function initThemeSwitch() {
  const group = document.querySelector<HTMLElement>('[data-theme-switch]');
  if (!group) return;
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('[data-theme-value]')];
  const mark = (theme: Theme) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeValue === theme)));
  mark(stored());
  group.hidden = false;
  group.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-theme-value]');
    if (!b) return;
    const theme = b.dataset.themeValue as Theme;
    apply(theme);
    mark(theme);
  });
}
