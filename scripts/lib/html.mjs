// Allowlist HTML cleaner for Planning Center rich text.
// PCO descriptions are staff-entered HTML ("<div><p><strong>…", "<div>line<br>line</div>").
// We rebuild them from a parsed DOM into a tiny, safe subset:
//   blocks: p, h3, ul/ol > li     inline: strong, em, a[href], br
// Everything else is unwrapped (text kept) or dropped (script, style, img, iframe…).
// Phone numbers and email addresses are redacted (best effort): the public site links to Church
// Center for contact details instead of republishing people's numbers.
import { parseDocument } from 'htmlparser2';

const DROP = new Set(['script', 'style', 'img', 'iframe', 'object', 'embed', 'video', 'audio', 'svg', 'form', 'input', 'button', 'select', 'textarea', 'noscript', 'template', 'head', 'title', 'meta', 'link']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const LISTS = new Set(['ul', 'ol']);
const BLOCKS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote', 'pre', 'center', 'main', 'aside', 'figure', 'figcaption', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'hr', 'li', ...HEADINGS, ...LISTS]);
const INLINE_MAP = { strong: 'strong', b: 'strong', em: 'em', i: 'em' };

// What counts as contact info (best effort). Deliberately NOT redacted: Zoom/meeting IDs
// ("845 1234 5678"), order numbers and passcodes (bare 10-digit runs), ISBNs, year ranges, times
// and Bible references. Formats common in this congregation (+7, +380, 8 (925) 123-45-67) are covered.
const CONTACT_WORD = String.raw`call|text|phone|cell|mobile|tel|whats\s?app|viber|telegram|signal|тел(?:ефон)?|звони\p{L}*|пиши\p{L}*`;
const CONTACT_PATTERNS = [
  { re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g }, // email
  { re: /[\w.+-]+\s*[[(]\s*at\s*[\])]\s*[\w-]+\s*[[(]\s*dot\s*[\])]\s*[a-z]{2,}/gi }, // "name [at] gmail [dot] com"
  { re: /\+\d(?:[\s().-]*\d){7,14}/g }, // international: + and 8-15 digits: +7 (925) 123-45-67, +380 67 123 4567
  { re: /(?<![\d-])8[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?![\d-])/g }, // RU/UA domestic: 8 (925) 123-45-67
  { re: /(?<![\d-])(?:1[\s.-])?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\d-])/g }, // (425) 555-0100, 425.555.0100, 067 123 4567
  { re: /(?<![\d-])\d{3}[-.]\d{4}(?![\d-])/g }, // local 7-digit: 555-0100
  { re: /(?<![\d-])\d{3}-\d{2}-\d{2}(?![\d-])/g }, // local 7-digit, RU/UA style: 123-45-67
  // Any 7-13 digit number right after a word like "call" or "text" ("Call 4255550100", "text 555 0100").
  { re: new RegExp(`(?<!\\p{L})(${CONTACT_WORD})(?!\\p{L})([^\\d\\n]{0,15})\\d(?:[\\s().-]?\\d){6,12}(?!\\d)`, 'giu'), keep: (_m, word, gap) => `${word}${gap}${REDACTED}` },
];
export const REDACTED = '[contact info on Church Center]';

export function redactContacts(text) {
  return CONTACT_PATTERNS.reduce((t, { re, keep }) => t.replace(re, keep ?? REDACTED), String(text));
}

