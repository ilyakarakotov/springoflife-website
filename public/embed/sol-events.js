/*! Spring of Life Church upcoming events widget v1. Docs: docs/SNAPPAGES-EVENTS-EMBED.md */
// Shows the website's upcoming events (feed/events.json) on another site, e.g. a SnapPages
// "Code" block:
//
//   <div data-sol-events data-src="https://HOST/feed/events.json" data-limit="3"></div>
//   <script src="https://HOST/embed/sol-events.js" defer></script>
//
// Options (attributes on the div):
//   data-src            feed URL (default: feed/events.json next to this script's folder)
//   data-limit          how many events, 1-12 (default 3)
//   data-heading-level  2-6, the level of each event title (default 3)
//   data-link           "site" (event pages on the new website) or "churchcenter"
//                       (default: "churchcenter" while the feed is a preview build, else "site")
//   data-align          "center": cards up to 420 px wide, the row and "See all events" centred
//                       (default: left-aligned, cards fill the row)
//
// Robust by design: no dependencies, styles in a Shadow DOM (the host page's CSS can't reach it),
// a 5-second timeout, an empty state and an error state that both link to Church Center, and
// nothing is ever thrown into the host page. The source is readable; the build minifies it.
(function () {
  'use strict';
  var FEED_VERSION = 1;
  var TIMEOUT_MS = 5000;
  var CHURCH_CENTER = 'https://springoflifechurch.churchcenter.com/registrations';
  var script = document.currentScript;

  var B = '1px solid #dcdcd6';
  var CSS = [
    // Inherited styles from the host page (color, text-align, text-transform...) stop here; only the font family and size come through.
    ':host{display:block}.sol{all:initial;display:block;color-scheme:light;font-family:inherit;font-size:inherit;color:#111316;line-height:1.5}',
    '*{box-sizing:border-box}',
    '.list{list-style:none;margin:0;padding:0;display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}',
    '.card,.msg{padding:16px;background:#fff;border:' + B + ';border-radius:16px}',
    // The whole card opens the event's details: the title link is stretched over it (and carries the
    // focus ring); Register and Details sit above that link as their own controls.
    '.card{position:relative;display:flex;gap:14px;align-items:flex-start;min-width:0;max-width:560px}',
    '.card:hover{border-color:#a9acb4;box-shadow:0 12px 28px -16px rgba(20,26,38,.4)}.card:hover .title a{text-decoration:underline}',
    '.title a:after{content:"";position:absolute;inset:0;border-radius:16px}.title a:focus-visible{outline:0}.title a:focus-visible:after{outline:3px solid #1f56d6;outline-offset:3px}',
    '.badge{flex:none;display:grid;justify-items:center;min-width:58px;padding:7px 8px;border-radius:12px;background:#eef2fc;line-height:1.1}',
    '.badge span{font-size:11px;font-weight:800;letter-spacing:.1em;color:#1d4fc4}',
    '.badge b{font-size:24px;font-weight:800}',
    '.body{min-width:0;flex:1;align-self:stretch;display:flex;flex-direction:column;align-items:flex-start;gap:4px}.body>:nth-last-child(2){margin-bottom:8px}',
    '.title{margin:0;font-size:1.08em;font-weight:800;line-height:1.25;overflow-wrap:anywhere}',
    '.title a{color:inherit;text-decoration:none}',
    'p{margin:0;font-size:.95em}.when{font-weight:700;color:#1d4fc4}.where{color:#464b54;overflow-wrap:anywhere}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.chip{padding:2px 10px;border-radius:999px;border:' + B + ';font-size:.84em;font-weight:700;white-space:nowrap}',
    '.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto}',
    '.btn{position:relative;z-index:1;display:inline-flex;align-items:center;min-height:44px;padding:10px 18px;border-radius:999px;background:#1f56d6;color:#fff;font-weight:700;text-decoration:none}',
    '.btn:hover{background:#1847b4}.q{background:#fff;color:#111316;border:1.5px solid #dcdcd6}.q:hover{background:#fff;border-color:#111316}',
    'a:focus-visible{outline:3px solid #1f56d6;outline-offset:3px;border-radius:6px}',
    '.more{margin-top:14px}.more a,.msg a{color:#1d4fc4;font-weight:700}',
    '.ph{height:150px;border-radius:16px;background:#f1f1ee}',
    '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    // data-align="center": cards at most 420 px wide; a row of 1 or 2 is only as wide as its cards and sits in the middle.
    '.c .n2{max-width:854px;margin:0 auto}.c .card{width:100%;max-width:420px;justify-self:center}.c .more,.c .msg{text-align:center}',
    '@media (prefers-reduced-motion:no-preference){.btn,.card{transition:background-color .2s,border-color .2s,box-shadow .2s}.card:active{transform:translateY(1px)}.ph{animation:p 1.4s ease-in-out infinite}@keyframes p{50%{opacity:.55}}}',
  ].join('');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }
  /** Only plain http(s) links from the feed are used. */
  function url(u) {
    return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null;
  }
  function link(href, text, attrs) {
    return '<a href="' + esc(href) + '"' + (attrs || '') + '>' + text + '</a>';
  }
  var NEW_TAB = ' target="_blank" rel="noopener"';
  var NEW_TAB_SR = '<span class="sr"> (opens in a new tab)</span>';

  function card(e, level, toChurchCenter) {
    var details = url(toChurchCenter ? e.church_center_url : e.details_url) || url(e.church_center_url) || url(e.details_url);
    var detailsAttrs = toChurchCenter ? NEW_TAB : ' target="_top"';
    var register = url(e.register_url);
    var b = e.badge || {};
    var when = [e.date_label, e.time_label].filter(Boolean).join(' · ');
    var where = [e.location_name, e.city].filter(Boolean).join(', ');
    var price = e.price_label || (e.free ? 'Free' : '');
    var chips = [price, e.status_label, e.more_dates > 0 ? '+' + e.more_dates + ' more date' + (e.more_dates > 1 ? 's' : '') : '']
      .filter(Boolean).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('');
    var title = esc(e.title);
    // Register when it's open, and always Details (the same page the card opens).
    var action = (register ? link(register, 'Register<span class="sr"> for ' + title + '</span>' + NEW_TAB_SR, ' class="btn"' + NEW_TAB) : '')
      + (details ? link(details, 'Details<span class="sr"> about ' + title + '</span>' + (toChurchCenter ? NEW_TAB_SR : ''), ' class="btn q"' + detailsAttrs) : '');
    return '<li class="card">'
      + (b.day ? '<div class="badge" aria-hidden="true"><span>' + esc(b.month) + '</span><b>' + esc(b.day) + '</b><span>' + esc(b.weekday) + '</span></div>' : '')
      + '<div class="body">'
      + '<h' + level + ' class="title">' + (details ? link(details, title, detailsAttrs) : title) + '</h' + level + '>'
      + (when ? '<p class="when">' + esc(when) + '</p>' : '')
      + (where ? '<p class="where">' + esc(where) + '</p>' : '')
      + (chips ? '<p class="chips">' + chips + '</p>' : '')
      + (action ? '<div class="acts">' + action + '</div>' : '')
      + '</div></li>';
  }

  function load(src) {
    return new Promise(function (resolve, reject) {
      if (!src || typeof fetch !== 'function') return reject(new Error('unsupported'));
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); reject(new Error('timeout')); }, TIMEOUT_MS);
      fetch(src, { credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (feed) {
          clearTimeout(timer);
          if (!feed || feed.version !== FEED_VERSION || !Array.isArray(feed.events)) throw new Error('unknown feed');
          resolve(feed);
        })
        .catch(function (err) { clearTimeout(timer); reject(err); });
    });
  }

  function init(host) {
    if (host.shadowRoot || host.getAttribute('data-sol-ready') != null) return;
    host.setAttribute('data-sol-ready', '');
    var root = host.attachShadow({ mode: 'open' });
    var limit = Math.min(12, Math.max(1, parseInt(host.getAttribute('data-limit'), 10) || 3));
    var level = /^[2-6]$/.test(host.getAttribute('data-heading-level') || '') ? host.getAttribute('data-heading-level') : '3';
    var cls = host.getAttribute('data-align') === 'center' ? 'sol c' : 'sol';
    var src = null;
    try { src = new URL(host.getAttribute('data-src') || '../feed/events.json', (script && script.src) || location.href).href; } catch (e) { /* error state below */ }

    function render(html, busy) {
      root.innerHTML = '<style>' + CSS + '</style><div class="' + cls + '"' + (busy ? ' aria-busy="true"' : '') + '>' + html + '</div>';
    }
    function message(text, href, label) {
      render('<p class="msg">' + esc(text) + ' ' + link(href, esc(label) + NEW_TAB_SR, NEW_TAB) + '</p>');
    }

    var placeholders = '';
    for (var i = 0; i < Math.min(limit, 3); i++) placeholders += '<li class="ph"></li>';
    render('<ul class="list" aria-hidden="true">' + placeholders + '</ul><p class="sr">Loading upcoming events…</p>', true);

    load(src).then(function (feed) {
      var now = Date.now();
      var events = feed.events.filter(function (e) {
        return e && e.title && !(e.live_until && Date.parse(e.live_until) <= now); // ended since the feed was built
      }).slice(0, limit);
      var site = feed.site || {};
      var signups = url(site.signups_url) || CHURCH_CENTER;
      if (!events.length) return message('No upcoming public events right now.', signups, 'See all signups on Church Center');
      var mode = host.getAttribute('data-link');
      var toChurchCenter = mode ? mode === 'churchcenter' : feed.preview === true;
      var all = toChurchCenter ? signups : url(site.events_url) || signups;
      render('<ul class="list n' + Math.min(events.length, 3) + '" aria-label="Upcoming events">' + events.map(function (e) { return card(e, level, toChurchCenter); }).join('') + '</ul>'
        + '<p class="more">' + link(all, 'See all events' + (toChurchCenter ? NEW_TAB_SR : ''), toChurchCenter ? NEW_TAB : ' target="_top"') + '</p>');
    }).catch(function () {
      message('Events couldn’t be loaded right now.', CHURCH_CENTER, 'See upcoming events on Church Center');
    });
  }

  function start() {
    try {
      var hosts = document.querySelectorAll('[data-sol-events]');
      for (var i = 0; i < hosts.length; i++) {
        try { init(hosts[i]); } catch (e) { /* never break the host page */ }
      }
    } catch (e) { /* never break the host page */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
