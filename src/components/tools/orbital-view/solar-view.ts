/**
 * What the SOLAR scene draws for the selection: each satellite's ECI ring and
 * its live marker facts. Split from the ring builder because the two run on
 * different clocks: a ring is one revolution of shape and barely changes
 * between two ticks, so it rebuilds on a bucket while the markers keep the
 * live cadence.
 */

import { eciSiToGeodetic, propagateEci, type Vec3 } from '@/lib/physics'
import type { SatRec } from 'satellite.js'
import type { SolarSatellite } from '@/components/viz/SolarSystemScene'
import { sampleEciRing } from './propagation'

/** What the builders need to know about one selected satellite. */
export type SolarViewEntry = {
  catnr: string
  name: string
  color: string
  satrec: SatRec | null
}

/** Samples of one revolution for the solar scene's orbit ring. */
export const SATELLITE_RING_SAMPLES = 180
/** Rings re-anchor on this bucket; the markers still move on the live tick. */
export const RING_BUCKET_MS = 30_000

export function buildSolarRings(
  entries: readonly SolarViewEntry[],
  centerMs: number,
): Map<string, Vec3[]> {
  const rings = new Map<string, Vec3[]>()
  for (const entry of entries) {
    if (!entry.satrec) continue
    const ring = sampleEciRing(entry.satrec, centerMs, SATELLITE_RING_SAMPLES)
    if (ring.length > 1) rings.set(entry.catnr, ring)
  }
  return rings
}

export function buildSolarSatellites(
  entries: readonly SolarViewEntry[],
  rings: ReadonlyMap<string, Vec3[]>,
  nowMs: number,
): SolarSatellite[] {
  const at = new Date(nowMs)
  const out: SolarSatellite[] = []
  for (const entry of entries) {
    if (!entry.satrec) continue
    const ring = rings.get(entry.catnr)
    if (!ring) continue
    const state = propagateEci(entry.satrec, at)
    if (!state) continue
    const geo = eciSiToGeodetic(state.r, at)
    out.push({
      id: entry.catnr,
      label: entry.name,
      color: entry.color,
      positionEciM: [state.r[0], state.r[1], state.r[2]],
      orbitEciM: ring,
      altitudeM: geo ? geo.heightM : 0,
      orbitalPeriodS: ((2 * Math.PI) / entry.satrec.no) * 60,
      speedMs: Math.hypot(state.v[0], state.v[1], state.v[2]),
    })
  }
  return out
}
