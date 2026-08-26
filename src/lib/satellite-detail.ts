/**
 * Encyclopedic detail links for one satellite, resolved from live catalogues
 * rather than a local table of slugs.
 *
 * Gunter's Space Page (space.skyrocket.de) is the datasheet people want, but
 * its URLs are human-invented filenames with no NORAD key, so they cannot be
 * built from a TLE. Wikidata property P377 *is* the NORAD catalogue number,
 * and the English Wikipedia sitelink is the page Grokipedia mirrors. A
 * Wikipedia query then confirms the article still exists: Grokipedia answers
 * a bad slug with a genuine 404, the same check the site-marker tooltips do
 * by hand for Starbase.
 *
 * Mega-constellation members (Starlink and the other fleets below) have no
 * per-object article. The name gate skips the lookup so a hover in a crowd of
 * thousands does not hammer Wikidata. BeiDou is not gated: a few early
 * spacecraft have pages, later numbered buses do not, and the live lookup is
 * what hides the latter.
 */

export type SatelliteDetailLink = {
  href: string
  /** English Wikipedia title the Grokipedia slug was taken from. */
  title: string
}

export type ResolveSatelliteDetailOptions = {
  signal?: AbortSignal
  fetch?: typeof fetch
  now?: number
}

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'
/** Browser JS cannot set User-Agent; Wikimedia reads this instead. */
const API_USER_AGENT = 'SIDUS-tools/1.0 (https://sidus.tools; educational aerospace calculators)'
const FETCH_TIMEOUT_MS = 8_000
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MISS_TTL_MS = 24 * 60 * 60 * 1000
const ERROR_COOLDOWN_MS = 5 * 60 * 1000
const CACHE_PREFIX = 'sidus.sat-detail.'

/**
 * Families whose individual buses have no public encyclopedic page. SATCAT
 * and tracking sites still list them; that is not the kind of detail the
 * tooltip is offering.
 */
const MEGA_CONSTELLATION =
  /^(STARLINK|STARSHIELD|ONEWEB|KUIPER)(?:[-_\s]|$)/i

export function isMegaConstellationMember(name: string): boolean {
  return MEGA_CONSTELLATION.test(name.trim())
}

/** Grokipedia page URL for an English Wikipedia title. */
export function grokipediaUrlFromWikiTitle(title: string): string {
  return `https://grokipedia.com/page/${title.replace(/ /g, '_')}`
}

/**
 * How well a Wikipedia title matches the TLE name, for the case where one
 * catalogue number is claimed by both a complex and a module (ISS / Zarya).
 *
 * Modules, debris and parenthetical disambiguations lose to a plain title
 * unless the TLE name itself is that kind of object.
 */
export function wikiTitleScore(satName: string, wikiTitle: string): number {
  const name = satName.toUpperCase()
  const title = wikiTitle.toUpperCase()
  const nameTokens = tokensOf(name)
  const titleTokens = new Set(tokensOf(title))
  let score = 1
  for (const token of nameTokens) {
    if (titleTokens.has(token)) score += 8
  }
  if (nameTokens.includes('ISS') && title.includes('INTERNATIONAL SPACE STATION')) score += 24
  if (nameTokens.includes('HST') && title.includes('HUBBLE')) score += 24
  if (nameTokens.includes('CSS') && (title.includes('TIANHE') || title.includes('CHINESE SPACE STATION'))) {
    score += 24
  }
  if (/\bMODULE\b/.test(title) && !/\bMODULE\b/.test(name)) score -= 20
  if (/\bDEBRIS\b|\bR\/B\b|ROCKET BODY/.test(title) && !/DEBRIS|R\/B|ROCKET/.test(name)) score -= 24
  if (/\(.*\)/.test(wikiTitle) && !/\(.*\)/.test(satName)) score -= 3
  return score
}

type CacheEntry = { fetchedAt: number; href: string | null; title: string | null }

const memoryCache = new Map<string, CacheEntry>()
const errorUntil = new Map<string, number>()
const inflight = new Map<string, Promise<SatelliteDetailLink | null>>()

/** Drops in-memory and stored state so a test can start from an empty cache. */
export function resetSatelliteDetailCache(): void {
  memoryCache.clear()
  errorUntil.clear()
  inflight.clear()
  try {
    const storage = globalThis.localStorage
    if (!storage) return
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(CACHE_PREFIX)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    /* Storage disabled: memory is already empty. */
  }
}

/**
 * The encyclopedic page for this catalogue number, or null when none is
 * public. Null is a real answer and is cached: a missing Wikipedia page
 * must not be retried on every hover.
 */
export async function resolveSatelliteDetail(
  catnr: string,
  name: string,
  options: ResolveSatelliteDetailOptions = {},
): Promise<SatelliteDetailLink | null> {
  const id = catnr.trim()
  if (id === '' || isMegaConstellationMember(name)) return null

  const now = options.now ?? Date.now()
  const cached = readCache(id, now)
  if (cached !== undefined) return cached
  if ((errorUntil.get(id) ?? 0) > now) return null

  const pending = inflight.get(id)
  if (pending) return pending

  const request = lookup(id, name, options)
    .then((link) => {
      writeCache(id, link, options.now ?? Date.now())
      return link
    })
    .catch((err: unknown) => {
      const aborted =
        options.signal?.aborted ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError')
      if (!aborted) errorUntil.set(id, (options.now ?? Date.now()) + ERROR_COOLDOWN_MS)
      return null
    })
    .finally(() => {
      inflight.delete(id)
    })
  inflight.set(id, request)
  return request
}

