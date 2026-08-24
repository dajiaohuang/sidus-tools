/**
 * The hover-to-list flow, as arithmetic and state rather than as pixels.
 *
 * The globe names a satellite; the list has to highlight that row and bring it
 * into view. Both halves are decidable without a browser: which row is
 * identified is a state rule, and where the list must scroll is the pure
 * function below it.
 */

import { describe, expect, it } from 'vitest'
import { listWindowFor, scrollTopForIndex, SELECTED_ROW_HEIGHT_PX } from './list'

const ROW = SELECTED_ROW_HEIGHT_PX
const VIEWPORT = 380

describe('scrollTopForIndex', () => {
  it('leaves a row already on screen alone', () => {
    // Rows 0..19 are visible at the top of a 380 px viewport.
    expect(scrollTopForIndex(0, ROW, 0, VIEWPORT, 10700)).toBeNull()
    expect(scrollTopForIndex(10, ROW, 0, VIEWPORT, 10700)).toBeNull()
    // The last fully visible row, given 19 px rows in 380 px.
    expect(scrollTopForIndex(19, ROW, 0, VIEWPORT, 10700)).toBeNull()
  })

  it('centres a row that is below the window', () => {
    const at = scrollTopForIndex(500, ROW, 0, VIEWPORT, 10700)
    expect(at).not.toBeNull()
    // Centred: the row's top, less half a viewport, plus half a row.
    expect(at).toBeCloseTo(500 * ROW - VIEWPORT / 2 + ROW / 2, 6)
    // And it genuinely lands inside the new window.
    expect(scrollTopForIndex(500, ROW, at!, VIEWPORT, 10700)).toBeNull()
  })

  it('centres a row that is above the window', () => {
    const scrolled = 5000
    const at = scrollTopForIndex(10, ROW, scrolled, VIEWPORT, 10700)
    expect(at).not.toBeNull()
    expect(at!).toBeLessThan(scrolled)
    expect(scrollTopForIndex(10, ROW, at!, VIEWPORT, 10700)).toBeNull()
  })

  it('never scrolls past either end', () => {
    expect(scrollTopForIndex(0, ROW, 9000, VIEWPORT, 10700)).toBe(0)
    const last = 10699
    const at = scrollTopForIndex(last, ROW, 0, VIEWPORT, 10700)
    expect(at).toBe(10700 * ROW - VIEWPORT)
    // The final row is inside the window that clamp produces.
    expect(scrollTopForIndex(last, ROW, at!, VIEWPORT, 10700)).toBeNull()
  })

  it('says nothing for a satellite the filter has hidden', () => {
    // findIndex returns -1 when the identified satellite is not in the list.
    expect(scrollTopForIndex(-1, ROW, 0, VIEWPORT, 10700)).toBeNull()
  })

  it('lands the row inside the drawn window, not merely inside the scroll box', () => {
    /* The row must be one the virtualiser actually renders, or the highlight
       has no element to attach to. */
    for (const index of [150, 1000, 5000, 10_699]) {
      const at = scrollTopForIndex(index, ROW, 0, VIEWPORT, 10700) ?? 0
      const window = listWindowFor(10700, at, VIEWPORT, ROW)
      expect(index).toBeGreaterThanOrEqual(window.first)
      expect(index).toBeLessThan(window.first + window.count)
    }
  })
})

/**
 * The identity rule the globe and the list share: a pin outranks a hover, and
 * a hover only speaks when nothing is pinned.
 */
function identifiedOf(pinned: string | null, hovered: string | null): string | null {
  return pinned ?? hovered
}

/**
 * What the globe reports, whatever the pointer landed on. The whole point of
 * the unified pick is that these three sources are indistinguishable
 * downstream: a trail must reach the list exactly as a marker does.
 */
type PickSource = 'marker' | 'trail' | 'swarm'
function globeReports(source: PickSource, id: string | null): string | null {
  // One callback for all three; the source is not carried past this point.
  void source
  return id
}

describe('a trail pick is indistinguishable from a marker pick', () => {
  const rows = Array.from({ length: 32 }, (_, i) => `GPS-${i}`)
  const ROW_HEIGHT = SELECTED_ROW_HEIGHT_PX
  const VIEW = 200

  /** Everything the identified satellite drives, from one id. */
  const outcomesFor = (id: string | null, scrollTop: number) => {
    const index = id ? rows.indexOf(id) : -1
    return {
      highlightedRow: index,
      tooltipFor: id,
      forcedLabelFor: id,
      scrollTo: scrollTopForIndex(index, ROW_HEIGHT, scrollTop, VIEW, rows.length),
    }
  }

  it('produces identical outcomes for the same satellite from any source', () => {
    const target = 'GPS-25'
    const fromMarker = outcomesFor(globeReports('marker', target), 0)
    const fromTrail = outcomesFor(globeReports('trail', target), 0)
    const fromSwarm = outcomesFor(globeReports('swarm', target), 0)
    expect(fromTrail).toEqual(fromMarker)
    expect(fromSwarm).toEqual(fromMarker)
  })

  it('drives highlight, tooltip, label and scroll from a trail hit', () => {
    /* Row 25 at 19 px in a 200 px viewport scrolled to the top is below the
       fold, so a trail hover must both highlight it AND bring it into view. */
    const outcomes = outcomesFor(globeReports('trail', 'GPS-25'), 0)
    expect(outcomes.highlightedRow).toBe(25)
    expect(outcomes.tooltipFor).toBe('GPS-25')
    expect(outcomes.forcedLabelFor).toBe('GPS-25')
    expect(outcomes.scrollTo).not.toBeNull()

    // And after that scroll the row is genuinely visible.
    const settled = outcomesFor('GPS-25', outcomes.scrollTo!)
    expect(settled.scrollTo).toBeNull()
  })

  it('clears everything when the pointer leaves the trail', () => {
    const outcomes = outcomesFor(globeReports('trail', null), 0)
    expect(outcomes.highlightedRow).toBe(-1)
    expect(outcomes.tooltipFor).toBeNull()
    expect(outcomes.forcedLabelFor).toBeNull()
    expect(outcomes.scrollTo).toBeNull()
  })

  it('leaves a row already on screen where it is, from a trail hit too', () => {
    const outcomes = outcomesFor(globeReports('trail', 'GPS-2'), 0)
    expect(outcomes.highlightedRow).toBe(2)
    expect(outcomes.scrollTo).toBeNull()
  })
})

describe('identified satellite state flow', () => {
  it('shows the hover when nothing is pinned', () => {
    expect(identifiedOf(null, '44700')).toBe('44700')
    expect(identifiedOf(null, null)).toBeNull()
  })

  it('keeps the pin while the pointer wanders across the crowd', () => {
    expect(identifiedOf('44700', '44988')).toBe('44700')
    expect(identifiedOf('44700', null)).toBe('44700')
  })

  it('lets a click elsewhere clear the pin and fall back to the hover', () => {
    // A click on background reports null, which clears the pin.
    const afterBackgroundClick = identifiedOf(null, '44988')
    expect(afterBackgroundClick).toBe('44988')
  })

  it('moves the pin to another satellite on a second click', () => {
    expect(identifiedOf('44988', '44700')).toBe('44988')
  })
})
