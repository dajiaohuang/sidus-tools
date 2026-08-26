import { describe, expect, it } from 'vitest'
import { parseTle, SAMPLE_ISS_TLE, eciSiToGeodetic, propagateEci } from '@/lib/physics'
import { SWARM_FLOATS_PER_SATELLITE } from '@/components/viz/globe/swarm'
import { SWARM_TRAIL_FLOATS_PER_SATELLITE, SWARM_TRAIL_FLOATS_PER_VERTEX } from '@/components/viz/globe/swarm-trails'
import { sampleInertialGeodeticTrack, trackPointAt } from '@/components/tools/orbital-view/propagation'
import { produceKeyframe, produceTrailBatch, toMercator } from './swarm-production'

const iss = (() => {
  const parsed = parseTle(SAMPLE_ISS_TLE)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.satrec
})()

const rgb: [number, number, number] = [1, 0.5, 0]
const epoch = Date.parse('2026-08-24T12:00:00Z')

describe('produceKeyframe inertial freeze', () => {
  it('matches SGP4 at the freeze epoch for the start sample', () => {
    const packed = new Float32Array(SWARM_FLOATS_PER_SATELLITE)
    const indices = new Uint32Array(1)
    produceKeyframe([iss], [rgb], epoch, 2000, packed, indices, true, epoch)
    expect(packed[0]).toBeGreaterThan(0)
    const state = propagateEci(iss, new Date(epoch))
    expect(state).toBeTruthy()
    const geo = eciSiToGeodetic(state!.r, new Date(epoch))
    expect(geo).toBeTruthy()
    const merc = toMercator(geo!.lonDeg, geo!.latDeg)
    expect(packed[0]).toBeCloseTo(merc.mercatorX, 6)
    expect(packed[1]).toBeCloseTo(merc.mercatorY, 6)
    expect(packed[2]).toBeCloseTo(geo!.heightM, 0)
  })

  it('converts both keyframe ends with the same Greenwich angle', () => {
    const span = 60_000
    const inertial = new Float32Array(SWARM_FLOATS_PER_SATELLITE)
    const ecef = new Float32Array(SWARM_FLOATS_PER_SATELLITE)
    const indices = new Uint32Array(1)
    produceKeyframe([iss], [rgb], epoch, span, inertial, indices, true, epoch)
    produceKeyframe([iss], [rgb], epoch, span, ecef, indices, false)
    expect(inertial[0]).toBeCloseTo(ecef[0], 6)
    expect(inertial[1]).toBeCloseTo(ecef[1], 6)
    const endInertial = inertial[0] + inertial[3]
    const endEcef = ecef[0] + ecef[3]
    expect(Math.abs(endInertial - endEcef)).toBeGreaterThan(1e-5)
  })

  it('keeps the interpolated mid-span on the frozen SGP4 position', () => {
    const packed = new Float32Array(SWARM_FLOATS_PER_SATELLITE)
    const indices = new Uint32Array(1)
    produceKeyframe([iss], [rgb], epoch, 2000, packed, indices, true, epoch)
    const midX = packed[0] + 0.5 * packed[3]
    const midY = packed[1] + 0.5 * packed[4]
    const state = propagateEci(iss, new Date(epoch + 1000))
    expect(state).toBeTruthy()
    const geo = eciSiToGeodetic(state!.r, new Date(epoch))
    expect(geo).toBeTruthy()
    const merc = toMercator(geo!.lonDeg, geo!.latDeg)
    expect(midX).toBeCloseTo(merc.mercatorX, 5)
    expect(midY).toBeCloseTo(merc.mercatorY, 5)
  })
})

