// Small typographic helpers applied when content is rendered. Content files stay as staff typed them.
//
// keepTimes: a time never breaks before its "am"/"pm" ("12:00 pm" wrapped as "12:00 / pm" in narrow
// cards). The space becomes a no-break space (U+00A0). Ranges keep working: "7:00–8:45 pm".
// Applied to every YAML string when it's loaded (src/lib/content.ts), to Markdown pages
// (satteriKeepTimes in astro.config.mjs), and to the event and group labels built from synced data.

const TIME_GAP = /(\d)[ \t]+(am|pm)\b/gi;

/** "Sundays at 12:00 pm" -> "Sundays at 12:00 pm". Non-strings pass through. */
export function keepTimes(value) {
  return typeof value === 'string' ? value.replace(TIME_GAP, '$1 $2') : value;
}

/** Deep copy of parsed YAML (or any JSON-like value) with keepTimes applied to every string. */
export function keepTimesDeep(value) {
  if (typeof value === 'string') return keepTimes(value);
  if (Array.isArray(value)) return value.map(keepTimesDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, keepTimesDeep(v)]));
  }
  return value;
}

/** keepTimes for every text node of a Markdown (mdast) tree, as a Sätteri plugin. */
export function satteriKeepTimes() {
  const walk = (node) => {
    if (node.type === 'text' && typeof node.value === 'string') node.value = keepTimes(node.value);
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  return {
    name: 'sol-keep-times',
    before(root, ctx) {
      const tree = JSON.parse(JSON.stringify(root));
      walk(tree);
      ctx.replaceNode(root, tree);
    },
  };
}
