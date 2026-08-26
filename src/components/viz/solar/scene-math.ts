/**
 * Geometry for the solar-system scene: frame conversion, orbit sampling, the
 * orthographic camera, sun-phase disks and body orientation vectors.
 *
 * No React and no canvas here, so every rule the scene draws by is unit
 * testable. Inputs are SI (metres, radians) in the J2000 ecliptic frame the
 * physics module returns; outputs are that frame or canvas pixels.
 *
 * ## Frames
 *
 * The scene works in **J2000 ecliptic** metres with the Sun at the origin,
 * because that is what `planetHeliocentricEclipticSi` returns. Two physics
 * outputs arrive in the J2000 **equatorial** frame instead, the Moon's
 * geocentric vector and the IAU pole/prime-meridian directions, and both are
 * rotated here by `eclipticFromEquatorial`.
 *
 * ## Canvas axes
 *
 * Screen space is the canvas convention: x right, y **down**. View-space
 * direction triples (`ViewDir`) follow the same convention with z toward the
 * camera, so a phase disk can be built straight from one without another sign
 * flip inside the render loop.
 */
import {
  J2000_OBLIQUITY_RAD,
  planetPositionFromElementsSi,
  vcross,
  vdot,
  vunit,
  type BodyOrientation,
  type PlanetElements,
  type Vec3,
} from '@/lib/physics'

/**
 * Samples per orbit ellipse. Mean anomaly is stepped uniformly, so points
 * bunch near aphelion where the body moves slowest; 512 keeps Mercury's
 * perihelion arc, the sparsest stretch in the scene, visually smooth.
 */
export const ORBIT_SAMPLES = 512

/**
 * Rotate a J2000 equatorial vector into the J2000 ecliptic frame, about the
 * x-axis (the equinox) by the mean obliquity 23.43928 deg. The angle is the
 * physics module's own `J2000_OBLIQUITY_RAD`, the value the Standish page
 * uses, rather than a second copy of the number.
 */
export function eclipticFromEquatorial(v: Vec3): Vec3 {
  const c = Math.cos(J2000_OBLIQUITY_RAD)
  const s = Math.sin(J2000_OBLIQUITY_RAD)
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]]
}

/**
 * The full orbit ellipse of a planet in J2000 ecliptic metres: one turn of
 * mean anomaly through the element set's own rotations, so the drawn curve
 * carries the true a, e, i, node and perihelion rather than a circle.
 *
 * The last point is a copy of the first, which closes the polyline exactly.
 * Recomputing the position at M = 2*pi would leave a residue of a few metres
 * from the Kepler iteration and a visible seam is not worth that.
 */
export function sampleOrbitEllipse(elements: PlanetElements, samples = ORBIT_SAMPLES): Vec3[] {
  const n = Math.max(360, Math.floor(samples))
  const points: Vec3[] = []
  for (let i = 0; i < n; i++) {
    points.push(planetPositionFromElementsSi(elements, (i / n) * 2 * Math.PI))
  }
  points.push([...points[0]] as Vec3)
  return points
}

/** Orthographic camera over the ecliptic plane. */
export type SolarCamera = {
  /** Azimuth of the camera about the ecliptic +z axis (rad) */
  bearingRad: number
  /** Elevation of the camera above the ecliptic plane (rad) */
  tiltRad: number
  /** Screen scale (px per metre): the one true-scale knob in the scene */
  scalePxPerM: number
  /** World point held at the centre of the viewport (m) */
  centerM: Vec3
}

/** Orthonormal camera axes in world (ecliptic) coordinates. */
export type CameraBasis = {
  /** Screen right */
  right: Vec3
  /** Screen up (canvas y is the negative of this) */
  up: Vec3
  /** Scene toward camera; a point's dot product with it is its depth */
  toCamera: Vec3
}

/**
 * Camera axes for a bearing/tilt pair. `toCamera` is the unit vector at
 * elevation `tiltRad` above the ecliptic plane and azimuth `bearingRad` about
 * +z; `right` is horizontal (it stays in the ecliptic plane), and `up`
 * completes the right-handed triple.
 */
