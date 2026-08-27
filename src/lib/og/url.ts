/**
 * Absolute og:image URL builder. Edge-safe (no physics).
 *
 * Crawlers (Facebook, Slack, iMessage, LinkedIn) drop or time out on long
 * query strings. Tool pages always serialize their full schema. The
 * orbital-view URL includes camera, sky bodies, and satellite lists that
 * the OG card ignores.
 */
import { LAYOUT_PARAM_KEYS } from '../tool-ui-layout'
import { queryFromSearch } from './payload'
import { SITE_ORIGIN } from './types'

/** Bump when the PNG pipeline changes so scrapers refetch. */
export const OG_VERSION = '6'

/**
 * Visualization / camera / catalog-selection keys. Useful on the tool URL,
 * never on /api/og: the Edge card is catalog copy, and these values balloon
 * (sky=sun,moon,…&sats=25544,25545,…).
 */
export const OG_VIEW_STATE_KEYS = new Set([
  'sky',
  'alt',
  'sats',
  'groups',
  'tw',
  'to',
  'ts',
  'z',
  'pitch',
  'brg',
  'lng',
  'follow',
  'sel',
  'scene',
  'view',
  'vis',
  'mark',
  'showTransfer',
])

const OG_META_KEYS = new Set(['mcp', 'tool', 'page', 'id', 'v'])

const OG_STRIP = new Set<string>([...LAYOUT_PARAM_KEYS, ...OG_VIEW_STATE_KEYS, ...OG_META_KEYS])

/** Facebook/iMessage start failing well below the HTTP 8 kB query limit. */
const OG_URL_MAX_CHARS = 1500
const OG_PARAM_MAX_CHARS = 120

function shouldCopyOgParam(key: string, value: string): boolean {
  if (OG_STRIP.has(key)) return false
  if (value === '') return false
  if (value.length > OG_PARAM_MAX_CHARS) return false
  return true
}

function copyLiveParams(u: URL, search: string | URLSearchParams | Record<string, string | undefined> | undefined) {
  const q = queryFromSearch(search ?? '')
  // Camera / catalog keys mean this is a visualization URL. Extra leftovers
  // such as orbital-view `lat` must not ride along (launch-azimuth still can:
  // it has `lat` without `sky`/`sats`/`scene`).
  if (Object.keys(q).some((k) => OG_VIEW_STATE_KEYS.has(k))) return
  for (const [k, v] of Object.entries(q)) {
    if (v == null || !shouldCopyOgParam(k, v)) continue
    u.searchParams.set(k, v)
    if (u.toString().length > OG_URL_MAX_CHARS) {
      u.searchParams.delete(k)
      break
    }
  }
}

/** Absolute og:image URL for a path + search string */
export function buildOgImageUrl(
  path: string,
  search?: string | URLSearchParams | Record<string, string | undefined>,
  origin = SITE_ORIGIN,
): string {
  const u = new URL('/api/og', origin)
  if (path === '/' || path === '') {
    u.searchParams.set('page', 'home')
  } else if (path === '/tools') {
    u.searchParams.set('page', 'tools')
  } else if (path === '/resources') {
    u.searchParams.set('page', 'resources')
  } else {
    const m = path.match(/^\/tools\/([^/?#]+)/)
    if (m) {
      u.searchParams.set('tool', m[1])
      copyLiveParams(u, search)
    } else {
      u.searchParams.set('page', 'home')
    }
  }
  if (!u.searchParams.has('v')) u.searchParams.set('v', OG_VERSION)
  return u.toString()
}
