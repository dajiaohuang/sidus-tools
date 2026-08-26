/**
 * Camera geometry for the globe view: how far out the view has to be before an
 * ELEVATED target can be centred at a given tilt, and how large the planet
 * itself is on screen.
 *
 * Pure math, no React and no MapLibre. Every MapLibre quantity it depends on
 * (camera distance, globe radius in pixels) is passed in or reproduced from the
 * library's own formulas, cited below.
 *
 * ## Why a tilt implies a zoom
 *
 * MapLibre centres on a GROUND point. With the altitude layer on, the dot the
 * user sees is drawn hundreds of kilometres up, so centring it means steering
 * the ground centre until the ray from the camera THROUGH the satellite reaches
 * that centre. That ray only comes back down to the planet while the camera is
 * farther from Earth's centre than the satellite is: starting below the
 * satellite's radius, the ray's distance from the centre only grows past it, so
 * no ground centre exists that puts the dot on the screen centre. Tilting
 * lowers the camera (its height above the centre point goes with cos(pitch)),
 * so past some tilt the only cure is altitude, i.e. zooming out.
 *
 * ## The closed form
 *
 * The camera sits `d` metres from the centre point, tilted by the pitch `p`, so
 * its distance from Earth's centre is
 *
 *     |C|^2 = (R + d cos p)^2 + (d sin p)^2 = R^2 + 2 R d cos p + d^2.
 *
 * Requiring |C| >= R + K h and writing u = d / R gives, after cancelling R,
 *
 *     u >= sqrt(cos^2 p + A) - cos p,   A = 2 K h / R + (K h / R)^2.
 *
 * MapLibre ties `d` to the zoom. Its camera is
 * `0.5 / tan(fov / 2) * height` pixels from the centre
 * (transform_helper.ts, `_cameraToCenterDistance`), and the globe's radius on
 * screen is `worldSize / (2 pi) / cos(lat)` pixels with `worldSize = 512 * 2^Z`
 * (globe_utils.ts, `getGlobeRadiusPixels`; the latitude term is MapLibre
 * keeping zoom levels consistent with the flat view). One pixel is therefore
 * `R * 2 pi * cos(lat) / (512 * 2^Z)` metres at the centre, so
 *
 *     u = pi * height * cos(lat) / (512 * tan(fov / 2) * 2^Z)
 *
 * and inverting for Z gives the ceiling below. Earth's radius cancels out of
 * `u` entirely; it survives only inside A, as the ratio h / R.
 */

import { EARTH_RADIUS } from '@/lib/physics/constants'
import { GLOBE_RADIUS_M } from './track'

const DEG = Math.PI / 180

/** MapLibre's tile size in CSS pixels: `worldSize = TILE_SIZE * 2^zoom`. */
const TILE_SIZE_PX = 512

/**
 * Margin over the bare geometric limit, as a multiple of the satellite's
 * altitude: the camera is kept at least `K` satellite altitudes above the
 * ground rather than a hair above one.
 *
 * At K = 1 the camera sits exactly at the satellite's radius, the ray through
 * it is tangent, and two things diverge together: the ground centre the chase
 * has to steer to, and the loop's plant gain |C| / (|C| - R - h). The chase
 * would be asked for an unbounded offset with an unbounded gain, which is not
 * a camera, it is a numerical accident. K is measured, not guessed: the
 * centring loop was swept against pitch at fixed zoom and this is the smallest
 * margin at which every tilt from 0 to 80 deg settles inside the 3 px
 * acceptance (see the report accompanying this change).
 */
export const FOLLOW_CAMERA_ALTITUDE_MARGIN = 2.4

/**
 * Pitch the chase enters at, scaled DOWN as the orbit climbs.
 *
 * The cinematic 80-degree chase was designed for LEO, where the satellite
 * rides a few hundred kilometres over the ground and the camera can lean into
 * its motion. Fed a MEO navigation bird at 21,500 km it produced a spec
 * nobody designed: the elevated-centre lead grows to 67 degrees of ground
 * arc, the zoom ceiling collapses toward one, and "follow" flew the camera to
 * the far side of a hemisphere, which is what "follow does not work at all
 * on BeiDou" looked like from the chair.
 *
 * The scale is the altitude against the planet's own radius: at one Earth
 * radius up and beyond, the only chase that means anything is straight down,
 * where the lead is exactly zero and the satellite sits on the centre by
 * construction. The ISS keeps about 75 of its 80 degrees; GPS, BeiDou and GEO
 * go top-down.
 */
