import { describe, expect, it } from 'vitest'
import {
  distanceToPolylinePx,
  drawableRuns,
  skyBodyColor,
  SKY_BODY_IDS,
} from './celestial'

describe('distanceToPolylinePx', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ]

  it('is zero on the line and the perpendicular distance off it', () => {
    expect(distanceToPolylinePx(line, 50, 0)).toBeCloseTo(0, 9)
    expect(distanceToPolylinePx(line, 50, 7)).toBeCloseTo(7, 9)
    expect(distanceToPolylinePx(line, 100, 50)).toBeCloseTo(0, 9)
  })

  it('clamps to the ends rather than extending the segments', () => {
    expect(distanceToPolylinePx(line, -10, 0)).toBeCloseTo(10, 9)
    expect(distanceToPolylinePx(line, 100, 130)).toBeCloseTo(30, 9)
  })

  it('skips breaks: a gap is not a segment', () => {
    const broken = [{ x: 0, y: 0 }, null, { x: 200, y: 0 }]
    // The midpoint would be 0 px from a joined line, but the line is not joined.
    expect(distanceToPolylinePx(broken, 100, 0)).toBe(Infinity)
  })

  it('has no distance to a path with fewer than two drawable points', () => {
    expect(distanceToPolylinePx([], 0, 0)).toBe(Infinity)
    expect(distanceToPolylinePx([{ x: 5, y: 5 }], 0, 0)).toBe(Infinity)
  })
})

describe('drawableRuns', () => {
  const run = (n: number, step: number, x0 = 0) =>
    Array.from({ length: n }, (_, i) => ({ x: x0 + i * step, y: 0 }))

  it('keeps a run long enough to read as a dashed line', () => {
    const { runs, dropped } = drawableRuns(run(5, 20))
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(5)
    expect(dropped).toBe(0)
  })

  it('drops a fragment shorter than one dash period', () => {
    // Two points 3 px apart: shorter than the 11 px dash period.
    const { runs, dropped } = drawableRuns([{ x: 0, y: 0 }, { x: 3, y: 0 }])
    expect(runs).toHaveLength(0)
    expect(dropped).toBe(1)
  })

  it('drops a lone point, which has no line at all', () => {
    const { runs, dropped } = drawableRuns([{ x: 10, y: 10 }])
    expect(runs).toHaveLength(0)
    expect(dropped).toBe(1)
  })

  it('splits at breaks and judges each run on its own length', () => {
    const points = [...run(4, 30), null, ...run(2, 2, 500), null, ...run(3, 40, 800)]
    const { runs, dropped } = drawableRuns(points)
    expect(runs).toHaveLength(2)
    expect(runs[0]).toHaveLength(4)
    expect(runs[1]).toHaveLength(3)
    expect(dropped).toBe(1)
  })

  it('keeps a two-point run that is long enough', () => {
    const { runs, dropped } = drawableRuns([{ x: 0, y: 0 }, { x: 0, y: 40 }])
    expect(runs).toHaveLength(1)
    expect(dropped).toBe(0)
  })

  it('has nothing to draw and nothing to drop for an empty path', () => {
    expect(drawableRuns([])).toEqual({ runs: [], dropped: 0 })
    expect(drawableRuns([null, null])).toEqual({ runs: [], dropped: 0 })
  })
})

describe('skyBodyColor', () => {
  /** Channel-wise distance, the thing that decides whether two dashes read alike. */
  const channels = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
  const maxChannelGap = (a: string, b: string) =>
    Math.max(...channels(a).map((v, i) => Math.abs(v - channels(b)[i])))

  const TABLE: Record<string, string> = {
    sun: '#e8d5a3',
    moon: '#b0b0b0',
    mercury: '#9a9a9a',
    venus: '#c9b896',
    mars: '#c47a5a',
    jupiter: '#c4a882',
    saturn: '#d4c4a0',
    uranus: '#9ec4c8',
    neptune: '#5a7ab0',
  }
  const drawn = (id: string) => skyBodyColor(id as never, TABLE[id])

  it('separates the two pairs that collided in the shared table', () => {
    // Raw table gaps: Mercury vs Moon 22 and Saturn vs Jupiter 30 per channel.
    expect(maxChannelGap(TABLE.mercury, TABLE.moon)).toBeLessThan(30)
    expect(maxChannelGap(drawn('mercury'), drawn('moon'))).toBeGreaterThan(60)
    expect(maxChannelGap(drawn('saturn'), drawn('jupiter'))).toBeGreaterThan(30)
  })

  it('leaves every other body on the shared table colour', () => {
    for (const id of ['sun', 'moon', 'venus', 'mars', 'jupiter', 'uranus', 'neptune']) {
      expect(drawn(id)).toBe(TABLE[id])
    }
  })

  it('separates every pair the overrides were chosen to fix', () => {
    // Mercury's nearest neighbour is now Mars, not the Moon.
    const others = Object.keys(TABLE).filter((id) => id !== 'mercury')
    const nearest = Math.min(...others.map((id) => maxChannelGap(drawn('mercury'), drawn(id))))
    expect(nearest).toBeGreaterThanOrEqual(20)
  })

  it('keeps EVERY pair of drawn colours at least 20/255 apart', () => {
    /*
     * No palette edit gets judged against one neighbour: a Saturn that
     * clears Jupiter can still land 9/255 from the Sun. This fails unless
     * all 36 pairs clear the bar. Current floor is 20, shared by
     * mercury/mars and venus/jupiter; Saturn's nearest is Jupiter at 38.
     */
    const ids = Object.keys(TABLE)
    let worst = { gap: Infinity, pair: '' }
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const gap = maxChannelGap(drawn(ids[i]), drawn(ids[j]))
        if (gap < worst.gap) worst = { gap, pair: `${ids[i]}/${ids[j]}` }
      }
    }
    expect({ ...worst }).toEqual({ gap: 20, pair: 'mercury/mars' })
    expect(maxChannelGap(drawn('saturn'), drawn('jupiter'))).toBe(38)
    expect(maxChannelGap(drawn('saturn'), drawn('sun'))).toBeGreaterThanOrEqual(20)
  })
})
