// The site's scripts in one small cached file (Base.astro): the phone menu, the motion (arrivals and
// the Home header) and the click-to-load Subsplash embeds. One request instead of four on Home, so
// they don't compete with the hero photo. Page-specific scripts (the Life Groups filter, the 404
// redirects) stay with their pages.
import './menu';
import './motion';
import { initFacades } from './facade';

initFacades();