async function lookup(
  catnr: string,
  name: string,
  options: ResolveSatelliteDetailOptions,
): Promise<SatelliteDetailLink | null> {
  const fetchImpl = options.fetch ?? fetch
  const qids = await searchWikidata(catnr, fetchImpl, options.signal)
  if (qids.length === 0) return null
  const titles = await wikiTitlesOf(qids, fetchImpl, options.signal)
  titles.sort((a, b) => wikiTitleScore(name, b) - wikiTitleScore(name, a))
  for (const title of titles) {
    if (await wikipediaArticleExists(title, fetchImpl, options.signal)) {
      return { href: grokipediaUrlFromWikiTitle(title), title }
    }
  }
  return null
}

async function searchWikidata(
  catnr: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<string[]> {
  for (const value of catalogQueryValues(catnr)) {
    const url = apiUrl(WIKIDATA_API, {
      action: 'query',
      list: 'search',
      srsearch: `haswbstatement:P377=${value}`,
      srlimit: '8',
      format: 'json',
      origin: '*',
    })
    const data = await getJson(fetchImpl, url, signal)
    const hits = asRecords(asObject(data.query)?.search)
    const ids = hits
      .map((hit) => (typeof hit.title === 'string' ? hit.title : ''))
      .filter((title) => /^Q\d+$/.test(title))
    if (ids.length > 0) return ids
  }
  return []
}

async function wikiTitlesOf(
  qids: string[],
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<string[]> {
  const url = apiUrl(WIKIDATA_API, {
    action: 'wbgetentities',
    ids: qids.join('|'),
    props: 'sitelinks',
    sitefilter: 'enwiki',
    format: 'json',
    origin: '*',
  })
  const data = await getJson(fetchImpl, url, signal)
  const entities = data?.entities
  if (!entities || typeof entities !== 'object') return []
  const titles: string[] = []
  for (const entity of Object.values(entities as Record<string, unknown>)) {
    const title = enwikiTitleOf(entity)
    if (title) titles.push(title)
  }
  return titles
}

async function wikipediaArticleExists(
  title: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<boolean> {
  const url = apiUrl(WIKIPEDIA_API, {
    action: 'query',
    titles: title,
    redirects: '1',
    prop: 'pageprops',
    format: 'json',
    origin: '*',
  })
  const data = await getJson(fetchImpl, url, signal)
  const pages = asObject(data.query)?.pages
  if (!pages || typeof pages !== 'object') return false
  for (const page of Object.values(pages as Record<string, unknown>)) {
    if (!page || typeof page !== 'object') continue
    const record = page as Record<string, unknown>
    if ('missing' in record) continue
    const props = record.pageprops
    if (props && typeof props === 'object' && props !== null && 'disambiguation' in props) {
      continue
    }
    if (typeof record.title === 'string' && record.title.length > 0) return true
  }
  return false
}

function enwikiTitleOf(entity: unknown): string | null {
  if (!entity || typeof entity !== 'object') return null
  const sitelinks = (entity as { sitelinks?: { enwiki?: { title?: unknown } } }).sitelinks
  const title = sitelinks?.enwiki?.title
  return typeof title === 'string' && title.length > 0 ? title : null
}

function catalogQueryValues(catnr: string): string[] {
  const unpadded = catnr.replace(/^0+/, '') || '0'
  if (unpadded.length >= 5) return [unpadded]
  return [unpadded, unpadded.padStart(5, '0')]
}

function tokensOf(text: string): string[] {
  return text.split(/[^A-Z0-9]+/).filter((token) => token.length > 1)
}

function apiUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') as Record<string, unknown>[] : []
}

async function getJson(
  fetchImpl: typeof fetch,
  url: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'Api-User-Agent': API_USER_AGENT, Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`detail lookup ${response.status}`)
    const data: unknown = await response.json()
    if (!data || typeof data !== 'object') throw new Error('detail lookup: not JSON')
    return data as Record<string, unknown>
  } finally {
    clearTimeout(timeout)
  }
}

function readCache(catnr: string, now: number): SatelliteDetailLink | null | undefined {
  const entry = readEntry(catnr)
  if (!entry) return undefined
  const ttl = entry.href === null ? MISS_TTL_MS : HIT_TTL_MS
  if (now - entry.fetchedAt > ttl) return undefined
  return entry.href && entry.title ? { href: entry.href, title: entry.title } : null
}

function readEntry(catnr: string): CacheEntry | null {
  const inMemory = memoryCache.get(catnr)
  if (inMemory) return inMemory
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_PREFIX + catnr)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CacheEntry>
    if (typeof parsed.fetchedAt !== 'number') return null
    if (parsed.href !== null && typeof parsed.href !== 'string') return null
    if (parsed.title !== null && parsed.title !== undefined && typeof parsed.title !== 'string') {
      return null
    }
    const entry: CacheEntry = {
      fetchedAt: parsed.fetchedAt,
      href: parsed.href ?? null,
      title: parsed.title ?? null,
    }
    memoryCache.set(catnr, entry)
    return entry
  } catch {
    return null
  }
}

function writeCache(catnr: string, link: SatelliteDetailLink | null, now: number): void {
  const entry: CacheEntry = {
    fetchedAt: now,
    href: link?.href ?? null,
    title: link?.title ?? null,
  }
  memoryCache.set(catnr, entry)
  try {
    globalThis.localStorage?.setItem(CACHE_PREFIX + catnr, JSON.stringify(entry))
  } catch {
    /* Quota or disabled: the memory cache still stops a repeat lookup. */
  }
}
