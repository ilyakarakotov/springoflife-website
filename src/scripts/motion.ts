// The site's one motion script (rules and the CSS side: src/styles/motion.css).
//
// Header (Home): [data-solid] once the photo hero is behind it, or just before the hero's words
// would slide under the clear bar, whichever comes first. Inner pages need no script (the bar's
// glass fades in with a scroll-driven animation, Header.astro).
//
// Arrivals: things marked [data-reveal] that start below the first screen are held back
// ([data-pending]) and let go once, as they scroll into view: in reading order, 80 ms apart, like
// people taking their seats. Nothing on the first screen is ever hidden, and without JavaScript or
// with reduced motion nothing is held back at all.
//   data-reveal         fade up 14 px
//   data-reveal="lines" a heading whose lines rise from behind their own mask (plain-text headings;
//                       the original text node is put back when it has arrived)
//   data-reveal="photo" a frame that opens from a 5 % inset while its photo settles
const root = document.documentElement;
root.classList.add('js');

const header = document.querySelector<HTMLElement>('[data-header]');
const hero = document.querySelector<HTMLElement>('[data-hero]');
if (header && hero) {
  let solidAt = 0;
  let queued = false;
  const update = () => {
    queued = false;
    header.toggleAttribute('data-solid', scrollY > solidAt);
  };
  const words = hero.querySelector<HTMLElement>('[data-hero-text]');
  const measure = () => {
    const bar = header.offsetHeight;
    const end = hero.offsetTop + hero.offsetHeight - bar;
    const text = words ? words.getBoundingClientRect().top + scrollY - bar - 16 : end;
    solidAt = Math.max(8, Math.min(end, text));
    update();
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', measure, { passive: true });
  measure();
}

const LINE_STEP = 90;
const restore = new Map<Element, string>();

/** Words of a plain-text heading into masked spans; the screen-reader text stays whole. */
function split(el: HTMLElement) {
  const text = el.textContent ?? '';
  if (el.children.length || !text.trim()) { el.dataset.reveal = ''; return; }
  restore.set(el, text);
  el.setAttribute('aria-label', text.trim());
  const words = document.createElement('span');
  words.setAttribute('aria-hidden', 'true');
  // Only ordinary spaces separate words: "12:00 pm" keeps its no-break space.
  text.trim().split(/[ \t\r\n]+/).forEach((word, i) => {
    if (i) words.append(' ');
    const mask = document.createElement('span');
    const inner = document.createElement('span');
    mask.className = 'rl';
    inner.textContent = word;
    mask.append(inner);
    words.append(mask);
  });
  el.replaceChildren(words);
}

/** Number the lines as they're laid out now, then put the plain text back once they've arrived. */
function lines(el: HTMLElement, delay: number) {
  let top = -Infinity;
  let line = -1;
  for (const mask of el.querySelectorAll<HTMLElement>('.rl')) {
    if (mask.offsetTop > top + 2) { line++; top = mask.offsetTop; }
    (mask.firstElementChild as HTMLElement).style.setProperty('--l', String(line));
  }
  const text = restore.get(el);
  if (text === undefined) return;
  setTimeout(() => {
    el.textContent = text;
    el.removeAttribute('aria-label');
    restore.delete(el);
  }, delay + line * LINE_STEP + 1200);
}

if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
  const fold = innerHeight * 0.96;
  const held = [...document.querySelectorAll<HTMLElement>('[data-reveal]')].filter((el) => el.getBoundingClientRect().top > fold);
  if (held.length) {
    const io = new IntersectionObserver((entries) => {
      let k = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        io.unobserve(el);
        const delay = Math.min(k++, 6) * 80;
        el.style.setProperty('--d', `${delay}ms`);
        if (el.dataset.reveal === 'lines') lines(el, delay);
        el.removeAttribute('data-pending');
      }
    }, { rootMargin: '0px 0px -6% 0px' });
    for (const el of held) {
      if (el.dataset.reveal === 'lines') split(el);
      el.setAttribute('data-pending', '');
      io.observe(el);
    }
  }
}

export {}; // a module, not a global script (its names stay its own)