describe('produceKeyframe skipIndex', () => {
  it('leaves an empty slot so the next satellite keeps its index', () => {
    const both = new Float32Array(2 * SWARM_FLOATS_PER_SATELLITE)
    const skipped = new Float32Array(2 * SWARM_FLOATS_PER_SATELLITE)
    const indices = new Uint32Array(2)
    produceKeyframe([iss, iss], [rgb, rgb], epoch, 2000, both, indices, false)
    const result = produceKeyframe(
      [iss, iss],
      [rgb, rgb],
      epoch,
      2000,
      skipped,
      indices,
      false,
      undefined,
      0,
    )
    expect(result.count).toBe(2)
    expect(indices[0]).toBe(0)
    expect(indices[1]).toBe(1)
    expect(result.skipped).toBe(1)
    expect(Number.isNaN(skipped[0])).toBe(true)
    expect(skipped[SWARM_FLOATS_PER_SATELLITE]).toBeCloseTo(
      both[SWARM_FLOATS_PER_SATELLITE],
      6,
    )
  })

  it('does not resurrect a skipped satellite from the previous keyframe', () => {
    const previous = new Float32Array(SWARM_FLOATS_PER_SATELLITE)
    produceKeyframe([iss], [rgb], epoch, 2000, previous, new Uint32Array(1), false)
    const held = new Float32Array(SWARM_FLOATS_PER_SATELLITE)
    const result = produceKeyframe(
      [iss],
      [rgb],
      epoch,
      2000,
      held,
      new Uint32Array(1),
      false,
      undefined,
      0,
      previous,
    )
    expect(result.count).toBe(1)
    expect(Number.isNaN(held[0])).toBe(true)
  })
})

describe('produceTrailBatch inertial freeze', () => {
  it('puts the freeze-epoch keyframe on the inertial trail', () => {
    const packed = new Float32Array(SWARM_FLOATS_PER_SATELLITE)
    const indices = new Uint32Array(1)
    produceKeyframe([iss], [rgb], epoch, 2000, packed, indices, true, epoch)
    const trail = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE)
    produceTrailBatch([iss], [rgb], 0, 1, epoch, 0.5, trail, true, epoch)
    let min = Infinity
    const stride = SWARM_TRAIL_FLOATS_PER_VERTEX * 2
    for (let at = 0; at < trail.length; at += stride) {
      min = Math.min(min, Math.hypot(trail[at] - packed[0], trail[at + 1] - packed[1]))
    }
    expect(min).toBeLessThan(0.008)
  })
})

describe('identified full-treatment vs swarm Greenwich freeze', () => {
  it('puts the identified live point on the swarm keyframe when freeze matches', () => {
    const freeze = epoch
    const at = epoch + 30_000
    const packed = new Float32Array(SWARM_FLOATS_PER_SATELLITE)
    const indices = new Uint32Array(1)
    produceKeyframe([iss], [rgb], at, 2000, packed, indices, true, freeze)
    const here = trackPointAt(iss, new Date(at), new Date(freeze))
    expect(here).toBeTruthy()
    const merc = toMercator(here!.lon, here!.lat)
    expect(packed[0]).toBeCloseTo(merc.mercatorX, 5)
    expect(packed[1]).toBeCloseTo(merc.mercatorY, 5)
    const ring = sampleInertialGeodeticTrack(iss, at, 0.5, undefined, freeze)
    const state = propagateEci(iss, new Date(at))
    expect(state).toBeTruthy()
    const geo = eciSiToGeodetic(state!.r, new Date(freeze))
    expect(geo).toBeTruthy()
    expect(here!.lon).toBeCloseTo(geo!.lonDeg, 6)
    expect(ring.length).toBeGreaterThan(20)
  })

  it('walks the identified point off the swarm when freeze is a later 30 s bucket', () => {
    const freeze = epoch
    const at = epoch + 30_000
    const packed = new Float32Array(SWARM_FLOATS_PER_SATELLITE)
    const indices = new Uint32Array(1)
    produceKeyframe([iss], [rgb], at, 2000, packed, indices, true, freeze)
    const here = trackPointAt(iss, new Date(at), new Date(at))
    expect(here).toBeTruthy()
    const merc = toMercator(here!.lon, here!.lat)
    expect(Math.hypot(packed[0] - merc.mercatorX, packed[1] - merc.mercatorY)).toBeGreaterThan(
      1e-4,
    )
  })
})
