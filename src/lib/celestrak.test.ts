import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  catnrOf,
  celestrakQueryUrl,
  celestrakSelector,
  groupQueryUrl,
  parseTleRecords,
  retryAfterMs,
  tleText,
} from './celestrak'

const ISS = [
  'ISS (ZARYA)',
  '1 25544U 98067A   25230.54791667  .00016717  00000-0  10270-3 0  9994',
  '2 25544  51.6400 208.9163 0002571  87.6070 272.5222 15.50377579 25784',
].join('\n')

const HST = [
  'HST',
  '1 20580U 90037B   25230.20000000  .00001234  00000-0  67890-4 0  9991',
  '2 20580  28.4700 100.0000 0002500  90.0000 270.0000 15.09000000 12345',
].join('\n')

describe('celestrakSelector', () => {
  it('reads an all-digit query as a catalogue number', () => {
    expect(celestrakSelector('25544')).toBe('CATNR=25544')
    expect(celestrakSelector('  25544  ')).toBe('CATNR=25544')
  })

  it('reads anything else as a name, url-encoded and uppercased', () => {
    expect(celestrakSelector('ISS')).toBe('NAME=ISS')
    expect(celestrakSelector('iss')).toBe('NAME=ISS')
    expect(celestrakSelector('SES 1')).toBe('NAME=SES%201')
    // A number with a letter is a name, not a catalogue number.
    expect(celestrakSelector('COSMOS 2251')).toBe('NAME=COSMOS%202251')
  })

  it('has nothing to ask for when the query is empty', () => {
    expect(celestrakSelector('')).toBe('')
    expect(celestrakSelector('   ')).toBe('')
    expect(celestrakQueryUrl('  ')).toBeNull()
  })

  it('builds the full TLE-format request', () => {
    expect(celestrakQueryUrl('25544')).toBe(
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
    )
    expect(celestrakQueryUrl('hubble')).toBe(
      'https://celestrak.org/NORAD/elements/gp.php?NAME=HUBBLE&FORMAT=TLE',
    )
    expect(celestrakQueryUrl('HST')).toBe(
      'https://celestrak.org/NORAD/elements/gp.php?NAME=HST&FORMAT=TLE',
    )
  })
})

describe('catnrOf', () => {
  it('reads the catalogue number out of line 1', () => {
    expect(catnrOf('1 25544U 98067A   25230.54791667  .00016717  00000-0  10270-3 0  9994')).toBe(
      '25544',
    )
    // Low numbers are space-padded in the fixed-width format.
    expect(catnrOf('1   900U 64063C   25230.00000000  .00000100  00000-0  10000-3 0  9990')).toBe(
      '900',
    )
  })
})

describe('parseTleRecords', () => {
  it('reads a single element set', () => {
    const records = parseTleRecords(ISS)
    expect(records).toHaveLength(1)
    expect(records[0].catnr).toBe('25544')
    expect(records[0].name).toBe('ISS (ZARYA)')
    expect(records[0].line1.startsWith('1 25544U')).toBe(true)
  })

  it('reads every set in a multi-result response', () => {
    const records = parseTleRecords(`${ISS}\n${HST}`)
    expect(records.map((r) => r.catnr)).toEqual(['25544', '20580'])
    expect(records.map((r) => r.name)).toEqual(['ISS (ZARYA)', 'HST'])
  })

  it('tolerates CRLF, blank lines and leading whitespace', () => {
    const messy = `\r\n  ${ISS.split('\n').join('  \r\n')}  \r\n\r\n`
    expect(parseTleRecords(messy)).toHaveLength(1)
  })

  it('returns nothing for the plain-text error CelesTrak sends with HTTP 200', () => {
    expect(parseTleRecords('No GP data found')).toEqual([])
    expect(parseTleRecords('')).toEqual([])
  })

  it('does not mistake a name line for a data line', () => {
    // A satellite genuinely named with a leading digit must not be swallowed.
    const records = parseTleRecords(`1998-067A DEBRIS\n${ISS.split('\n')[1]}\n${ISS.split('\n')[2]}`)
    expect(records).toHaveLength(1)
    expect(records[0].name).toBe('1998-067A DEBRIS')
  })

  it('round trips back to a parseable three-line block', () => {
    const [record] = parseTleRecords(ISS)
    expect(tleText(record)).toBe(ISS)
  })
})

