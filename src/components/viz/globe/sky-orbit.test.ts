/**
 * The sky paths are ORBITS, and this is what that has to mean.
 *
 * An apparent track swept over a fixed window of days fails in two visible
 * ways, so both are pinned:
 *
 *   - it does not CLOSE. Measured against each body's own period, a two-year
 *     window draws 34.9% of Mars's orbit, 16.8% of Jupiter's, 6.8% of
 *     Saturn's, 2.4% of Uranus's and 1.2% of Neptune's: a stub that begins
 *     and ends in empty sky does not read as an orbit.
 *   - it DOUBLES BACK. Sweeping time moves Earth as well, so the curve picks
 *     up one parallax loop per Earth year. A line that turns back through
 *     itself is not an orbit either.
 *
 * Walking the body round its own ellipse with Earth held still avoids both
 * at once, and these tests are the statement of that.
 */

import { describe, expect, it } from 'vitest'
import {
  moonGeocentricMeanOfDateSi,
  orbitMeanAnomalyRad,
  planetOrbitGeocentricOfDateSi,
  SIDEREAL_MONTH_MS,
  sunOrbitGeocentricOfDateSi,
  bodyGeocentricEquatorialOfDateSi,
  sunEciSi,
  type ObservableBodyId,
  type PlanetId,
  type Vec3,
} from '@/lib/physics'
import { worldDirectionOf } from '@/components/tools/orbital-view/sky-math'
import { SKY_BODY_IDS, SKY_PATH_SAMPLES, type SkyBodyId } from './celestial'

const AT = new Date('2026-08-24T12:00:00Z')
const TAU = 2 * Math.PI

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const angleDeg = (a: Vec3, b: Vec3) =>
  (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI

/** Exactly the chain OrbitalViewTool builds a path with. */
function ringOf(id: SkyBodyId, date: Date, samples = SKY_PATH_SAMPLES) {
  const pathPointAt = (turns: number): Vec3 =>
    worldDirectionOf(
      id === 'sun'
        ? sunOrbitGeocentricOfDateSi(date, turns * TAU)
        : id === 'moon'
          ? moonGeocentricMeanOfDateSi(new Date(date.getTime() + turns * SIDEREAL_MONTH_MS))
          : planetOrbitGeocentricOfDateSi(id as PlanetId, date, turns * TAU),
      date,
    )
  const nowTurns =
    id === 'moon'
      ? 0
      : orbitMeanAnomalyRad(id === 'sun' ? 'earth' : (id as PlanetId), date) / TAU
  const path: Vec3[] = []
  for (let i = 0; i <= samples; i++) path.push(pathPointAt(nowTurns + i / samples))
  return path
}

describe('every sky path is a closed ring', () => {
  it('comes back to where it started, for every body', () => {
    for (const id of SKY_BODY_IDS) {
      const ring = ringOf(id, AT)
      /* One turn of mean anomaly returns the body to the same place on its own
         ellipse, and Earth never moved, so the two ends are the same point.
         The Moon is swept in time instead and closes to within its own
         perturbations rather than exactly. */
      expect(angleDeg(ring[0], ring[ring.length - 1])).toBeLessThan(id === 'moon' ? 1.5 : 1e-6)
    }
  })

  it('carries the whole orbit, not a slice of it', () => {
    for (const id of SKY_BODY_IDS) {
      const ring = ringOf(id, AT)
      let travelled = 0
      for (let i = 1; i < ring.length; i++) travelled += angleDeg(ring[i - 1], ring[i])
      /* A ring seen from inside sweeps a full turn; seen from outside its own
         orbit it sweeps twice its apparent radius. Either way a body that drew
         only a fraction of its orbit could not reach this. */
      expect(travelled).toBeGreaterThan(30)
    }
  })
})

describe('no sky path doubles back through itself', () => {
  it('turns the same way the whole way round, for every body', () => {
    /*
     * Parallax loops are reversals: the curve stops, comes back over itself
     * and goes on again. Counting sign changes of the turn is how that shows
     * up numerically, and it is zero for a simple ring.
     */
    for (const id of SKY_BODY_IDS) {
      if (id === 'moon') continue // swept in time, and genuinely perturbed
      const ring = ringOf(id, AT, 720)
      const normal = cross(ring[0], ring[Math.floor(ring.length / 4)])
      let reversals = 0
      let previous = 0
      for (let i = 1; i < ring.length; i++) {
        const step = dot(cross(ring[i - 1], ring[i]), normal)
        if (previous !== 0 && Math.sign(step) !== Math.sign(previous)) reversals++
        previous = step
      }
      /*
       * Two reversals for Mercury and Venus, none for anyone else, and the
       * difference is which side of the orbit Earth is on. Earth sits OUTSIDE
       * theirs, so their ring is a closed loop off to one side of the Sun and
       * the line of sight sweeps out to one elongation limit, turns, and comes
       * back: exactly two turning points, which is the shape of the thing and
       * not a fold. Earth sits INSIDE every other orbit, so the sweep goes all
       * the way round without ever reversing. A parallax loop would show up
       * here as extra pairs on top of these.
       */
      expect(reversals).toBe(id === 'mercury' || id === 'venus' ? 2 : 0)
    }
  })
})

describe('every marker sits on its own ring', () => {
  it('puts the body where its orbit says it is', () => {
    for (const id of SKY_BODY_IDS) {
      const ring = ringOf(id, AT, 720)
      // The tool's own marker chain, so this measures what is actually drawn.
      const marker = worldDirectionOf(
        id === 'sun' ? sunEciSi(AT) : bodyGeocentricEquatorialOfDateSi(id as ObservableBodyId, AT),
        AT,
      )
      let nearest = Infinity
      for (const point of ring) nearest = Math.min(nearest, angleDeg(marker, point))
      /* The ring starts at the body's own mean anomaly, so the very first
         sample IS the marker. Anything above a rounding error here means the
         two were built through different frames. */
      expect(nearest).toBeLessThan(0.05)
    }
  })
})
