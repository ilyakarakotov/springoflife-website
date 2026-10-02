// Click-to-load embeds. A third-party player or form (Subsplash) makes no request at all until
// the visitor asks for it: no trackers, cookies or video preloading on page load (brief: "no
// trackers or cookies by default"; review P1-11). Markup contract:
//
//   <div data-facade data-src="https://…" data-title="…" data-allow="fullscreen; …">
//     …poster…  <button type="button" data-facade-load>…</button>
//   </div>
//
// On click the facade's content is replaced by the iframe, which then gets keyboard focus.
// Without JavaScript the button is hidden by CSS (@media (scripting: none)) and the page's plain
// link to Subsplash is the way in.
export function initFacades(root: ParentNode = document) {
  for (const facade of root.querySelectorAll<HTMLElement>('[data-facade]:not([data-facade-ready])')) {
    facade.setAttribute('data-facade-ready', '');
    facade.querySelector('[data-facade-load]')?.addEventListener('click', () => {
      const src = facade.dataset.src;
      if (!src || !/^https:\/\//.test(src)) return;
      const frame = document.createElement('iframe');
      frame.src = src;
      frame.title = facade.dataset.title || 'Embedded content';
      if (facade.dataset.allow) frame.allow = facade.dataset.allow;
      if (facade.hasAttribute('data-fullscreen')) frame.allowFullscreen = true;
      facade.replaceChildren(frame);
      facade.classList.add('is-loaded');
      frame.focus();
    }, { once: true });
  }
}