/** Whether a string contains something that looks like a phone number or an email address. */
export function hasContactInfo(text) {
  return CONTACT_PATTERNS.some(({ re }) => { re.lastIndex = 0; const hit = re.test(String(text)); re.lastIndex = 0; return hit; });
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const squash = (s) => s.replace(/[ \s]+/g, ' ');

// 10-13 digits in a row (separators allowed): a phone number or a meeting ID inside a link
// ("?phone=4255550100", "zoom.us/j/84512345678"). Longer IDs (Facebook events) are fine.
const DIGIT_RUN = /(?<!\d)\d(?:[\s().-]?\d){9,12}(?![\s().-]?\d)/;

/** Only plain http(s) links survive, and never ones that carry a phone number or an email. */
function safeHref(href) {
  if (!href) return null;
  const h = href.trim();
  if (!/^https?:\/\//i.test(h)) return null; // mailto:/tel:/javascript:/relative links are dropped (text is kept)
  let decoded = h;
  try { decoded = decodeURIComponent(h); } catch { /* keep as is */ }
  let host = '';
  try { host = new URL(h).hostname.toLowerCase(); } catch { return null; }
  if (/(^|\.)(wa\.me|whatsapp\.com|viber\.com|viber\.click)$/.test(host)) return null; // personal chat links
  if (hasContactInfo(decoded) || DIGIT_RUN.test(decoded)) return null; // emails, phones, meeting IDs
  return h;
}

// Inline content is collected as tokens so we can split paragraphs on <br><br>.
function inlineTokens(node, out) {
  if (node.type === 'text') { out.push({ t: 'text', v: node.data }); return; }
  if (node.type !== 'tag') return;
  const name = node.name.toLowerCase();
  if (DROP.has(name)) return;
  if (name === 'br') { out.push({ t: 'br' }); return; }
  const tag = INLINE_MAP[name] || (name === 'a' && safeHref(node.attribs?.href) ? 'a' : null);
  if (tag) out.push({ t: 'open', tag, href: tag === 'a' ? safeHref(node.attribs.href) : null });
  for (const c of node.children || []) {
    if (c.type === 'tag' && BLOCKS.has(c.name.toLowerCase())) { out.push({ t: 'br' }); blockAsInline(c, out); out.push({ t: 'br' }); }
    else inlineTokens(c, out);
  }
  if (tag) out.push({ t: 'close', tag });
}

function blockAsInline(node, out) {
  for (const c of node.children || []) {
    // A nested block (a list inside a list item) starts on its own line: "One<br>Inner", not "OneInner".
    if (c.type === 'tag' && BLOCKS.has(c.name.toLowerCase())) { out.push({ t: 'br' }); blockAsInline(c, out); out.push({ t: 'br' }); }
    else inlineTokens(c, out);
  }
}

/** Render inline tokens to { html, text }, trimming leading/trailing breaks and whitespace. */
function renderInline(tokens) {
  let html = '', text = '';
  const open = [];
  for (const tok of tokens) {
    if (tok.t === 'text') { const v = redactContacts(squash(tok.v)); html += escapeHtml(v); text += v; }
    else if (tok.t === 'br') { html += '<br>'; text += '\n'; }
    else if (tok.t === 'open') {
      open.push(tok.tag);
      html += tok.tag === 'a' ? `<a href="${escapeHtml(tok.href)}" rel="noopener nofollow">` : `<${tok.tag}>`;
    } else if (tok.t === 'close') { const i = open.lastIndexOf(tok.tag); if (i >= 0) { open.splice(i, 1); html += `</${tok.tag}>`; } }
  }
  while (open.length) html += `</${open.pop()}>`;
  // A number split across tags ("Call <b>(425)</b> 555-0100") only shows up in the joined text.
  // If redacting the joined text finds more than the per-piece pass did, publish this block as
  // plain, fully redacted text (formatting and links in it are dropped).
  const joined = tokens.map((t) => (t.t === 'text' ? squash(t.v) : t.t === 'br' ? '\n' : '')).join('');
  const redactedJoined = redactContacts(joined);
  if (redactedJoined !== text) {
    text = redactedJoined;
    html = escapeHtml(redactedJoined).replace(/\n/g, '<br>');
  }
  html = html
    .replace(/(<br>\s*)+(<\/(strong|em|a)>)/g, '$2<br>')         // move a trailing break outside the closing tag
    .replace(/^(\s|<br>)+|(\s|<br>)+$/g, '')
    .replace(/(<(strong|em)>)\s*(<br>\s*)+/g, '$1')
    .replace(/<(strong|em)>\s*<\/\1>/g, '')
    .replace(/ (<br>)/g, '$1').replace(/(<br>) /g, '$1')
    .replace(/(<br>){2,}/g, '<br>');                            // paragraphs were split earlier; inside one, a single break
  text = text.split('\n').map((l) => l.trim()).join('\n').replace(/^\n+|\n+$/g, '').replace(/\n{2,}/g, '\n');
  return { html: html.trim(), text: text.trim() };
}

/** Split a token run into paragraphs on double <br>, re-opening any formatting that spans the split. */
function paragraphs(tokens) {
  const paras = [[]];
  const open = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.t === 'br') {
      let j = i; while (tokens[j + 1]?.t === 'br' || (tokens[j + 1]?.t === 'text' && !tokens[j + 1].v.trim() && tokens[j + 2]?.t === 'br')) j++;
      if (j > i) { paras.push(open.map((o) => ({ ...o }))); i = j; continue; }
    }
    if (tok.t === 'open') open.push(tok);
    if (tok.t === 'close') { const k = open.map((o) => o.tag).lastIndexOf(tok.tag); if (k >= 0) open.splice(k, 1); }
    paras[paras.length - 1].push(tok);
  }
  return paras;
}