export function followPitchDeg(altitudeM: number, maxPitchDeg: number): number {
  if (!(altitudeM > 0)) return maxPitchDeg
  return maxPitchDeg * Math.max(0, 1 - altitudeM / GLOBE_RADIUS_M)
}

/**
 * Zoom levels pulled back from the geometric ceiling so a framed target sits
 * inside the view, not on the aiming limit. High ellipticals (ARKTIKA-M at
 * apogee is ~40,000 km) need that slack or the marker rides the limb.
 */
export const FRAME_ZOOM_SLACK = 0.45

/** Regional zoom when the marker is on the ground (altitude layer off). */
const FRAME_GROUND_ZOOM = 3.5

/**
 * One-shot look at a satellite: turn the planet so the target sits on the
 * camera–Earth line (nadir, north up). This is not Follow: no heading lock,
 * no chase pitch. High orbits only change the zoom, so a marker drawn
 * outside the globe stays on screen.
 */
export function frameSatelliteCamera(params: {
  lonDeg: number
  latDeg: number
  altitudeM: number
  /** True when the marker is drawn at altitude, not on the ground. */
  elevated: boolean
  fovRad: number
  canvasCssHeight: number
}): {
  lonDeg: number
  latDeg: number
  bearingDeg: number
  pitchDeg: number
  zoom: number
} {
  const { lonDeg, latDeg, altitudeM, elevated, fovRad, canvasCssHeight } = params
  if (!elevated || !(altitudeM > 0)) {
    return { lonDeg, latDeg, bearingDeg: 0, pitchDeg: 0, zoom: FRAME_GROUND_ZOOM }
  }
  const ceiling = followZoomCeiling({
    pitchDeg: 0,
    altitudeM,
    fovRad,
    canvasCssHeight,
    centerLatDeg: latDeg,
  })
  const zoom = Number.isFinite(ceiling) ? ceiling - FRAME_ZOOM_SLACK : FRAME_GROUND_ZOOM
  return { lonDeg, latDeg, bearingDeg: 0, pitchDeg: 0, zoom }
}

/**
 * Highest zoom at which the elevated target is still centrable.
 *
 * Returns +Infinity when the geometry does not constrain the zoom (no
 * altitude), so callers can clamp with a plain `Math.min`.
 */
export function followZoomCeiling(params: {
  pitchDeg: number
  /** Target altitude above the surface, metres. Zero leaves the zoom free. */
  altitudeM: number
  /** Live vertical field of view, radians. */
  fovRad: number
  /** Canvas height in CSS pixels. */
  canvasCssHeight: number
  /** Latitude of the map centre, degrees. */
  centerLatDeg: number
  /** Defaults to the measured margin; a parameter so the sweep can vary it. */
  margin?: number
}): number {
  const { pitchDeg, altitudeM, fovRad, canvasCssHeight, centerLatDeg } = params
  const margin = params.margin ?? FOLLOW_CAMERA_ALTITUDE_MARGIN
  if (!(altitudeM > 0) || !(fovRad > 0) || !(canvasCssHeight > 0)) return Infinity

  const ratio = (margin * altitudeM) / EARTH_RADIUS
  const a = 2 * ratio + ratio * ratio
  const cosPitch = Math.cos(pitchDeg * DEG)
  const uMin = Math.sqrt(cosPitch * cosPitch + a) - cosPitch
  if (!(uMin > 0)) return Infinity

  const cosLat = Math.cos(Math.min(85, Math.abs(centerLatDeg)) * DEG)
  const numerator = Math.PI * canvasCssHeight * cosLat
  return Math.log2(numerator / (TILE_SIZE_PX * Math.tan(fovRad / 2) * uMin))
}

/**
 * The zoom that keeps the apparent ground scale constant across a change of
 * centre latitude. MapLibre zoom is mercator scale at the centre latitude
 * (m/px scales with cos(lat) / 2^zoom), so holding the on-screen scale while
 * the centre moves toward a pole requires exactly this log2-cosine step:
 * equator to 60 degrees is one whole zoom level down.
 *
 * Guarded on the latitudes themselves, not on the cosine: the correction
 * genuinely diverges at the poles, so a latitude at or beyond 90 degrees is
 * refused as undefined rather than approximated from `Math.cos(pi/2)`, which
 * is not exactly zero in floating point. The negated comparison also refuses
 * NaN.
 */
export function latCompensatedZoom(zoom: number, fromLatDeg: number, toLatDeg: number): number {
  if (!(Math.abs(fromLatDeg) < 90) || !(Math.abs(toLatDeg) < 90)) return zoom
  const from = Math.cos((fromLatDeg * Math.PI) / 180)
  const to = Math.cos((toLatDeg * Math.PI) / 180)
  return zoom + Math.log2(to / from)
}

