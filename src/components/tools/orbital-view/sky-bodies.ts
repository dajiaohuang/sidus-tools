/**
 * The globe's sky, built for one instant: each enabled body's inertial
 * direction, its true angular size, and its ORBIT as a closed ring.
 *
 * Everything here is inertial, right ascension where longitude would be, no
 * instant baked in, so the drawing side can spend the current sidereal angle
 * per frame and the sky sweeps instead of stepping on the ephemeris tick.
 *
 * The ring is parameterised by MEAN ANOMALY, not by time, and that is the
 * whole trick: sweeping time would carry Earth along and fold one parallax
 * loop per year into the curve: twelve for Jupiter, a hundred and sixty five
 * for Neptune. Earth is held where it is and the body is walked round its own
 * ellipse instead, so what closes is the orbit itself.
 */

import {
  bodyApparentAngularDiameterRad,
  bodyGeocentricEquatorialOfDateSi,
  getBody,
  moonGeocentricMeanOfDateSi,
  orbitMeanAnomalyRad,
  planetOrbitGeocentricOfDateSi,
  SIDEREAL_MONTH_MS,
  sunEciSi,
  sunOrbitGeocentricOfDateSi,
  type ObservableBodyId,
  type PlanetId,
} from '@/lib/physics'
import { SUN_ANGULAR_DIAMETER_DEG } from '@/components/viz/globe/sun'
import {
  skyBodyColor,
  SKY_PATH_SAMPLES,
  type SkyBody,
  type SkyBodyId,
} from '@/components/viz/globe/celestial'
import { inertialDirectionOf } from './sky-math'

const TAU = 2 * Math.PI

/** Geocentric equatorial-of-date position of a body, metres. */
export function geocentricEciOf(id: SkyBodyId, at: Date): readonly number[] {
  return id === 'sun' ? sunEciSi(at) : bodyGeocentricEquatorialOfDateSi(id as ObservableBodyId, at)
}

/** Every enabled body, dressed for the globe, at the given ephemeris instant. */
export function buildSkyBodies(enabledSky: readonly SkyBodyId[], solarInstantMs: number): SkyBody[] {
  if (enabledSky.length === 0) return []
  const date = new Date(solarInstantMs)
  return enabledSky.map((id) => {
    const directionAt = (timeMs: number) =>
      inertialDirectionOf(geocentricEciOf(id, new Date(timeMs)))
    const pathPointAt = (turns: number) =>
      inertialDirectionOf(
        id === 'sun'
          ? sunOrbitGeocentricOfDateSi(date, turns * TAU)
          : id === 'moon'
            ? moonGeocentricMeanOfDateSi(new Date(solarInstantMs + turns * SIDEREAL_MONTH_MS))
            : planetOrbitGeocentricOfDateSi(id as PlanetId, date, turns * TAU),
      )
    /* Where the body sits on its own ring right now, so the marker lands ON
       the line rather than beside it. The Moon's ring is swept in time from
       now, so its own place is the start of it. */
    const nowTurns =
      id === 'moon' ? 0 : orbitMeanAnomalyRad(id === 'sun' ? 'earth' : (id as PlanetId), date) / TAU
    const path: [number, number, number][] = []
    const pathParams: number[] = []
    for (let i = 0; i <= SKY_PATH_SAMPLES; i++) {
      // From the body's own position round to itself: the ring closes exactly.
      const turns = nowTurns + i / SKY_PATH_SAMPLES
      pathParams.push(turns)
      path.push(pathPointAt(turns))
    }
    return {
      id,
      color: skyBodyColor(id, getBody(id).color),
      direction: directionAt(solarInstantMs),
      angularDiameterRad:
        id === 'sun'
          ? SUN_ANGULAR_DIAMETER_DEG * (Math.PI / 180)
          : bodyApparentAngularDiameterRad(id as ObservableBodyId, date),
      path,
      pathParams,
      pathPointAt,
      directionAt,
    }
  })
}
