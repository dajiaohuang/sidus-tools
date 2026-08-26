import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  grokipediaUrlFromWikiTitle,
  isMegaConstellationMember,
  resetSatelliteDetailCache,
  resolveSatelliteDetail,
  wikiTitleScore,
} from './satellite-detail'

afterEach(() => {
  resetSatelliteDetailCache()
  vi.unstubAllGlobals()
})

describe('isMegaConstellationMember', () => {
  it('skips Starlink, Starshield, OneWeb and Kuiper buses', () => {
    expect(isMegaConstellationMember('STARLINK-3093')).toBe(true)
    expect(isMegaConstellationMember('STARLINK 3118')).toBe(true)
    expect(isMegaConstellationMember('STARSHIELD-1')).toBe(true)
    expect(isMegaConstellationMember('ONEWEB-0123')).toBe(true)
    expect(isMegaConstellationMember('KUIPER-101')).toBe(true)
  })

  it('does not skip BeiDou, GPS or named missions: those still get a lookup', () => {
    expect(isMegaConstellationMember('BEIDOU-3 M19')).toBe(false)
    expect(isMegaConstellationMember('GPS BIIR-2  (PRN 13)')).toBe(false)
    expect(isMegaConstellationMember('ISS (ZARYA)')).toBe(false)
    expect(isMegaConstellationMember('HST')).toBe(false)
    expect(isMegaConstellationMember('GOES 16')).toBe(false)
  })
})

describe('wikiTitleScore', () => {
  it('prefers the station over the module that shares its catalogue number', () => {
    const name = 'ISS (ZARYA)'
    expect(wikiTitleScore(name, 'International Space Station')).toBeGreaterThan(
      wikiTitleScore(name, 'Zarya (ISS module)'),
    )
  })

  it('still recognises a Hubble TLE name', () => {
    expect(wikiTitleScore('HST', 'Hubble Space Telescope')).toBeGreaterThan(
      wikiTitleScore('HST', 'Guide Star Catalog'),
    )
  })
})

describe('grokipediaUrlFromWikiTitle', () => {
  it('uses Wikipedia underscores, including parenthetical titles', () => {
    expect(grokipediaUrlFromWikiTitle('International Space Station')).toBe(
      'https://grokipedia.com/page/International_Space_Station',
    )
    expect(grokipediaUrlFromWikiTitle('Terra (satellite)')).toBe(
      'https://grokipedia.com/page/Terra_(satellite)',
    )
  })
})

describe('resolveSatelliteDetail', () => {
  function jsonOk(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  function mockApis(handlers: (url: URL) => unknown) {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      return jsonOk(handlers(url))
    })
    return fetchImpl as unknown as typeof fetch
  }

  it('does not ask Wikidata for a Starlink', async () => {
    const fetchImpl = mockApis(() => {
      throw new Error('should not fetch')
    })
    await expect(
      resolveSatelliteDetail('44713', 'STARLINK-3093', { fetch: fetchImpl }),
    ).resolves.toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('builds a Grokipedia link from the Wikidata sitelink after Wikipedia confirms it', async () => {
    const fetchImpl = mockApis((url) => {
      if (url.hostname === 'www.wikidata.org' && url.searchParams.get('action') === 'query') {
        return { query: { search: [{ title: 'Q25271' }, { title: 'Q331785' }] } }
      }
      if (url.hostname === 'www.wikidata.org' && url.searchParams.get('action') === 'wbgetentities') {
        return {
          entities: {
            Q25271: { sitelinks: { enwiki: { title: 'International Space Station' } } },
            Q331785: { sitelinks: { enwiki: { title: 'Zarya (ISS module)' } } },
          },
        }
      }
      if (url.hostname === 'en.wikipedia.org') {
        const title = url.searchParams.get('titles')
        if (title === 'International Space Station') {
          return { query: { pages: { '123': { title, pageid: 123, pageprops: {} } } } }
        }
        return { query: { pages: { '-1': { title, missing: '' } } } }
      }
      throw new Error(`unexpected ${url.href}`)
    })

    await expect(
      resolveSatelliteDetail('25544', 'ISS (ZARYA)', { fetch: fetchImpl, now: 1 }),
    ).resolves.toEqual({
      href: 'https://grokipedia.com/page/International_Space_Station',
      title: 'International Space Station',
    })
  })

  it('hides the link when Wikidata has no item', async () => {
    const fetchImpl = mockApis((url) => {
      if (url.hostname === 'www.wikidata.org') return { query: { search: [] } }
      throw new Error(`unexpected ${url.href}`)
    })
    await expect(
      resolveSatelliteDetail('43539', 'BEIDOU-3 M19', { fetch: fetchImpl, now: 1 }),
    ).resolves.toBeNull()
  })

  it('hides the link when Wikipedia has only a disambiguation page', async () => {
    const fetchImpl = mockApis((url) => {
      if (url.searchParams.get('action') === 'query' && url.hostname === 'www.wikidata.org') {
        return { query: { search: [{ title: 'Q1' }] } }
      }
      if (url.searchParams.get('action') === 'wbgetentities') {
        return { entities: { Q1: { sitelinks: { enwiki: { title: 'Terra' } } } } }
      }
      return {
        query: { pages: { '2': { title: 'Terra', pageid: 2, pageprops: { disambiguation: '' } } } },
      }
    })
    await expect(resolveSatelliteDetail('25994', 'TERRA', { fetch: fetchImpl, now: 1 })).resolves.toBeNull()
  })

  it('hides the link when Wikipedia reports the sitelink as missing', async () => {
    const fetchImpl = mockApis((url) => {
      if (url.searchParams.get('action') === 'query' && url.hostname === 'www.wikidata.org') {
        return { query: { search: [{ title: 'Q1' }] } }
      }
      if (url.searchParams.get('action') === 'wbgetentities') {
        return { entities: { Q1: { sitelinks: { enwiki: { title: 'Not A Real Satellite' } } } } }
      }
      return { query: { pages: { '-1': { title: 'Not A Real Satellite', missing: '' } } } }
    })
    await expect(resolveSatelliteDetail('1', 'FAKE SAT', { fetch: fetchImpl, now: 1 })).resolves.toBeNull()
  })

  it('reuses a stored miss so a hover does not ask again', async () => {
    const fetchImpl = mockApis(() => ({ query: { search: [] } }))
    const first = await resolveSatelliteDetail('43539', 'BEIDOU-3 M19', { fetch: fetchImpl, now: 10 })
    const second = await resolveSatelliteDetail('43539', 'BEIDOU-3 M19', {
      fetch: fetchImpl,
      now: 10 + 60_000,
    })
    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not treat a network error as a lasting miss', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(
      resolveSatelliteDetail('25544', 'ISS (ZARYA)', { fetch: failing, now: 1 }),
    ).resolves.toBeNull()

    const fetchImpl = mockApis((url) => {
      if (url.searchParams.get('action') === 'query' && url.hostname === 'www.wikidata.org') {
        return { query: { search: [{ title: 'Q25271' }] } }
      }
      if (url.searchParams.get('action') === 'wbgetentities') {
        return {
          entities: { Q25271: { sitelinks: { enwiki: { title: 'International Space Station' } } } },
        }
      }
      return {
        query: {
          pages: { '123': { title: 'International Space Station', pageid: 123, pageprops: {} } },
        },
      }
    })
    await expect(
      resolveSatelliteDetail('25544', 'ISS (ZARYA)', {
        fetch: fetchImpl,
        now: 1 + 5 * 60 * 1000 + 1,
      }),
    ).resolves.toMatchObject({ title: 'International Space Station' })
  })
})
