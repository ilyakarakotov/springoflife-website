// Placeholders: text in [square brackets] marks wording that still has to come from the pastors or
// a ministry leader, e.g. "[Placeholder: rehearsal day and time]". Builds hide them, so visitors
// (and the pastors reviewing the preview) never see unfinished text:
//   - YAML (src/lib/content.ts): a bracketed span is cut from its string; a list item whose text
//     field is nothing but a placeholder (a ministry card, a next step) is left out entirely; a
//     required field that is still a placeholder fails the build with the field's name.
//   - Markdown pages (astro.config.mjs, a Sätteri mdast plugin): a paragraph or list item that starts with "[" is dropped,
//     inline "[…]" spans are cut, and a heading left with nothing under it goes too.
// SHOW_PLACEHOLDERS=true keeps them, marked with a yellow "Needs text" badge, for a draft build
// that shows the gaps. Markdown links ([text](url)) are not placeholders.

const SPAN = /\s*\[[^\]\n]*\]/g;
const HAS_SPAN = /\[[^\]\n]*\]/;

/** SHOW_PLACEHOLDERS=true (or 1): keep placeholders visible, with a badge. */
export function showPlaceholders(env = process.env) {
  return env.SHOW_PLACEHOLDERS === 'true' || env.SHOW_PLACEHOLDERS === '1';
}

/** Whole value is a placeholder ("[Placeholder: …]"). */
export function isPlaceholder(value) {
  return typeof value === 'string' && /^\s*\[/.test(value);
}

/** The string without its [bracketed] spans; null if nothing real is left. Strings without brackets are returned as they are. */
export function stripPlaceholders(value) {
  if (typeof value !== 'string' || !HAS_SPAN.test(value)) return value;
  const out = value.replace(SPAN, '').replace(/\s{2,}/g, ' ').trim();
  return out === '' ? null : out;
}

const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasWholePlaceholder = (obj) => Object.values(obj).some((v) => typeof v === 'string' && stripPlaceholders(v) === null);

/** Deep copy of parsed YAML with every placeholder removed (see the rules at the top). */
export function hidePlaceholders(value) {
  if (typeof value === 'string') return stripPlaceholders(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => (isRecord(v) && hasWholePlaceholder(v) ? null : hidePlaceholders(v)))
      .filter((v) => v !== null && v !== undefined);
  }
  if (isRecord(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const clean = hidePlaceholders(v);
      if (clean !== null && clean !== undefined) out[k] = clean;
    }
    return out;
  }
  return value;
}

/** First leaf in document order (the text a block starts with). */
function firstLeaf(node) {
  let n = node;
  while (n.children && n.children.length) n = n.children[0];
  return n;
}
const BLOCKS = new Set(['paragraph', 'listItem', 'blockquote', 'tableRow']);
const startsWithPlaceholder = (node) => {
  const leaf = firstLeaf(node);
  return leaf.type === 'text' && /^\s*\[/.test(leaf.value);
};
const isEmpty = (node) => (node.type === 'text' ? node.value.trim() === '' : Array.isArray(node.children) && node.children.every(isEmpty));

/**
 * remark plugin. Options: { show } (keep placeholders, marked with the class "needs-text").
 * @param {{ show?: boolean }} [options]
 */
export function remarkPlaceholders({ show = false } = {}) {
  const mark = (node) => {
    node.data ??= {};
    node.data.hProperties = { ...(node.data.hProperties ?? {}), className: ['needs-text'] };
  };
  const clean = (parent) => {
    if (!Array.isArray(parent.children)) return;
    parent.children = parent.children.flatMap((child) => {
      if (BLOCKS.has(child.type) && startsWithPlaceholder(child)) {
        if (show) { mark(child); return [child]; }
        return [];
      }
      if (child.type === 'text' && !show) {
        const value = child.value.replace(SPAN, '');
        return value.trim() === '' && HAS_SPAN.test(child.value) ? [] : [{ ...child, value }];
      }
      if (child.type === 'link' || child.type === 'code' || child.type === 'inlineCode') return [child];
      clean(child);
      if ((child.type === 'paragraph' || child.type === 'list' || child.type === 'listItem') && isEmpty(child)) return [];
      return [child];
    });
  };
  return (tree) => {
    clean(tree);
    // A heading with nothing left under it (before the next heading of the same or a higher level)
    // goes too. Walking backwards, emptied sub-headings are already gone when their parent is checked.
    if (show) return;
    const kids = tree.children;
    for (let i = kids.length - 1; i >= 0; i--) {
      const h = kids[i];
      if (h.type !== 'heading') continue;
      const next = kids[i + 1];
      if (!next || (next.type === 'heading' && next.depth <= h.depth)) kids.splice(i, 1);
    }
  };
}

/**
 * The same rules as a plugin for Sätteri, Astro's Markdown processor (`markdown.processor` in
 * astro.config.mjs). It cleans a plain copy of the tree and swaps the document root for it.
 * @param {{ show?: boolean }} [options]
 */
export function satteriPlaceholders(options = {}) {
  const clean = remarkPlaceholders(options);
  return {
    name: 'sol-placeholders',
    before(root, ctx) {
      const tree = JSON.parse(JSON.stringify(root));
      clean(tree);
      ctx.replaceNode(root, tree);
    },
  };
}