describe('retryAfterMs', () => {
  it('reads the delta-seconds form', () => {
    expect(retryAfterMs('120')).toBe(120_000)
    expect(retryAfterMs('  0 ')).toBe(0)
  })

  it('reads the HTTP-date form as a wait from now', () => {
    const ms = retryAfterMs(new Date(Date.now() + 90_000).toUTCString())
    expect(ms).not.toBeNull()
    expect(Math.abs((ms as number) - 90_000)).toBeLessThan(2000)
  })

  it('never asks the caller to wait a negative time', () => {
    expect(retryAfterMs(new Date(Date.now() - 60_000).toUTCString())).toBe(0)
  })

  it('is null when the header is absent or unreadable', () => {
    expect(retryAfterMs(null)).toBeNull()
    expect(retryAfterMs('')).toBeNull()
    expect(retryAfterMs('soon')).toBeNull()
  })
})

/**
 * The group path, against the replies CelesTrak actually sends. A repeat
 * download of an unchanged group is answered with HTTP 403 and a plain-text
 * body, which is a statement about the data, not a failure of the request.
 */
describe('fetchCelestrakGroup', () => {
  const THROTTLE_BODY =
    'GP data has not updated since your last successful\ndownload of GROUP=starlink at 2026-08-20 19:12:57 UTC.\nData is updated once every 2 hours.'

  /** A fresh module per case: the memory cache is module state by design. */
  async function harness(options: { store?: Record<string, string>; failWrites?: boolean } = {}) {
    vi.resetModules()
    const store = options.store ?? {}
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        if (options.failWrites) {
          const error = new Error('exceeded the quota') as Error & { name: string }
          error.name = 'QuotaExceededError'
          throw error
        }
        store[k] = v
      },
      removeItem: (k: string) => delete store[k],
    }
    vi.stubGlobal('localStorage', storage)
    return { store, module: await import('./celestrak') }
  }

  const cacheKey = (group: string) =>
    `sidus.celestrak.https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=TLE`
  const legacyCacheKey = (group: string) =>
    `sidus.celestrak.https://celestrak.org/NORAD/elements/gp.php?FORMAT=TLE&GROUP=${group}`

  const reply = (body: string, init: ResponseInit = {}) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, init)))

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('puts GROUP before FORMAT, matching CelesTrak examples', () => {
    expect(groupQueryUrl('stations')).toBe(
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=TLE',
    )
  })

  it('still reads a dump stored under the FORMAT-first URL', async () => {
    const store = {
      [legacyCacheKey('stations')]: JSON.stringify({ fetchedAt: Date.now(), text: ISS }),
    }
    const { module } = await harness({ store })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const outcome = await module.fetchCelestrakGroup('stations')
    expect(outcome).toMatchObject({ ok: true, stale: false })
    expect(outcome.ok && outcome.records.map((r) => r.catnr)).toEqual(['25544'])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('serves the stored copy when CelesTrak declines to resend, however old the TTL calls it', async () => {
    const store = {
      [cacheKey('stations')]: JSON.stringify({ fetchedAt: Date.now() - 48 * 3600_000, text: ISS }),
    }
    const { module } = await harness({ store })
    reply(THROTTLE_BODY, { status: 403 })
    const outcome = await module.fetchCelestrakGroup('stations')
    expect(outcome).toMatchObject({ ok: true, stale: true })
    expect(outcome.ok && outcome.records.map((r) => r.catnr)).toEqual(['25544'])
  })

  it('reports a throttle, not a fetch failure, when nothing is stored', async () => {
    const { module } = await harness()
    reply(THROTTLE_BODY, { status: 403 })
    const outcome = await module.fetchCelestrakGroup('starlink')
    expect(outcome).toMatchObject({ ok: true, stale: true, from: 'snapshot' })
    expect(outcome.ok && outcome.records.some((r) => r.name.includes('STARLINK'))).toBe(true)
  })

  it('falls back to the bundled snapshot when stations has no stored copy', async () => {
    const { module } = await harness()
    reply(THROTTLE_BODY, { status: 403 })
    const outcome = await module.fetchCelestrakGroup('stations')
    expect(outcome).toMatchObject({ ok: true, stale: true, from: 'snapshot' })
    expect(outcome.ok && outcome.records.some((r) => r.catnr === '25544')).toBe(true)
  })

  it('does not repeat a non-200 query in the same update cycle', async () => {
    const { module } = await harness()
    const fetch = vi.fn(async () => new Response(THROTTLE_BODY, { status: 403 }))
    vi.stubGlobal('fetch', fetch)
    await module.fetchCelestrakGroup('starlink')
    await module.fetchCelestrakGroup('starlink')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('passes Retry-After through when the server sends one', async () => {
    const { module } = await harness()
    reply('slow down', { status: 429, headers: { 'Retry-After': '300' } })
    const outcome = await module.fetchCelestrakGroup('starlink')
    expect(outcome).toMatchObject({ ok: true, from: 'snapshot' })
  })

  it('separates a server error from a throttle', async () => {
    const { module } = await harness()
    reply('boom', { status: 500 })
    const outcome = await module.fetchCelestrakGroup('starlink')
    expect(outcome).toMatchObject({ ok: true, from: 'snapshot' })
  })

  it('falls back to the stored copy when the request never lands', async () => {
    const store = {
      [cacheKey('galileo')]: JSON.stringify({ fetchedAt: Date.now() - 72 * 3600_000, text: ISS }),
    }
    const { module } = await harness({ store })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    expect(await module.fetchCelestrakGroup('galileo')).toMatchObject({ ok: true, stale: true })
  })

  it('reports bytes as the body arrives', async () => {
    const { module } = await harness()
    reply(ISS, { status: 200, headers: { 'Content-Length': String(ISS.length) } })
    const seen: Array<[number, number | null]> = []
    const outcome = await module.fetchCelestrakGroup('stations', {
      onProgress: (received, total) => seen.push([received, total]),
    })
    expect(outcome).toMatchObject({ ok: true, stale: false })
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]).toEqual([ISS.length, ISS.length])
  })

  it('resolves a common name through Wikidata P377 when GP NAME is empty', async () => {
    const { module } = await harness()
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('NAME=HUBBLE') && url.includes('gp.php')) {
        return new Response('No GP data found', { status: 200 })
      }
      if (url.includes('satcat/records.php')) return new Response('[]', { status: 200 })
      if (url.includes('wbsearchentities')) {
        return new Response(JSON.stringify({ search: [{ id: 'Q2513' }] }), { status: 200 })
      }
      if (url.includes('wbgetentities')) {
        return new Response(
          JSON.stringify({
            entities: {
              Q2513: { claims: { P377: [{ mainsnak: { datavalue: { value: '20580' } } }] } },
            },
          }),
          { status: 200 },
        )
      }
      if (url.includes('CATNR=20580')) return new Response(HST, { status: 200 })
      throw new Error(`unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetch)
    const found = await module.searchCelestrak('hubble')
    expect(found.map((r) => r.catnr)).toEqual(['20580'])
    expect(found[0]?.name).toBe('HST')
  })

  it('a cache write that cannot be stored is not a fetch failure', async () => {
    const { module } = await harness({ failWrites: true })
    reply(ISS, { status: 200 })
    const outcome = await module.fetchCelestrakGroup('stations')
    expect(outcome).toMatchObject({ ok: true, stale: false })
    expect(outcome.ok && outcome.records).toHaveLength(1)
  })
})
