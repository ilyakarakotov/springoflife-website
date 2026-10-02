// Small fetch wrapper: timeouts, bounded retries (429/503 honour Retry-After, otherwise back off),
// JSON:API pagination, and a request counter for the summary. No unbounded loops.
export class SyncError extends Error {}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scrub = (url) => String(url).replace(/(signature|token|expires_at)=[^&]+/g, '$1=…');

/**
 * Seconds to wait from a Retry-After header ("120" or an HTTP date), or null if absent/invalid.
 * @param {string | null} value
 * @param {number} nowMs
 */
export function retryAfterSeconds(value, nowMs = Date.now()) {
  if (value == null || value.trim() === '') return null;
  if (/^\s*\d+\s*$/.test(value)) return Number(value);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, (at - nowMs) / 1000);
}

export function createHttp({ fetchImpl = globalThis.fetch, maxAttempts = 4, timeoutMs = 20_000, maxRetryAfterS = 60, sleep = defaultSleep, log = () => {}, now = Date.now } = {}) {
  let count = 0;

  async function request(url, init = {}) {
    for (let attempt = 1; ; attempt++) {
      count++;
      let res;
      try {
        res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        if (attempt >= maxAttempts) throw new SyncError(`Network error after ${attempt} attempts for ${scrub(url)}: ${err.message}${err.cause ? ` (${err.cause.code || err.cause.message})` : ""}`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxAttempts) throw new SyncError(`HTTP ${res.status} after ${attempt} attempts for ${scrub(url)}`);
        // Retry-After is seconds or an HTTP date. Without one (or on other 5xx) back off 2, 4, 8 s.
        const secs = retryAfterSeconds(res.headers.get('retry-after'), now());
        const wait = (res.status === 429 || res.status === 503) && secs !== null
          ? Math.min(Math.max(secs, 1), maxRetryAfterS) * 1000
          : 1000 * 2 ** attempt;
        log(`  HTTP ${res.status} from ${new URL(url).host}, retrying in ${Math.round(wait / 1000)}s (attempt ${attempt}/${maxAttempts})`);
        await res.body?.cancel().catch(() => {});
        await sleep(wait);
        continue;
      }
      return res;
    }
  }

  async function json(url, init = {}) {
    const res = await request(url, { ...init, headers: { Accept: 'application/json', ...init.headers } });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300);
      throw new SyncError(`HTTP ${res.status} for ${scrub(url)}${body ? `: ${body}` : ''}`);
    }
    try { return await res.json(); } catch { throw new SyncError(`Invalid JSON from ${scrub(url)}`); }
  }

  /** Follow JSON:API `links.next` (same host only). Returns { data, included: Map("Type:id" -> resource) }. */
  async function listAll(url, init = {}, { maxPages = 20 } = {}) {
    const host = new URL(url).host;
    const data = [], included = new Map();
    let next = url;
    for (let page = 1; next; page++) {
      if (page > maxPages) throw new SyncError(`Gave up after ${maxPages} pages: ${scrub(url)}`);
      const body = await json(next, init);
      if (!Array.isArray(body?.data)) throw new SyncError(`Unexpected response shape from ${scrub(next)}`);
      data.push(...body.data);
      for (const r of body.included ?? []) included.set(`${r.type}:${r.id}`, r);
      next = body.links?.next || null;
      if (next && new URL(next).host !== host) throw new SyncError(`Refusing cross-host pagination link: ${scrub(next)}`);
    }
    return { data, included };
  }

  return { request, json, listAll, get count() { return count; } };
}

/** Resolve a JSON:API relationship against the `included` map (to-one -> object|null, to-many -> array). */
export function rel(resource, name, included) {
  const d = resource.relationships?.[name]?.data;
  if (Array.isArray(d)) return d.map((x) => included.get(`${x.type}:${x.id}`)).filter(Boolean);
  return d ? included.get(`${d.type}:${d.id}`) ?? null : null;
}

/** IDs of a relationship without needing `included` (to-many -> string[], to-one -> string|null). */
export function relIds(resource, name) {
  const d = resource.relationships?.[name]?.data;
  if (Array.isArray(d)) return d.map((x) => String(x.id));
  return d ? String(d.id) : null;
}
