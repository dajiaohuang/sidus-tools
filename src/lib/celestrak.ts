/**
 * CelesTrak GP queries and TLE parsing, shared by the tools that look
 * satellites up by catalogue number or name.
 *
 * Etiquette matters here: CelesTrak asks that clients not re-request the same
 * elements repeatedly, and element sets are only updated a few times a day
 * anyway. Every response is therefore cached for two hours, in memory and in
 * localStorage, so a page reload or a repeated search costs nothing.
 */

/** One element set, with the name line CelesTrak returns above it. */
export type TleRecord = {
  /** NORAD catalogue number, read from line 1 (columns 3-7). */
  catnr: string
  name: string
  line1: string
  line2: string
}

export const CELESTRAK_GP_URL = 'https://celestrak.org/NORAD/elements/gp.php'
export const CELESTRAK_CATALOG_URL = 'https://celestrak.org/NORAD/elements/'
export const CELESTRAK_FETCH_TIMEOUT_MS = 10_000
/** CelesTrak etiquette: reuse a stored response for this long before re-asking. */
export const CELESTRAK_CACHE_TTL_MS = 2 * 60 * 60 * 1000
const CACHE_PREFIX = 'sidus.celestrak.'
/** Results shown for one search. A NAME query can match hundreds. */
export const CELESTRAK_MAX_RESULTS = 40

/**
 * CelesTrak GROUP names for the presets the swarm offers. These are the
 * endpoint's own group identifiers, not our invention, so they stay valid as
 * the catalogue changes.
 */
export const CELESTRAK_GROUPS = {
  stations: 'stations',
  starlink: 'starlink',
  gps: 'gps-ops',
  glonass: 'glo-ops',
  galileo: 'galileo',
  beidou: 'beidou',
  weather: 'weather',
  science: 'science',
} as const

export type CelestrakGroupId = keyof typeof CELESTRAK_GROUPS

/**
 * How a group request ended. A group is the mass path, so the caller has to be
 * able to tell "CelesTrak will not resend this" from "the request failed":
 * only the second one is worth an error, and the first one still has data.
 */
export type CelestrakGroupOutcome =
  | { ok: true; records: TleRecord[]; stale: boolean }
  | { ok: false; reason: 'throttled' | 'failed'; retryAfterMs: number | null }

export type CelestrakGroupOptions = {
  signal?: AbortSignal
  /** Called as the body arrives; total is null when the server sends no length. */
  onProgress?: (received: number, total: number | null) => void
}

/**
 * Every element set in a group. Groups run to thousands of satellites, so this
 * deliberately skips the per-search result cap; the two-hour cache is what
 * keeps the endpoint from being asked twice.
 *
 * CelesTrak enforces that etiquette itself: asking again for a group whose
 * elements have not changed since your last successful download is answered
 * with HTTP 403 and "GP data has not updated since your last successful
 * download of GROUP=... at <time>". That reply means the copy already on disk
 * IS the current answer, so it is served whatever age our own TTL assigns it.
 * The same holds for a request that never arrives: a stored copy beats nothing.
 */
export async function fetchCelestrakGroup(
  group: CelestrakGroupId,
  options: CelestrakGroupOptions = {},
): Promise<CelestrakGroupOutcome> {
  const url = `${CELESTRAK_GP_URL}?FORMAT=TLE&GROUP=${CELESTRAK_GROUPS[group]}`
  const cached = readCache(url)
  if (cached !== null) return { ok: true, records: parseTleRecords(cached), stale: false }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CELESTRAK_FETCH_TIMEOUT_MS)
  options.signal?.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      const stored = readCache(url, { anyAge: true })
      if (stored !== null) return { ok: true, records: parseTleRecords(stored), stale: true }
      return {
        ok: false,
        reason: response.status === 403 || response.status === 429 ? 'throttled' : 'failed',
        retryAfterMs: retryAfterMs(response.headers.get('Retry-After')),
      }
    }
    const text = await readBody(response, options.onProgress)
    const records = parseTleRecords(text)
    if (records.length > 0) writeCache(url, text)
    return { ok: true, records, stale: false }
  } catch {
    const stored = readCache(url, { anyAge: true })
    if (stored !== null) return { ok: true, records: parseTleRecords(stored), stale: true }
    return { ok: false, reason: 'failed', retryAfterMs: null }
  } finally {
    clearTimeout(timeout)
  }
}

/** Retry-After as milliseconds from now, for either of the forms HTTP allows. */
export function retryAfterMs(header: string | null): number | null {
  if (header === null) return null
  const trimmed = header.trim()
  if (trimmed === '') return null
  const seconds = Number(trimmed)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(trimmed)
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now())
}

/**
 * The body, reporting bytes as they land. A group runs to megabytes over a
 * phone connection, and a button that says nothing for that long reads as dead.
 */
