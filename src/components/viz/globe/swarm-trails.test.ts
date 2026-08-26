import { describe, expect, it } from 'vitest'
import {
  packSwarmTrail,
  SWARM_TRAIL_FLOATS_PER_SATELLITE,
  SWARM_TRAIL_FLOATS_PER_VERTEX,
  SWARM_TRAIL_POINTS,
  SWARM_TRAIL_VERTICES_PER_SATELLITE,
  type SwarmTrailPoint,
} from './swarm-trails'

const point = (x: number, y = 0.5, elevationM = 550_000): SwarmTrailPoint => ({
  mercatorX: x,
  mercatorY: y,
  elevationM,
})

/** A trail marching east in even steps, which crosses nothing. */
function straightTrail(step = 0.001): SwarmTrailPoint[] {
  return Array.from({ length: SWARM_TRAIL_POINTS }, (_, i) => point(0.2 + i * step))
}

/** The two endpoints of segment `s` of the satellite at `index`. */
function segment(buffer: Float32Array, index: number, s: number) {
  const stride = SWARM_TRAIL_FLOATS_PER_VERTEX
  const at = index * SWARM_TRAIL_FLOATS_PER_SATELLITE + s * stride * 2
  return {
    from: [buffer[at], buffer[at + 1], buffer[at + 2]],
    to: [buffer[at + stride], buffer[at + stride + 1], buffer[at + stride + 2]],
    /** Each end's view of where the other one is, in x. */
    fromPartnerX: buffer[at + 3],
    toPartnerX: buffer[at + stride + 3],
  }
}

describe('packSwarmTrail', () => {
  it('emits one segment pair per step between samples', () => {
    expect(SWARM_TRAIL_VERTICES_PER_SATELLITE).toBe((SWARM_TRAIL_POINTS - 1) * 2)
    expect(SWARM_TRAIL_FLOATS_PER_SATELLITE).toBe(
      SWARM_TRAIL_VERTICES_PER_SATELLITE * SWARM_TRAIL_FLOATS_PER_VERTEX,
    )
  })

  it('gives each endpoint the other one as its partner', () => {
    const points = straightTrail()
    const buffer = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE)
    packSwarmTrail(buffer, 0, points)

    for (let s = 0; s < SWARM_TRAIL_POINTS - 1; s++) {
      const seg = segment(buffer, 0, s)
      expect(seg.fromPartnerX).toBeCloseTo(seg.to[0], 6)
      expect(seg.toPartnerX).toBeCloseTo(seg.from[0], 6)
    }
  })

  it('lets each end of a seam-straddling segment agree on one copy of the world', () => {
    /* What the shader does, verbatim: wrap both ends by the same rotation, then
       let only the lower one step up. Checked across a full turn of offsets, so
       no sidereal angle can split a segment across the world. */
    const resolve = (x: number, partner: number, offset: number) => {
      const here = (x + offset + 2) % 1
      const there = (partner + offset + 2) % 1
      return there - here > 0.5 ? here + 1 : here
    }
    const points = straightTrail(0.004)
    const buffer = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE)
    packSwarmTrail(buffer, 0, points)

    for (let offset = 0; offset < 1; offset += 0.017) {
      for (let s = 0; s < SWARM_TRAIL_POINTS - 1; s++) {
        const seg = segment(buffer, 0, s)
        if (seg.from[0] === seg.to[0] && seg.from[1] === seg.to[1]) continue
        const a = resolve(seg.from[0], seg.fromPartnerX, offset)
        const b = resolve(seg.to[0], seg.toPartnerX, offset)
        // The drawn length must stay the true step, never most of the world.
        expect(Math.abs(a - b)).toBeLessThan(0.5)
      }
    }
  })

  it('joins consecutive samples end to end', () => {
    const points = straightTrail()
    const buffer = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE)
    packSwarmTrail(buffer, 0, points)

    for (let s = 0; s < SWARM_TRAIL_POINTS - 1; s++) {
      const { from, to } = segment(buffer, 0, s)
      expect(from[0]).toBeCloseTo(points[s].mercatorX, 6)
      expect(to[0]).toBeCloseTo(points[s + 1].mercatorX, 6)
    }
  })

  it('keeps the antimeridian step and draws it the short way round', () => {
    /* An orbit marching steadily east over the seam: every step is 0.005 of the
       world except the one that wraps, which reads as -0.995 in raw mercator x. */
    const step = 0.005
    const points = Array.from({ length: SWARM_TRAIL_POINTS }, (_, i) =>
      point((0.9 + i * step) % 1),
    )
    const crossing = points.findIndex((p, i) => i > 0 && p.mercatorX < points[i - 1].mercatorX)
    expect(crossing).toBeGreaterThan(0)

    const buffer = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE)
    packSwarmTrail(buffer, 0, points)

    // The wrapping step survives as a real segment: the seam is the shader's job.
    const wrapped = segment(buffer, 0, crossing - 1)
    expect(wrapped.from).not.toEqual(wrapped.to)

    const resolve = (x: number, partner: number) => (partner - x > 0.5 ? x + 1 : x)
    const a = resolve(wrapped.from[0], wrapped.fromPartnerX)
    const b = resolve(wrapped.to[0], wrapped.toPartnerX)
    expect(Math.abs(a - b)).toBeCloseTo(step, 6)

    // Every step of the trail is drawn; nothing is dropped at the seam.
    for (let s = 0; s < SWARM_TRAIL_POINTS - 1; s++) {
      const { from, to } = segment(buffer, 0, s)
      expect(from).not.toEqual(to)
    }
  })

  it('breaks a skipped-perigee chord of a deep ellipse, not a date-line step', () => {
    const points = Array.from({ length: SWARM_TRAIL_POINTS }, () => point(0.5, 0.5))
    points[0] = point(0.5, 0.5)
    points[1] = point(0.5 + 80 / 360, 0.5)
    const buffer = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE)
    packSwarmTrail(buffer, 0, points)
    const skipped = segment(buffer, 0, 0)
    expect(skipped.from).toEqual(skipped.to)
  })

  it('breaks the trail where the propagator produced nothing', () => {
    const points: (SwarmTrailPoint | null)[] = straightTrail()
    points[20] = null
    const buffer = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE)
    packSwarmTrail(buffer, 0, points)

    // Both the step into the gap and the step out of it are degenerate.
    const into = segment(buffer, 0, 19)
    const outOf = segment(buffer, 0, 20)
    expect(into.from).toEqual(into.to)
    expect(outOf.from).toEqual(outOf.to)

    const intact = segment(buffer, 0, 21)
    expect(intact.from).not.toEqual(intact.to)
  })

  it('writes each satellite at its own offset and leaves its neighbours alone', () => {
    const buffer = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE * 3)
    packSwarmTrail(buffer, 1, straightTrail())

    expect(segment(buffer, 0, 0).from).toEqual([0, 0, 0])
    expect(segment(buffer, 2, 0).from).toEqual([0, 0, 0])
    expect(segment(buffer, 1, 0).from[0]).toBeCloseTo(0.2, 6)
  })

  it('carries elevation through both endpoints', () => {
    const points = straightTrail()
    points[0] = point(0.2, 0.5, 400_000)
    points[1] = point(0.201, 0.5, 420_000)
    const buffer = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE)
    packSwarmTrail(buffer, 0, points)

    const first = segment(buffer, 0, 0)
    expect(first.from[2]).toBeCloseTo(400_000, 0)
    expect(first.to[2]).toBeCloseTo(420_000, 0)
  })
})
