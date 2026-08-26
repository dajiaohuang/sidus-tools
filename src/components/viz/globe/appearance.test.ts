import { describe, expect, it } from 'vitest'
import {
  appearanceFor,
  LABEL_ALWAYS_MAX,
  labelsAlwaysShownFor,
  markerSizeFor,
  trailIsDashedFor,
  trailRevolutionsFor,
  trailWeightFor,
} from './appearance'
import { SWARM_TRAIL_POINTS } from './swarm-trails'

/** Counts spanning every band, plus the boundaries between them. */
const COUNTS = [1, 2, 5, 6, 30, 31, 32, 200, 201, 1000, 10_700]

describe('appearance rules depend on the COUNT and nothing else', () => {
  it('gives the same answer for the same count, whatever the satellites are', () => {
    /* The rules take a number, so there is no way to ask which group a
       satellite belongs to. This pins that: calling twice with the same count
       has to agree, and the only argument there is IS the count. */
    for (const count of COUNTS) {
      expect(appearanceFor(count)).toEqual(appearanceFor(count))
    }
    expect(appearanceFor.length).toBe(1)
    expect(trailWeightFor.length).toBe(1)
    expect(trailRevolutionsFor.length).toBe(1)
    expect(markerSizeFor.length).toBe(1)
    expect(labelsAlwaysShownFor.length).toBe(1)
  })

  it('treats a 32-satellite GPS selection exactly like any other 32', () => {
    // The owner's case, and the same numbers a 32-strong Starlink slice gets.
    expect(appearanceFor(32)).toEqual(appearanceFor(32))
    const at32 = appearanceFor(32)
    expect(at32.trailRevolutions).toBe(0.5)
    expect(at32.labelsAlwaysShown).toBe(false)
  })
})

describe('trailRevolutionsFor', () => {
  it('gives a lone satellite the long triple trail', () => {
    /* Consumed by the full-treatment track, which is Earth-fixed: there the
       three revolutions are three distinct passes over the ground. The swarm
       never sees a lone satellite, so its inertial cache, where the three
       would collapse onto one ring, never receives this value. */
    expect(trailRevolutionsFor(1)).toBe(1.5)
  })

  it('drops everyone to one revolution as soon as there are two', () => {
    for (const count of [2, 5, 30, 200, 10_700]) {
      expect(trailRevolutionsFor(count)).toBe(0.5)
    }
  })
})

describe('trailWeightFor', () => {
  it('never gets heavier as the crowd grows', () => {
    let previous = trailWeightFor(1)
    for (const count of COUNTS.slice(1)) {
      const weight = trailWeightFor(count)
      expect(weight.widthPx).toBeLessThanOrEqual(previous.widthPx)
      expect(weight.alpha).toBeLessThanOrEqual(previous.alpha)
      previous = weight
    }
  })

  it('spends one sample budget on every count, since the renderer has only one', () => {
    /* The sample count sets the stride of a buffer shared by the whole
       population, so it cannot vary per satellite. Nothing in the appearance
       rules may claim otherwise. */
    expect(Object.keys(appearanceFor(1))).toEqual(Object.keys(appearanceFor(10_700)))
    expect('trailSamples' in appearanceFor(1)).toBe(false)
    // Crowd budget: ten thousand Starlink stay inside a few tens of MB.
    expect(SWARM_TRAIL_POINTS).toBe(96)
  })

  it('keeps a dash only while the line is wide enough to carry one', () => {
    expect(trailIsDashedFor(1)).toBe(true)
    expect(trailIsDashedFor(LABEL_ALWAYS_MAX)).toBe(true)
    expect(trailIsDashedFor(LABEL_ALWAYS_MAX + 1)).toBe(false)
    expect(trailIsDashedFor(10_700)).toBe(false)
  })
})

describe('markerSizeFor', () => {
  it('shrinks with the crowd and never reaches zero', () => {
    let previous = markerSizeFor(1)
    for (const count of COUNTS.slice(1)) {
      const size = markerSizeFor(count)
      expect(size).toBeLessThanOrEqual(previous)
      expect(size).toBeGreaterThan(0)
      previous = size
    }
  })

  it('keeps a small selection big enough to aim at', () => {
    expect(markerSizeFor(1)).toBeGreaterThanOrEqual(6)
    expect(markerSizeFor(32)).toBeGreaterThanOrEqual(3)
  })
})

describe('labelsAlwaysShownFor', () => {
  it('names everyone up to the naming count and nobody past it', () => {
    expect(labelsAlwaysShownFor(1)).toBe(true)
    expect(labelsAlwaysShownFor(LABEL_ALWAYS_MAX)).toBe(true)
    expect(labelsAlwaysShownFor(LABEL_ALWAYS_MAX + 1)).toBe(false)
    expect(labelsAlwaysShownFor(10_700)).toBe(false)
  })
})