/**
 * Angular distance from the sub-satellite point to the map centre that puts an
 * ELEVATED target exactly on the screen centre. Radians, measured along the
 * camera's bearing, ahead of the satellite.
 *
 * MapLibre centres on a ground point, so a target drawn hundreds of kilometres
 * up does not land on the screen centre when the centre is the point beneath
 * it: the camera has to aim PAST the satellite, at the ground the centre ray
 * reaches after passing through it.
 *
 * Solved exactly rather than searched for. Work in the vertical plane that
 * contains the camera, the map centre C and the satellite S (they are collinear
 * by definition of "on the screen centre", and the camera is by construction in
 * C's vertical plane along the bearing, so S is in it too). With the sphere as
 * the unit circle, C at angle 0, the satellite's ground point at angle -g, the
 * camera at `C * (1 + u cos p) - f * (u sin p)` and S at `rho * G`, requiring
 * S - camera to be parallel to C - camera collapses, after dividing out u, to
 *
 *     rho * sin(p - g) = sin(p)
 *
 * so g = p - asin(sin p / rho). The camera distance u cancels: the answer
 * depends only on the tilt and the target's radius, NOT on the zoom. And since
 * sin(p) / rho < 1 for every pitch below 90 deg, a centre always exists.
 *
 * `rho` uses MapLibre's own globe radius, the same constant the altitude layer
 * scales elevation by, so this inverts exactly what that layer draws.
 */
export function elevatedCenterLeadRad(pitchDeg: number, altitudeM: number): number {
  if (!(altitudeM > 0)) return 0
  const rho = 1 + altitudeM / GLOBE_RADIUS_M
  const pitch = Math.min(89.9, Math.max(0, pitchDeg)) * DEG
  return pitch - Math.asin(Math.sin(pitch) / rho)
}

/**
 * Point at `angularDistanceRad` from a start point along a great circle in the
 * given bearing. The standard spherical direct problem; degrees in and out.
 */
export function destinationPoint(
  lonDeg: number,
  latDeg: number,
  bearingDeg: number,
  angularDistanceRad: number,
): { lonDeg: number; latDeg: number } {
  if (!(Math.abs(angularDistanceRad) > 1e-12)) return { lonDeg, latDeg }
  const lat = latDeg * DEG
  const lon = lonDeg * DEG
  const bearing = bearingDeg * DEG
  const sinLat = Math.sin(lat)
  const cosLat = Math.cos(lat)
  const sinD = Math.sin(angularDistanceRad)
  const cosD = Math.cos(angularDistanceRad)
  const nextLat = Math.asin(
    Math.max(-1, Math.min(1, sinLat * cosD + cosLat * sinD * Math.cos(bearing))),
  )
  const nextLon =
    lon + Math.atan2(Math.sin(bearing) * sinD * cosLat, cosD - sinLat * Math.sin(nextLat))
  return { lonDeg: (nextLon / DEG + 540) % 360 - 180, latDeg: nextLat / DEG }
}

/** Initial great-circle azimuth from one point to another, degrees clockwise from north. */
export function initialBearingDeg(
  fromLonDeg: number,
  fromLatDeg: number,
  toLonDeg: number,
  toLatDeg: number,
): number {
  const lat1 = fromLatDeg * DEG
  const lat2 = toLatDeg * DEG
  const dLon = (toLonDeg - fromLonDeg) * DEG
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return ((Math.atan2(y, x) / DEG) % 360 + 360) % 360
}

/**
 * Convergence bound for the azimuth correction below. A millionth of a degree
 * is about 11 cm of arc: far past anything a pixel can show, and reached in two
 * or three passes at mid latitudes. The cap only matters near the poles, where
 * meridians converge fastest and the first guess is furthest off.
 */
const CENTER_AZIMUTH_TOLERANCE_DEG = 1e-9
const CENTER_AZIMUTH_MAX_PASSES = 8
/** One secant step cannot jump more than this; polar leads would otherwise flip roots. */
const CENTER_AZIMUTH_MAX_STEP_DEG = 20