async function readBody(
  response: Response,
  onProgress?: (received: number, total: number | null) => void,
): Promise<string> {
  const body = response.body
  if (!onProgress || !body) return response.text()
  const length = Number(response.headers.get('Content-Length'))
  const total = Number.isFinite(length) && length > 0 ? length : null
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    text += decoder.decode(value, { stream: true })
    onProgress(received, total)
  }
  return text + decoder.decode()
}

/**
 * The query string for a lookup. All-digits is a catalogue number, anything
 * else is a name substring, matching what CelesTrak's own GP endpoint accepts.
 */
export function celestrakSelector(query: string): string {
  const trimmed = query.trim()
  if (trimmed === '') return ''
  return /^\d+$/.test(trimmed)
    ? `CATNR=${trimmed}`
    : `NAME=${encodeURIComponent(trimmed)}`
}

/** Full request URL for a query, or null when there is nothing to ask for. */
export function celestrakQueryUrl(query: string): string | null {
  const selector = celestrakSelector(query)
  return selector === '' ? null : `${CELESTRAK_GP_URL}?FORMAT=TLE&${selector}`
}

/** Catalogue number from a TLE's line 1, columns 3-7 in the fixed-width format. */
export function catnrOf(line1: string): string {
  return line1.slice(2, 7).trim()
}

/**
 * Every complete (name, line 1, line 2) triple in a TLE-format response.
 *
 * CelesTrak answers a NAME query with many triples back to back, and returns a
 * plain text error body ("No GP data found") with HTTP 200 when nothing
 * matches, so a caller cannot rely on the status alone: an empty list is the
 * signal.
 */
export function parseTleRecords(text: string): TleRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const out: TleRecord[] = []
  for (let i = 0; i < lines.length - 2; i++) {
    if (!lines[i + 1].startsWith('1 ') || !lines[i + 2].startsWith('2 ')) continue
    out.push({
      catnr: catnrOf(lines[i + 1]),
      name: lines[i],
      line1: lines[i + 1],
      line2: lines[i + 2],
    })
    i += 2
  }
  return out
}

/** The three lines back in the form the SGP4 parser takes. */
export function tleText(record: TleRecord): string {
  return `${record.name}\n${record.line1}\n${record.line2}`
}

type CacheEntry = { fetchedAt: number; text: string }

const memoryCache = new Map<string, CacheEntry>()

function readEntry(url: string): CacheEntry | null {
  const inMemory = memoryCache.get(url)
  if (inMemory) return inMemory
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_PREFIX + url)
    if (!raw) return null
    const entry = JSON.parse(raw) as Partial<CacheEntry>
    if (typeof entry.text !== 'string' || typeof entry.fetchedAt !== 'number') return null
    memoryCache.set(url, entry as CacheEntry)
    return entry as CacheEntry
  } catch {
    return null
  }
}

/** The stored response, or null. `anyAge` ignores the TTL for the fallback path. */
function readCache(url: string, { anyAge = false }: { anyAge?: boolean } = {}): string | null {
  const entry = readEntry(url)
  if (entry === null) return null
  if (!anyAge && Date.now() - entry.fetchedAt > CELESTRAK_CACHE_TTL_MS) return null
  return entry.text
}

function writeCache(url: string, text: string): void {
  const entry: CacheEntry = { fetchedAt: Date.now(), text }
  memoryCache.set(url, entry)
  try {
    globalThis.localStorage?.setItem(CACHE_PREFIX + url, JSON.stringify(entry))
  } catch {
    /*
     * Storage full or disabled: the memory cache still spares the repeat
     * request, and a failure here must never surface as a fetch failure.
     * Measured headroom on Chrome: the Starlink group is 1,805,328 chars
     * (3.44 MB as UTF-16) and stores fine inside a roughly 10 MB origin
     * budget, with no effect on later small writes. An engine with a tighter
     * budget would drop this entry, which costs only the stale-copy fallback
     * the next time CelesTrak declines to resend.
     */
  }
}

/**
 * Looks a query up, cache first. Returns an empty list for "nothing found" and
 * throws only when the request itself failed, so callers can tell the two apart.
 */
export async function searchCelestrak(
  query: string,
  signal?: AbortSignal,
): Promise<TleRecord[]> {
  const url = celestrakQueryUrl(query)
  if (url === null) return []
  const cached = readCache(url)
  if (cached !== null) return parseTleRecords(cached).slice(0, CELESTRAK_MAX_RESULTS)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CELESTRAK_FETCH_TIMEOUT_MS)
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`CelesTrak responded ${response.status}`)
    const text = await response.text()
    const records = parseTleRecords(text)
    // Only a real answer is worth caching; an error body would poison it.
    if (records.length > 0) writeCache(url, text)
    return records.slice(0, CELESTRAK_MAX_RESULTS)
  } finally {
    clearTimeout(timeout)
  }
}
