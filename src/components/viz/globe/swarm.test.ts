import { describe, expect, it } from 'vitest'
import {
  keyframeProgress,
  packEmptySwarmSample,
  packSwarmSample,
  SWARM_FLOATS_PER_SATELLITE,
  wrapMercatorDelta,
} from './swarm'

describe('wrapMercatorDelta', () => {
  it('leaves a short step alone', () => {
    expect(wrapMercatorDelta(0.01)).toBeCloseTo(0.01, 12)
    expect(wrapMercatorDelta(-0.01)).toBeCloseTo(-0.01, 12)
  })

  it('takes the short way round the antimeridian', () => {
    // 0.98 east is really 0.02 west; without this the dot flies across the world.
    expect(wrapMercatorDelta(0.98)).toBeCloseTo(-0.02, 12)
    expect(wrapMercatorDelta(-0.98)).toBeCloseTo(0.02, 12)
  })

  it('stays inside half a world either way, for any input', () => {
    for (const delta of [-3.7, -1.2, -0.5, 0, 0.5, 0.75, 1.4, 9.9]) {
      const wrapped = wrapMercatorDelta(delta)
      expect(Math.abs(wrapped)).toBeLessThanOrEqual(0.5 + 1e-12)
    }
  })
})

describe('packSwarmSample', () => {
  const start = { mercatorX: 0.25, mercatorY: 0.4, elevationM: 420_000 }
  const rgb: [number, number, number] = [0.78, 0.86, 1]

  it('writes start then delta, at the satellite stride', () => {
    const target = new Float32Array(2 * SWARM_FLOATS_PER_SATELLITE)
    packSwarmSample(
      target,
      1,
      start,
      { mercatorX: 0.26, mercatorY: 0.41, elevationM: 421_000 },
      rgb,
    )
    // The first satellite's slot is untouched.
    expect([...target.slice(0, SWARM_FLOATS_PER_SATELLITE)]).toEqual(
      Array(SWARM_FLOATS_PER_SATELLITE).fill(0),
    )
    const [x, y, e, dx, dy, de, r, g, b] = target.slice(SWARM_FLOATS_PER_SATELLITE)
    expect(x).toBeCloseTo(0.25, 6)
    expect(y).toBeCloseTo(0.4, 6)
    expect(e).toBeCloseTo(420_000, 0)
    expect(dx).toBeCloseTo(0.01, 6)
    expect(dy).toBeCloseTo(0.01, 6)
    expect(de).toBeCloseTo(1000, 0)
    expect(r).toBeCloseTo(rgb[0], 5)
    expect(g).toBeCloseTo(rgb[1], 5)
    expect(b).toBeCloseTo(rgb[2], 5)
  })

  it('wraps a crossing so the shader interpolates the short way', () => {
    const target = new Float32Array(SWARM_FLOATS_PER_SATELLITE)
    // 0.99 -> 0.01 is a crossing eastward, not a sprint back across the world.
    packSwarmSample(
      target,
      0,
      { mercatorX: 0.99, mercatorY: 0.5, elevationM: 0 },
      { mercatorX: 0.01, mercatorY: 0.5, elevationM: 0 },
      rgb,
    )
    expect(target[3]).toBeCloseTo(0.02, 6)
    // The shader adds and wraps: 0.99 + 0.02 = 1.01 -> 0.01.
    const landed = (target[0] + target[3] + 1) % 1
    expect(landed).toBeCloseTo(0.01, 5)
  })
})

describe('packEmptySwarmSample', () => {
  it('writes NaN in the start position so the slot draws nothing', () => {
    const target = new Float32Array(SWARM_FLOATS_PER_SATELLITE)
    packEmptySwarmSample(target, 0)
    expect(Number.isNaN(target[0])).toBe(true)
    expect(Number.isNaN(target[1])).toBe(true)
    expect(target[3]).toBe(0)
  })
})

describe('keyframeProgress', () => {
  it('runs 0 to 1 across the span', () => {
    expect(keyframeProgress(1000, 1000, 2000)).toBe(0)
    expect(keyframeProgress(2000, 1000, 2000)).toBeCloseTo(0.5, 12)
    expect(keyframeProgress(3000, 1000, 2000)).toBe(1)
  })

  it('clamps rather than extrapolating, so a late keyframe freezes instead of flying off', () => {
    expect(keyframeProgress(9999, 1000, 2000)).toBe(1)
    expect(keyframeProgress(0, 1000, 2000)).toBe(0)
  })

  it('is defined for a degenerate span', () => {
    expect(keyframeProgress(5, 0, 0)).toBe(0)
  })
})
