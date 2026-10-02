import { describe, expect, it } from 'vitest'
import { buildOgImageUrl, computeToolOg, resolveOgPayload } from './compute'
import { TOOLS } from '@/data/tools'
import { TOOL_OG } from './catalog'

describe('OG payload', () => {
  it('home page payload has metrics and brand', () => {
    const p = resolveOgPayload({ page: 'home' })
    expect(p.kind).toBe('home')
    expect(p.title).toBe('SIDUS')
    expect(p.metrics?.length).toBeGreaterThan(0)
    expect(p.urlHint).toContain('sidus')
  })

  it('every live tool has formula catalog entry', () => {
    for (const t of TOOLS.filter((x) => x.status === 'live')) {
      expect(TOOL_OG[t.id], t.id).toBeTruthy()
      expect(TOOL_OG[t.id].formula.length).toBeGreaterThan(3)
    }
  })

  it('Sun-synchronous card uses the eastward retrograde-node sign', () => {
    expect(TOOL_OG.sso.formula).toContain('Ω̇_J2 = +ω_sun')
  })

  it('static tool card without params is non-dynamic', () => {
    const p = computeToolOg('hohmann', {})
    expect(p.dynamic).toBe(false)
    expect(p.formula).toMatch(/Δv|TOF|μ/)
    expect(p.metrics).toBeUndefined()
  })

  it('hohmann with params returns live Δv metrics', () => {
    const p = computeToolOg('hohmann', {
      body: 'earth',
      h1: '200',
      h2: '35786',
      hu: 'km',
    })
    expect(p.dynamic).toBe(true)
    expect(p.metrics?.length).toBeGreaterThanOrEqual(3)
    expect(p.metrics?.[0]?.label).toMatch(/Δv/i)
    expect(p.context).toMatch(/200/)
  })

  it('circular orbit with altitude computes velocity', () => {
    const p = computeToolOg('circular-orbit', { h: '400', hu: 'km', body: 'earth' })
    expect(p.dynamic).toBe(true)
    const v = p.metrics?.find((m) => m.label === 'Velocity')
    expect(v).toBeTruthy()
    // LEO ~7.67 km/s (locale-stable ogNum)
    const n = Number(v!.value)
    expect(n).toBeGreaterThan(7)
    expect(n).toBeLessThan(8)
    expect(v!.unit).toBe('km/s')
  })

  it('buildOgImageUrl encodes tool and formula params', () => {
    const url = buildOgImageUrl('/tools/hohmann', 'h1=200&h2=35786&hu=km')
    expect(url).toContain('/api/og')
    expect(url).toContain('tool=hohmann')
    expect(url).toContain('h1=200')
    expect(url).toContain('h2=35786')
    expect(url).toContain('v=6')
  })

  it('buildOgImageUrl drops orbital-view camera and catalog state', () => {
    const url = buildOgImageUrl(
      '/tools/orbital-view',
      'sky=sun,moon,mercury,venus,mars&alt=1&sats=25544,25545&groups=starlink&tw=1&to=1&ts=1&z=1.5&pitch=12&brg=-40&lng=12.4&lat=41.9&follow=1&sel=25544&scene=globe',
    )
    expect(url).toContain('tool=orbital-view')
    expect(url).not.toContain('sky=')
    expect(url).not.toContain('sats=')
    expect(url).not.toContain('groups=')
    expect(url).not.toContain('pitch=')
    expect(url).not.toContain('scene=')
    expect(url).not.toContain('lat=')
    expect(url).toMatch(/\/api\/og\?tool=orbital-view&v=6$/)
  })

  it('buildOgImageUrl strips layout chrome keys', () => {
    const url = buildOgImageUrl('/tools/hohmann', 'h1=200&focus=1&chrome=0&code=0')
    expect(url).toContain('h1=200')
    expect(url).not.toContain('focus=')
    expect(url).not.toContain('chrome=')
    expect(url).not.toContain('code=')
  })

  it('rocket equation dynamic', () => {
    const p = computeToolOg('rocket-equation', {
      isp: '330',
      m0: '500000',
      mf: '100000',
      mu: 'kg',
    })
    expect(p.dynamic).toBe(true)
    expect(p.metrics?.[0]?.label).toBe('Δv')
  })
})