/**
 * Map centre that puts an elevated target at the screen centre for a camera
 * holding `cameraBearingDeg`.
 *
 * Not simply "walk `leadRad` from the target along the bearing". A great circle
 * does not hold its azimuth: meridians converge, so a path leaving the
 * satellite at azimuth b arrives at the centre pointing somewhere else. The
 * camera's vertical plane is the one at the CENTRE along ITS bearing, so what
 * has to hold is that walking BACK from the centre at `bearing + 180` for
 * `leadRad` lands on the satellite. Getting this wrong tilts the whole
 * correction sideways: measured at 50.7 deg latitude with a 12.6 deg lead, the
 * azimuth is off by 11.3 deg and the drawn dot lands 300 px away from centre
 * even though its vertical error is nil.
 *
 * Solved by correcting the departure azimuth until the arrival azimuth matches.
 * The map is a contraction here (the convergence error shrinks by roughly
 * sin(lat) * lead per pass), so a fixed four passes is exact to float noise
 * and cheaper than a closed form with four more trig calls.
 */
export function centerForElevatedTarget(
  targetLonDeg: number,
  targetLatDeg: number,
  cameraBearingDeg: number,
  leadRad: number,
): { lonDeg: number; latDeg: number } {
  if (!(leadRad > 1e-12)) return { lonDeg: targetLonDeg, latDeg: targetLatDeg }
  /* Walking the lead over a pole flips longitude by ~180 deg. A 1 deg heading
     change then hops the centre to the opposite meridian: the follow view
     yaws left-right by itself. Cap the poleward component so the path stays
     on this side of 89 deg. */
  const poleward = Math.sign(targetLatDeg || 1) * Math.cos(cameraBearingDeg * DEG)
  if (poleward > 0) {
    const roomRad = (89 - Math.abs(targetLatDeg)) * DEG
    leadRad = Math.min(leadRad, Math.max(0, roomRad))
    if (!(leadRad > 1e-12)) return { lonDeg: targetLonDeg, latDeg: targetLatDeg }
  }
  /** How far the camera's bearing at the centre misses, for a given departure. */
  const miss = (departureDeg: number) => {
    const center = destinationPoint(targetLonDeg, targetLatDeg, departureDeg, leadRad)
    const arrival =
      initialBearingDeg(center.lonDeg, center.latDeg, targetLonDeg, targetLatDeg) + 180
    return {
      center,
      error: (((arrival - cameraBearingDeg) % 360) + 540) % 360 - 180,
    }
  }

  let previousDeparture = cameraBearingDeg
  let previous = miss(previousDeparture)
  if (Math.abs(previous.error) < CENTER_AZIMUTH_TOLERANCE_DEG) return previous.center
  /* Secant: meridian convergence grows with latitude, so a naive subtract
     overshoots near the poles. Clamp the step and keep the lowest-error
     iterate so a polar chase cannot flip between two roots each frame. */
  let departure = previousDeparture - previous.error
  let best = previous
  for (let pass = 0; pass < CENTER_AZIMUTH_MAX_PASSES; pass++) {
    const current = miss(departure)
    if (Math.abs(current.error) < Math.abs(best.error)) best = current
    if (Math.abs(current.error) < CENTER_AZIMUTH_TOLERANCE_DEG) return current.center
    const delta = departure - previousDeparture
    const slope = Math.abs(delta) < 1e-12 ? NaN : (current.error - previous.error) / delta
    previousDeparture = departure
    previous = current
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-9) break
    let step = current.error / slope
    if (!Number.isFinite(step)) break
    if (Math.abs(step) > CENTER_AZIMUTH_MAX_STEP_DEG) {
      step = Math.sign(step) * CENTER_AZIMUTH_MAX_STEP_DEG
    }
    departure -= step
  }
  return best.center
}

/**
 * Tilt used when aiming at a sky direction. Steep enough to be looking out at
 * the sky rather than down at the ground, with room under MapLibre's 80 deg
 * ceiling for the user to tilt further afterwards.
 */
export const SKY_AIM_PITCH_DEG = 75

/**
 * How far ABOVE the centre ray the aimed body is placed.
 *
 * Not zero, and this is the interesting part. The canvas centre always shows
 * the map centre, which is a point on the planet's surface, so a direction that
 * landed exactly on the canvas centre would be a direction straight into the
 * ground: the body would be behind Earth, and correctly hidden. The aim
 * therefore parks the body just clear of the limb instead, which is the closest
 * to centred a sky object can honestly be on a globe. Measured against the Sun
 * billboard at the tool's usual zooms; see the report for the sweep.
 */
export const SKY_AIM_ABOVE_CENTER_DEG = 12

