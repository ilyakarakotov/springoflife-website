// The phone menu (Header.astro), loaded with the site's other scripts (src/scripts/site.ts).
// Without JavaScript the toggle is hidden and the links show as a plain list
// (Header.astro, @media (scripting: none)). While the menu is open:
//   - focus moves to the first link, Escape closes it and returns focus to the toggle;
//   - the skip link, <main> and <footer> are inert, so Tab stays in the header and screen
//     readers don't wander into the page behind the menu;
//   - the page behind doesn't scroll.
const header = document.querySelector<HTMLElement>('[data-header]');
const btn = document.querySelector<HTMLButtonElement>('[data-menu-btn]');
const nav = document.getElementById('site-nav');
if (header && btn && nav) {
  const isOpen = () => header.hasAttribute('data-open');
  const set = (open: boolean, { returnFocus = false } = {}) => {
    if (open === isOpen()) return;
    header.toggleAttribute('data-open', open);
    btn.setAttribute('aria-expanded', String(open));
    document.documentElement.style.overflow = open ? 'hidden' : '';
    for (const el of document.querySelectorAll<HTMLElement>('.skip-link, main, footer')) el.inert = open;
    if (open) nav.querySelector<HTMLElement>('a')?.focus();
    else if (returnFocus) btn.focus();
  };
  btn.addEventListener('click', () => set(!isOpen()));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); set(false, { returnFocus: true }); }
  });
  // A link to a section of the current page (e.g. /ministries/#kids) must close the menu.
  nav.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) set(false); });
  matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) set(false); });
}

export {}; // a module, not a global script (its names stay its own)