function collectBlocks(nodes, blocks) {
  let run = [];
  const flush = () => {
    for (const p of paragraphs(run)) {
      const r = renderInline(p);
      if (r.text) blocks.push({ type: 'p', ...r });
    }
    run = [];
  };
  for (const node of nodes) {
    if (node.type !== 'tag') { inlineTokens(node, run); continue; }
    const name = node.name.toLowerCase();
    if (DROP.has(name)) continue;
    if (HEADINGS.has(name)) { flush(); const toks = []; blockAsInline(node, toks); const r = renderInline(toks); if (r.text) blocks.push({ type: 'h3', ...r }); continue; }
    if (LISTS.has(name)) {
      flush();
      const items = [];
      for (const li of node.children || []) {
        if (li.type !== 'tag') continue;
        const toks = []; blockAsInline(li, toks);
        const r = renderInline(toks); if (r.text) items.push(r);
      }
      if (items.length) blocks.push({ type: name, items });
      continue;
    }
    if (BLOCKS.has(name)) { flush(); collectBlocks(node.children || [], blocks); continue; }
    inlineTokens(node, run);
  }
  flush();
  return blocks;
}

/**
 * Clean PCO rich text.
 * @returns {{ html: string, text: string, blocks: Array }} html is safe to render with set:html.
 */
export function cleanHtml(input) {
  const doc = parseDocument(String(input ?? ''), { decodeEntities: true, lowerCaseTags: true });
  const blocks = collectBlocks(doc.children, []);
  const html = blocks.map((b) => (b.items
    ? `<${b.type}>${b.items.map((i) => `<li>${i.html}</li>`).join('')}</${b.type}>`
    : `<${b.type}>${b.html}</${b.type}>`)).join('\n');
  const text = blocks.map((b) => (b.items ? b.items.map((i) => `• ${i.text}`).join('\n') : b.text)).join('\n\n');
  return { html, text, blocks };
}

/** Short plain-text summary: the opening paragraph(s), at most `max` characters, cut on a word. */
export function summarize(blocks, max = 200) {
  let out = '';
  for (const b of blocks) {
    const t = (b.items ? b.items.map((i) => i.text).join('; ') : b.text).replace(/\n+/g, ' · ').trim();
    if (!t) continue;
    out = out ? `${out}${/[.!?…:]$/.test(out) ? ' ' : ' · '}${t}` : t;
    if (out.length >= 60) break;
  }
  out = out.replace(/\s+/g, ' ').trim();
  if (out.length <= max) return out;
  const cut = out.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[\s,;:·–-]+$/, '') + '…';
}
