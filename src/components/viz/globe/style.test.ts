import { describe, expect, it } from 'vitest'
import { SATELLITE_PALETTE, satelliteColorAt, trailIsDashed, trailWeightFor } from './style'

/** Channel-wise distance: what decides whether two thin lines read alike. */
const channels = (hex: string) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]
const maxChannelGap = (a: string, b: string) =>
  Math.max(...channels(a).map((v, i) => Math.abs(v - channels(b)[i])))

describe('SATELLITE_PALETTE', () => {
  it('keeps every pair well apart, the bar these crossing lines need', () => {
    let worst = { gap: Infinity, pair: '' }
    for (let i = 0; i < SATELLITE_PALETTE.length; i++) {
      for (let j = i + 1; j < SATELLITE_PALETTE.length; j++) {
        const gap = maxChannelGap(SATELLITE_PALETTE[i], SATELLITE_PALETTE[j])
        if (gap < worst.gap) worst = { gap, pair: `${SATELLITE_PALETTE[i]}/${SATELLITE_PALETTE[j]}` }
      }
    }
    /*
     * Twice the sky palette's floor, and then some: trails cross each other
     * rather than running parallel. Hues are spread evenly around the wheel
     * rather than picked by eye, which is how the floor gets this high.
     */
    expect(worst.gap).toBeGreaterThanOrEqual(50)
  })

  it('opens on the gold the ISS is drawn in', () => {
    expect(satelliteColorAt(0)).toBe('#b8a55a')
  })

  it('wraps instead of running out', () => {
    expect(satelliteColorAt(SATELLITE_PALETTE.length)).toBe(SATELLITE_PALETTE[0])
    expect(satelliteColorAt(SATELLITE_PALETTE.length + 3)).toBe(SATELLITE_PALETTE[3])
    expect(satelliteColorAt(1000)).toBe(SATELLITE_PALETTE[1000 % SATELLITE_PALETTE.length])
  })

  it('is all well-formed six-digit hex, since the GL layer parses it', () => {
    for (const color of SATELLITE_PALETTE) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('trailWeightFor', () => {
  it('gives a lone satellite the full weight the view has always used', () => {
    expect(trailWeightFor(1)).toEqual({ widthPx: 1.4, alpha: 1 })
    expect(trailWeightFor(0)).toEqual({ widthPx: 1.4, alpha: 1 })
  })

  it('thins and dims monotonically as the population grows', () => {
    const counts = [1, 3, 10, 30, 200]
    for (let i = 1; i < counts.length; i++) {
      const previous = trailWeightFor(counts[i - 1])
      const current = trailWeightFor(counts[i])
      expect(current.widthPx).toBeLessThanOrEqual(previous.widthPx)
      expect(current.alpha).toBeLessThanOrEqual(previous.alpha)
    }
  })

  /*
   * The last step moved from 20/21 to 30/31 deliberately, so that the width
   * boundary and the named-tier boundary are the same line: every trail that
   * carries a name is also wide enough to carry a dash pattern, and the dense
   * tier begins exactly where the trails go solid.
   */
  it('steps at the documented boundaries, so a step is never a surprise', () => {
    expect(trailWeightFor(1)).not.toEqual(trailWeightFor(2))
    expect(trailWeightFor(5)).not.toEqual(trailWeightFor(6))
    expect(trailWeightFor(30)).not.toEqual(trailWeightFor(31))
    // Inside a band nothing changes: adding one satellite must not restyle the rest.
    expect(trailWeightFor(2)).toEqual(trailWeightFor(5))
    expect(trailWeightFor(6)).toEqual(trailWeightFor(30))
    expect(trailWeightFor(31)).toEqual(trailWeightFor(5000))
  })

  it('draws dashes exactly where the named tier is, and solid past it', () => {
    // The acceptance case: 21 stations sit inside the named tier, dashed at 0.9.
    expect(trailWeightFor(21).widthPx).toBe(0.9)
    expect(trailIsDashed(trailWeightFor(21))).toBe(true)
    // 30 is the named tier's last satellite (TIER_NAMED_MAX in the tool).
    expect(trailIsDashed(trailWeightFor(30))).toBe(true)
    expect(trailIsDashed(trailWeightFor(31))).toBe(false)
    expect(trailWeightFor(31).widthPx).toBe(0.6)
    // A lone satellite keeps its dashed future: the triple trail is unchanged.
    expect(trailIsDashed(trailWeightFor(1))).toBe(true)
  })

  it('never fades a trail to nothing', () => {
    expect(trailWeightFor(10_000).alpha).toBeGreaterThan(0.2)
    expect(trailWeightFor(10_000).widthPx).toBeGreaterThan(0.4)
  })
})