export function cameraBasis(bearingRad: number, tiltRad: number): CameraBasis {
  const cb = Math.cos(bearingRad)
  const sb = Math.sin(bearingRad)
  const ct = Math.cos(tiltRad)
  const st = Math.sin(tiltRad)
  const toCamera: Vec3 = [ct * cb, ct * sb, st]
  const right: Vec3 = [-sb, cb, 0]
  return { right, up: vcross(toCamera, right), toCamera }
}

/** A projected point: canvas pixels plus its depth toward the camera (m). */
export type ScreenPoint = { x: number; y: number; depth: number }

/** Project a world point (m) to canvas pixels in a `w` x `h` viewport. */
export function projectPoint(
  p: Vec3,
  cam: SolarCamera,
  basis: CameraBasis,
  w: number,
  h: number,
): ScreenPoint {
  const d: Vec3 = [p[0] - cam.centerM[0], p[1] - cam.centerM[1], p[2] - cam.centerM[2]]
  return {
    x: w / 2 + vdot(d, basis.right) * cam.scalePxPerM,
    y: h / 2 - vdot(d, basis.up) * cam.scalePxPerM,
    depth: vdot(d, basis.toCamera),
  }
}

/**
 * Slide the camera centre along the view axis until it lies in the ecliptic
 * plane.
 *
 * The slide is invisible: the view axis is perpendicular to both screen axes,
 * so no projected position moves. What it fixes is rotation, which pivots on
 * the centre. A centre left at an arbitrary depth is a pivot that can sit an
 * astronomical unit behind the body the viewer is looking at, and a small drag
 * then throws that body clean off the canvas. In the ecliptic plane the pivot
 * is within a planet's own distance from the plane of whatever is centred.
 *
 * Near an edge-on view the axis is almost parallel to the plane and the
 * intersection runs away, so the centre is left where it is.
 */
export function centerOnEclipticPlane(centerM: Vec3, basis: CameraBasis): Vec3 {
  const axisZ = basis.toCamera[2]
  if (Math.abs(axisZ) < 0.05) return centerM
  const s = -centerM[2] / axisZ
  return [centerM[0] + s * basis.toCamera[0], centerM[1] + s * basis.toCamera[1], 0]
}

/**
 * Move the camera centre so the world point currently under `(px, py)` stays
 * under it after the scale changes by `factor`. Orthographic projection is
 * linear, so only the centre's components along `right` and `up` matter.
 */
export function zoomAtPointer(
  cam: SolarCamera,
  basis: CameraBasis,
  px: number,
  py: number,
  w: number,
  h: number,
  factor: number,
): SolarCamera {
  const nextScale = cam.scalePxPerM * factor
  const dx = px - w / 2
  const dy = h / 2 - py
  const shift = 1 / cam.scalePxPerM - 1 / nextScale
  const moved: Vec3 = [
    cam.centerM[0] + (dx * basis.right[0] + dy * basis.up[0]) * shift,
    cam.centerM[1] + (dx * basis.right[1] + dy * basis.up[1]) * shift,
    cam.centerM[2] + (dx * basis.right[2] + dy * basis.up[2]) * shift,
  ]
  return { ...cam, scalePxPerM: nextScale, centerM: centerOnEclipticPlane(moved, basis) }
}

/** The wheel-return scale actually reachable inside a clamped zoom range. */
export function reachableReturnScale(
  returnPxPerMeter: number,
  basePxPerMeter: number,
  zoomMax: number,
): number {
  return Math.min(returnPxPerMeter, basePxPerMeter * zoomMax)
}

/** A unit direction in view space: x right, y down, z toward the camera. */
export type ViewDir = { x: number; y: number; z: number }

/**
 * A world direction in view space. Multiplying `x` and `y` by a disk radius
 * gives the offset, in canvas pixels, of the surface point that direction
 * picks out; `z` says whether it faces the camera.
 */