/**
 * Camera that points at a direction at infinity.
 *
 * Bearing and pitch alone cannot aim at the sky, which is worth stating because
 * it is the obvious thing to try. The centre ray runs from the camera down to
 * the map centre, so in the centre's own frame it is
 * `-up * cos(pitch) + forward * sin(pitch)`: its elevation is `pitch - 90 deg`,
 * never above the local horizon. Bringing a body overhead into view means
 * turning the planet, so the map CENTRE moves too.
 *
 * The geometry, all in the plane through the centre and the direction's own
 * sub-point: with the centre `theta` degrees from the sub-point, the body's
 * elevation at the centre is `90 - theta`, and the centre ray's is
 * `pitch - 90`, so the body sits `180 - theta - pitch` degrees above the centre
 * of the screen. Fixing that offset and the pitch fixes theta. Of the whole
 * circle of solutions this takes the one on the great circle through the
 * current centre, so the globe turns the short way, and aims the bearing back
 * along it toward the sub-point.
 */
export function skyAimCamera(
  direction: readonly [number, number, number],
  fromLonDeg: number,
  fromLatDeg: number,
  pitchDeg = SKY_AIM_PITCH_DEG,
  aboveCenterDeg = SKY_AIM_ABOVE_CENTER_DEG,
): { lonDeg: number; latDeg: number; bearingDeg: number; pitchDeg: number } | null {
  const [x, y, z] = direction
  const length = Math.hypot(x, y, z)
  if (!(length > 0)) return null
  /* Inverse of sphereDirection: the world frame's x is sin(lon) and z is
     cos(lon), so the longitude is atan2(x, z), not the usual atan2(y, x). */
  const subLonDeg = (Math.atan2(x / length, z / length) * 180) / Math.PI
  const subLatDeg = (Math.asin(Math.max(-1, Math.min(1, y / length))) * 180) / Math.PI

  const away = (180 - pitchDeg - aboveCenterDeg) * DEG
  const towardCurrent = initialBearingDeg(subLonDeg, subLatDeg, fromLonDeg, fromLatDeg)
  const center = destinationPoint(subLonDeg, subLatDeg, towardCurrent, away)
  return {
    lonDeg: center.lonDeg,
    latDeg: center.latDeg,
    bearingDeg: initialBearingDeg(center.lonDeg, center.latDeg, subLonDeg, subLatDeg),
    pitchDeg,
  }
}

/**
 * Distance from Earth's centre to the camera, in planet radii, read back from
 * the clipping plane MapLibre hands custom layers.
 *
 * The horizon plane of a camera at distance D is `x . n = 1 / D` for the unit
 * sphere, so normalising the plane recovers D directly. This is the measured
 * counterpart of the closed form above: same quantity, taken from the live
 * frame instead of derived from the zoom.
 */
export function cameraDistanceInRadii(
  clippingPlane: readonly [number, number, number, number],
): number | null {
  const [px, py, pz, pw] = clippingPlane
  const length = Math.hypot(px, py, pz)
  if (!(length > 0)) return null
  const invDistance = -pw / length
  if (!(invDistance > 0)) return null
  return 1 / invDistance
}

/**
 * Radius of the planet on screen, CSS pixels, from the live frame.
 *
 * A sphere of radius R seen from distance D * R covers a cone of half angle
 * asin(1 / D), and a half angle maps to `(height / 2) * tan(angle) /
 * tan(fov / 2)` pixels from the centre under a perspective camera. Measured
 * from the frame rather than from the zoom, so it stays right through the
 * globe-to-mercator transition and any future change of camera model. It is
 * what a wider scene has to match to hand the view over without a jump.
 */
export function globeScreenRadiusPx(
  clippingPlane: readonly [number, number, number, number],
  fovRad: number,
  canvasCssHeight: number,
): number | null {
  const distance = cameraDistanceInRadii(clippingPlane)
  if (distance === null || !(distance > 1) || !(fovRad > 0) || !(canvasCssHeight > 0)) return null
  return (canvasCssHeight / 2) * (Math.tan(Math.asin(1 / distance)) / Math.tan(fovRad / 2))
}

/**
 * Longest step the attract-mode rotate will take. A dropped frame must not
 * become a visible jump; 1/30 s is one tick of a 30 fps hitch.
 */
export const AUTO_ROTATE_MAX_DT_S = 1 / 30

/** Longitude into (-180, 180]. */
export function wrapLngDeg(lng: number): number {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180
  return wrapped === -180 ? 180 : wrapped
}

/** Next centre longitude for a constant-rate eastward drift. */
export function autoRotateLngDeg(lng: number, rateDegPerS: number, dtSeconds: number): number {
  const dt = Math.min(AUTO_ROTATE_MAX_DT_S, Math.max(0, dtSeconds))
  return wrapLngDeg(lng + rateDegPerS * dt)
}
