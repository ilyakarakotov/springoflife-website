// The site's scripts in one small cached file (Base.astro): the phone menu, the motion (arrivals and
// the Home header), the click-to-load Subsplash embeds and the late accent font. One request instead of four on Home, so
// they don't compete with the hero photo. Page-specific scripts (the Life Groups filter, the 404
// redirects) stay with their pages.
import './menu';
import './motion';
import { initFacades } from './facade';

initFacades();

// The accent serif (global.css --font-serif) is fetched only when a line set in it comes within
// about a screen of the viewport (they're all below the first screen), so it never competes with
// the hero photo. Until then, and without JavaScript, the metric-matched Georgia fallback shows.
const serif = document.querySelectorAll('.scripture, .story > p:last-child');
const late = () => document.documentElement.classList.add('fonts-late');
if (serif.length && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); late(); }
  }, { rootMargin: '0px 0px 80% 0px' });
  serif.forEach((el) => io.observe(el));
} else if (serif.length) late();
