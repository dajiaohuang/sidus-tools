import { describe, expect, it } from 'vitest'
import { trailProgressOf, utcStamp } from './clock'

describe('utcStamp', () => {
  it('writes ISO 8601 UTC to the second, with an explicit offset', () => {
    expect(utcStamp(Date.parse('2026-08-24T08:41:36.789Z'))).toBe('2026-08-24T08:41:36+0000')
  })

  it('never leaks the fractional part or a trailing Z', () => {
    const stamp = utcStamp(Date.parse('2026-01-01T00:00:00.001Z'))
    expect(stamp).toBe('2026-01-01T00:00:00+0000')
    expect(stamp).not.toContain('.')
    expect(stamp).not.toContain('Z')
  })

  it('reports UTC whatever the reader is offset by', () => {
    /* The value comes from an epoch, so the host's zone cannot enter it. This
       pins that rather than trusting it: the two instants below are the same
       moment written from either side of the date line. */
    expect(utcStamp(Date.parse('2026-08-24T08:41:36+00:00'))).toBe(
      utcStamp(Date.parse('2026-08-24T17:41:36+09:00')),
    )
  })
})

describe('trailProgressOf', () => {
  it('says nothing when there is no population', () => {
    expect(trailProgressOf({ total: 0, loading: false, done: 0 })).toBeNull()
    expect(trailProgressOf({ total: 0, loading: true, done: 0 })).toBeNull()
  })

  it('opens at zero while the worker is still loading', () => {
    expect(trailProgressOf({ total: 10_740, loading: true, done: 0 })).toBe(0)
  })

  it('reports the produced fraction', () => {
    expect(trailProgressOf({ total: 1000, loading: false, done: 720 })).toBeCloseTo(0.72, 6)
  })

  it('LEAVES rather than sitting at full once the population is covered', () => {
    /* Null, not 1: a settled view should carry no residue of having loaded. */
    expect(trailProgressOf({ total: 720, loading: false, done: 720 })).toBeNull()
    expect(trailProgressOf({ total: 700, loading: false, done: 720 })).toBeNull()
  })

  it('says nothing when a population settled without producing anything', () => {
    expect(trailProgressOf({ total: 10, loading: false, done: 0 })).toBeNull()
  })

  it('stays inside 0..1 for every count the worker can report', () => {
    for (const total of [1, 2, 360, 10_740]) {
      for (const done of [0, 360, 10_380]) {
        const value = trailProgressOf({ total, loading: false, done })
        if (value === null) continue
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThan(1)
      }
    }
  })
})
