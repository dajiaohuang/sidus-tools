import { describe, expect, it } from 'vitest'
import {
  drawRangesSkipping,
  identifiedIsTracked,
  packedSlotOf,
  pointOwnershipOf,
  trailOwnershipOf,
} from './swarm-ownership'

describe('drawRangesSkipping', () => {
  it('draws the whole stream when nothing is skipped', () => {
    expect(drawRangesSkipping(8, -1)).toEqual([{ first: 0, count: 8 }])
    expect(drawRangesSkipping(8, 8)).toEqual([{ first: 0, count: 8 }])
    expect(drawRangesSkipping(8, 1.5)).toEqual([{ first: 0, count: 8 }])
  })

  it('omits a middle slot as two ranges', () => {
    expect(drawRangesSkipping(5, 2)).toEqual([
      { first: 0, count: 2 },
      { first: 3, count: 2 },
    ])
  })

  it('omits the first or last slot as one range', () => {
    expect(drawRangesSkipping(4, 0)).toEqual([{ first: 1, count: 3 }])
    expect(drawRangesSkipping(4, 3)).toEqual([{ first: 0, count: 3 }])
  })

  it('draws nothing when the only vertex is the skipped one', () => {
    expect(drawRangesSkipping(1, 0)).toEqual([])
    expect(drawRangesSkipping(0, 0)).toEqual([])
  })
})

describe('packedSlotOf', () => {
  it('maps a satrec index through the compacted keyframe', () => {
    const indices = Uint32Array.from([0, 2, 5])
    expect(packedSlotOf({ count: 3, indices }, 2)).toBe(1)
    expect(packedSlotOf({ count: 3, indices }, 1)).toBe(-1)
    expect(packedSlotOf({ count: 3, indices }, -1)).toBe(-1)
  })
})

describe('identifiedIsTracked', () => {
  it('is true only for the identified satellite that already has a track', () => {
    const satellites = [
      { id: '25544', positions: [{}, {}] },
      { id: '37456', positions: [] },
    ]
    expect(identifiedIsTracked('25544', satellites)).toBe(true)
    expect(identifiedIsTracked('37456', satellites)).toBe(false)
    expect(identifiedIsTracked(null, satellites)).toBe(false)
  })
})

describe('pointOwnershipOf', () => {
  const ids = ['25544', '37456']
  const keyframe = { count: 2, indices: Uint32Array.from([0, 1]) }

  it('hides the packed slot when the refined marker already owns it', () => {
    const satellites = [{ id: '37456', positions: [{}, {}] }]
    expect(pointOwnershipOf('37456', ids, keyframe, satellites)).toEqual({
      highlight: null,
      hidden: 1,
    })
  })

  it('highlights the swarm dot until the refined marker exists', () => {
    expect(pointOwnershipOf('37456', ids, keyframe, [])).toEqual({
      highlight: 1,
      hidden: null,
    })
  })
})

describe('trailOwnershipOf', () => {
  const ids = ['25544', '37456']

  it('hides the swarm trail once the refined track exists', () => {
    const satellites = [{ id: '37456', positions: [{}, {}] }]
    expect(trailOwnershipOf('37456', ids, satellites)).toEqual({
      highlight: null,
      hidden: 1,
    })
  })

  it('highlights the swarm trail until the refined track exists', () => {
    expect(trailOwnershipOf('37456', ids, [])).toEqual({ highlight: 1, hidden: null })
    expect(trailOwnershipOf(null, ids)).toEqual({ highlight: null, hidden: null })
  })
})
