// Safe serialization of data that ends up inside an inline <script> element.
//
// JSON.stringify does not escape "<", so a Planning Center title or description containing the
// typed text "</script><img src=x onerror=…>" would close the JSON-LD block and inject markup.
// Escaping <, > and & as <, > and & keeps the JSON identical for every parser
// while making "</script>", "<!--" and "]]>" impossible inside the element. U+2028 and U+2029
// are escaped too: valid in JSON, but line terminators in older JavaScript parsers.

/** @param {unknown} data */
export function serializeJsonLd(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
