import { describe, expect, it } from 'vitest'
import { TOOLS } from '@/data/tools'
import { SOURCES } from '@/data/sources'
import { normalizeTags } from '@/lib/tags'

/**
 * Catalog quality gates (sources + tags). Survey markdown is local-only
 * and is not part of the public repo.
 */
describe('tools catalog quality gates', () => {
  it('every live tool has ≥2 resolvable sources with https urls', () => {
    for (const tool of TOOLS.filter((t) => t.status === 'live')) {
      const ids = tool.sourceIds ?? []
      expect(ids.length, tool.id).toBeGreaterThanOrEqual(2)
      for (const id of ids) {
        const s = SOURCES[id]
        expect(s, `${tool.id} missing source ${id}`).toBeTruthy()
        expect(s.url.startsWith('http'), `${id} url`).toBe(true)
      }
    }
  })

  it('links the free-space path-loss citation to ITU-R P.525-5', () => {
    expect(SOURCES['itu-fspl']?.url).toBe(
      'https://www.itu.int/rec/R-REC-P.525-5-202411-I/en',
    )
    expect(SOURCES['itu-fspl']?.name).toContain('ITU-R P.525-5')
  })

  it('normalizeTags merges partial-pressure and thermal synonyms', () => {
    expect(normalizeTags(['ppO2', 'ppCO2', 'cabin'])).toEqual(['atmosphere'])
    expect(normalizeTags(['cooling', 'TCS', 'thermal'])).toEqual(['thermal'])
    expect(normalizeTags(['life-support', 'ECLSS'])).toEqual(['ECLSS'])
  })

  it('created and updated are ISO 8601 dates with created <= updated', () => {
    const iso = /^\d{4}-\d{2}-\d{2}$/
    for (const tool of TOOLS) {
      expect(tool.created, `${tool.id} created`).toMatch(iso)
      expect(tool.updated, `${tool.id} updated`).toMatch(iso)
      expect(tool.created! <= tool.updated!, tool.id).toBe(true)
    }
  })

  it('published tags are already normalized (no legacy ppO2 leftover)', () => {
    for (const tool of TOOLS) {
      expect(tool.tags).toEqual(normalizeTags(tool.tags))
      expect(tool.tags).not.toContain('ppO2')
      expect(tool.tags).not.toContain('ppCO2')
      expect(tool.tags).not.toContain('cooling')
      expect(tool.tags).not.toContain('TCS')
    }
  })

  it('ODC wave physics is exported from the barrel and its sources resolve', async () => {
    const physics = await import('@/lib/physics')
    for (const name of [
      'radiatorNetFlux',
      'nadirPlateViewFactor',
      'radiatorHeatPump',
      'odcPowerThermalSizing',
      'ltanRaanOffsetRad',
      'betaAngle',
      'eclipseThresholdBeta',
      'julianDay',
      'dawnDuskBetaJd',
      'dawnDuskBeta',
      'dawnDuskSeason',
      'twoPhaseLoop',
      'TWO_PHASE_FLUIDS',
      'coldPlateChain',
      'shieldMassScaling',
      'shieldKgPerKwVsSize',
    ]) {
      expect(name in physics, name).toBe(true)
    }
    for (const id of [
      'starcloud-wp',
      'turyshev-odc',
      'suncatcher',
      'nasa-rp-1121',
      'nist-webbook',
      'ices-2015-35',
      'gilmore',
      'lienhard',
      'spenvis-shieldose',
      'nvidia-hopper',
    ]) {
      expect(SOURCES[id]?.url.startsWith('https://'), id).toBe(true)
    }
  })
})
