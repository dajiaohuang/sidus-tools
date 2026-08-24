import { describe, expect, it } from 'vitest'
import { globeDrawPath, swarmScaleTier } from './orbital-view/tiers'

describe('swarmScaleTier', () => {
  it('names and trails everything while the crowd is small', () => {
    for (const n of [0, 1, 2, 22, 30]) expect(swarmScaleTier(n)).toBe('named')
  })

  it('drops the names once they would overlap into a smear', () => {
    for (const n of [31, 100, 200]) expect(swarmScaleTier(n)).toBe('trails')
  })

  it('drops the trails once they would bury the globe', () => {
    for (const n of [201, 1000, 10_746]) expect(swarmScaleTier(n)).toBe('dots')
  })

  it('steps exactly at the declared boundaries', () => {
    expect(swarmScaleTier(30)).not.toBe(swarmScaleTier(31))
    expect(swarmScaleTier(200)).not.toBe(swarmScaleTier(201))
  })

  it('puts the owner’s case, one station group plus the ISS, in the named tier', () => {
    // 21 stations + ISS = 22: every one keeps its name and a single trail.
    expect(swarmScaleTier(22)).toBe('named')
  })
})

describe('globeDrawPath', () => {
  it('gives the named tier to the full treatment, and everything above to the swarm', () => {
    /*
     * The ownership rule, pinned because it broke silently once: the swarm
     * redesign stopped feeding the full-treatment path its positions, every
     * named satellite was drawn by both pipelines at once, and the lone-ISS
     * view lost its three passes, its precise marker and a follow that stayed
     * on the line. Exactly one owner per satellite, decided by count.
     */
    for (const n of [1, 2, 22, 30]) expect(globeDrawPath(n)).toBe('full')
    for (const n of [31, 200, 201, 10_740]) expect(globeDrawPath(n)).toBe('swarm')
  })

  it('flips owner exactly where the named tier ends', () => {
    expect(globeDrawPath(30)).not.toBe(globeDrawPath(31))
  })
})
