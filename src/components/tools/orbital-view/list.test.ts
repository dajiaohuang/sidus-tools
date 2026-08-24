import { describe, expect, it } from 'vitest'
import { listWindowFor, SELECTED_ROW_HEIGHT_PX, VIRTUAL_LIST_MIN } from './list'

const ROW = SELECTED_ROW_HEIGHT_PX

describe('listWindowFor', () => {
  it('draws a short list whole, with no spacers', () => {
    const window = listWindowFor(30, 0, 360, ROW)
    expect(window).toEqual({ first: 0, count: 30, padTopPx: 0, padBottomPx: 0 })
  })

  it('still draws the list whole exactly at the threshold', () => {
    expect(listWindowFor(VIRTUAL_LIST_MIN, 0, 360, ROW).count).toBe(VIRTUAL_LIST_MIN)
  })

  it('windows a long list and keeps the scrollbar honest', () => {
    const total = 10_747
    const window = listWindowFor(total, 0, 360, ROW)
    expect(window.first).toBe(0)
    expect(window.count).toBeLessThan(60)
    // Everything not drawn is still accounted for, so the height is unchanged.
    expect(window.padTopPx + window.count * ROW + window.padBottomPx).toBe(total * ROW)
  })

  it('moves the window with the scroll, keeping overscan above', () => {
    const window = listWindowFor(10_747, 100 * ROW, 360, ROW)
    expect(window.first).toBe(92)
    expect(window.padTopPx).toBe(92 * ROW)
  })

  it('never runs past the end of the list', () => {
    const total = 500
    const window = listWindowFor(total, (total - 2) * ROW, 360, ROW)
    expect(window.first + window.count).toBeLessThanOrEqual(total)
    expect(window.padBottomPx).toBe(0)
  })

  it('degrades to the whole list rather than dividing by a zero row height', () => {
    expect(listWindowFor(5000, 0, 360, 0).count).toBe(5000)
  })
})