export function directionInView(unit: Vec3, basis: CameraBasis): ViewDir {
  return {
    x: vdot(unit, basis.right),
    y: -vdot(unit, basis.up),
    z: vdot(unit, basis.toCamera),
  }
}

/**
 * Unit direction from a body toward the Sun, in view space. The Sun sits at
 * the scene origin, so the direction is simply the reverse of the body's
 * heliocentric position.
 */
export function sunDirectionInView(bodyPosM: Vec3, basis: CameraBasis): ViewDir {
  return directionInView(vunit([-bodyPosM[0], -bodyPosM[1], -bodyPosM[2]]), basis)
}

/** Everything needed to stroke a lit hemisphere and its terminator. */
export type PhaseGeometry = {
  /** Canvas angle of the Sun direction projected on screen (rad) */
  sunAngleRad: number
  /**
   * Local-x coordinate of the terminator's midpoint, with local +x toward the
   * Sun. Negative past the disk centre (gibbous, more than half the disk lit),
   * positive on the sunward side (crescent), zero at half phase.
   */
  terminatorMidPx: number
  /** Illuminated fraction of the visible disk, (1 + cos of the phase angle) / 2 */
  litFraction: number
  /** True when the Sun direction is too close to the view axis to have a screen angle */
  headOn: boolean
}

/**
 * Phase geometry of a body disk of `radiusPx` lit from `sun`.
 *
 * A sphere of radius R seen orthographically projects to a disk, and the
 * terminator, the great circle perpendicular to the Sun direction, projects to
 * an ellipse sharing the disk's axis perpendicular to the projected Sun
 * direction. Writing the Sun direction as (rho, 0, z) in the local frame with
 * +x toward the Sun on screen, a visible surface point at local (x, y) has
 * height sqrt(R^2 - x^2 - y^2) toward the camera and is lit when
 * `x*rho + z*sqrt(R^2 - x^2 - y^2) > 0`. The boundary of that region is
 * `x = -z*sqrt(R^2 - y^2)`: an ellipse with semi-axis R across the Sun
 * direction and `R*|z|` along it, centred on the disk, which is what
 * `terminatorMidPx` reports (at y = 0).
 */
export function phaseGeometry(sun: ViewDir, radiusPx: number): PhaseGeometry {
  const rho = Math.hypot(sun.x, sun.y)
  return {
    sunAngleRad: rho > 0 ? Math.atan2(sun.y, sun.x) : 0,
    terminatorMidPx: -sun.z * radiusPx,
    litFraction: (1 + sun.z) / 2,
    headOn: rho < 1e-6,
  }
}

/**
 * North pole direction of a body in the J2000 ecliptic frame. `bodyOrientation`
 * gives the pole as ICRF right ascension and declination, which is a J2000
 * equatorial direction.
 */
export function poleDirectionEcliptic(orientation: BodyOrientation): Vec3 {
  const { poleRaRad: ra, poleDecRad: dec } = orientation
  return eclipticFromEquatorial([
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
  ])
}

/**
 * Direction of the body's prime meridian where it crosses its own equator, in
 * the J2000 ecliptic frame.
 *
 * The IAU convention measures W about the pole from the node Q, the ascending
 * node of the body equator on the ICRF equator, which lies at right ascension
 * `alpha + 90 deg` and declination 0. Rotating Q about the pole by W gives
 * `Q cos W + (pole x Q) sin W`.
 */
export function primeMeridianDirectionEcliptic(orientation: BodyOrientation): Vec3 {
  const { poleRaRad: ra, poleDecRad: dec, wRad: w } = orientation
  const pole: Vec3 = [
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
  ]
  const node: Vec3 = [-Math.sin(ra), Math.cos(ra), 0]
  const across = vcross(pole, node)
  const cw = Math.cos(w)
  const sw = Math.sin(w)
  return eclipticFromEquatorial([
    node[0] * cw + across[0] * sw,
    node[1] * cw + across[1] * sw,
    node[2] * cw + across[2] * sw,
  ])
}
