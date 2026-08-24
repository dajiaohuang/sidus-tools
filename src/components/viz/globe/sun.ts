/**
 * Sun billboard placement for the globe view.
 *
 * The Sun is not a point on the map: it is a direction. Drawing it at its true
 * distance is impossible here, since a vertex at 1 AU sits far beyond
 * MapLibre's far plane, so it is placed as a billboard at the vanishing point
 * of the true sun direction (a homogeneous point at infinity, w = 0), which is
 * exactly where an infinitely distant object in that direction projects.
 *
 * The direction itself is the subsolar unit vector: the caller derives the
 * subsolar point from the shipped solar ephemeris and GMST, so the vector is
 * already the true sun direction rotated into the globe's world frame. The
 * sphere formula below matches MapLibre's own globe vertex shader
 * (src/shaders/glsl/_projection_globe.vertex.glsl, projectToSphere).
 */

const DEG = Math.PI / 180

/**
 * Mean angular diameter of the Sun seen from Earth, and the reason the dot on
 * screen is small: the Sun is about 109 Earth diameters across, seen from
 * 1 AU, which is 23481 Earth radii, so
 *   2 * atan((109.3 / 2) / 23481) = 0.533 deg.
 * It ranges 0.524 to 0.542 deg over the year as Earth's distance varies; the
 * mean is used here. The camera sits within a few Earth radii of the globe,
 * nothing against 1 AU, so the same figure holds for the camera.
 *
 * This is the physical truth in this module. The glow around the disk is a
 * visual aid with no physical size, kept small so the true disk dominates.
 */
export const SUN_ANGULAR_DIAMETER_DEG = 0.532

/**
 * Unit vector of a lat/lon on the globe's world sphere, matching the globe
 * vertex shader. The shader takes spherical.x from the mercator X of the
 * point: `mercatorX * 2pi + pi` with `mercatorX = (lon + 180) / 360`, which
 * reduces to `lon` in radians once the two half turns cancel. Writing the
 * reduced form is easy to get 180 deg wrong, so the derivation stays here.
 */
export function sphereDirection(lonDeg: number, latDeg: number): [number, number, number] {
  const sphericalX = lonDeg * DEG
  const sphericalY = latDeg * DEG
  const len = Math.cos(sphericalY)
  return [Math.sin(sphericalX) * len, Math.sin(sphericalY), Math.cos(sphericalX) * len]
}

/**
 * On-screen diameter of an object of angular size `angularDeg` under a camera
 * with vertical field of view `fovRad`, on a canvas `canvasCssHeight` tall.
 * Exact tangent form rather than the small-angle shortcut, though at half a
 * degree the two agree to well under a pixel.
 */
export function angularSizeToPixels(
  angularDeg: number,
  fovRad: number,
  canvasCssHeight: number,
): number {
  if (!(fovRad > 0) || !(canvasCssHeight > 0)) return 0
  return (canvasCssHeight * Math.tan((angularDeg * DEG) / 2)) / Math.tan(fovRad / 2)
}

/**
 * Screen position of a direction, i.e. of an infinitely distant object.
 * Multiplies the direction as a homogeneous vector with w = 0, so the result
 * is the vanishing point rather than the projection of any finite point.
 */
export function projectDirectionToScreen(
  direction: [number, number, number],
  mainMatrix: ArrayLike<number>,
  canvasCssWidth: number,
  canvasCssHeight: number,
): { x: number; y: number } | null {
  const [x, y, z] = direction
  const clipX = mainMatrix[0] * x + mainMatrix[4] * y + mainMatrix[8] * z
  const clipY = mainMatrix[1] * x + mainMatrix[5] * y + mainMatrix[9] * z
  const clipW = mainMatrix[3] * x + mainMatrix[7] * y + mainMatrix[11] * z

  if (!(clipW > 0)) return null // behind the camera

  const ndcX = clipX / clipW
  const ndcY = clipY / clipW
  return {
    x: (ndcX * 0.5 + 0.5) * canvasCssWidth,
    y: (1 - (ndcY * 0.5 + 0.5)) * canvasCssHeight,
  }
}

/**
 * True when the globe hides an infinitely distant object in `direction`.
 *
 * MapLibre hands custom layers the horizon plane for a unit-sphere planet
 * (`clippingPlane`, the same one its globe shaders clip against): points with
 * dot(plane.xyz, p) + plane.w < 0 are behind the horizon. Normalising it
 * recovers the camera axis n and the camera distance D from the centre,
 * because the horizon plane of a camera at distance D is x . n = 1/D. The
 * planet then covers a cone of half angle asin(1/D) around the direction from
 * the camera to the centre, and the object is hidden inside that cone.
 */
/**
 * Component of `direction` along the camera's viewing direction, in [-1, 1].
 *
 * The clipping plane's normal points from the globe centre toward the camera,
 * so the camera looks along its negative. A direction at infinity is only
 * safely projectable while this is comfortably positive: as it approaches zero
 * the vanishing point runs off to infinity, and past zero it mirrors to the
 * opposite side of the screen, which is what turns a sky path into straight
 * slashes across the frame.
 */
export function forwardComponent(
  direction: [number, number, number],
  clippingPlane: readonly [number, number, number, number],
): number {
  const [px, py, pz] = clippingPlane
  const length = Math.hypot(px, py, pz)
  if (!(length > 0)) return 0
  return -(direction[0] * px + direction[1] * py + direction[2] * pz) / length
}

/** Minimum forward component for a sky direction to be drawn (about 87 deg off axis). */
export const SKY_FORWARD_EPSILON = 0.05

export function isDirectionOccludedByGlobe(
  direction: [number, number, number],
  clippingPlane: readonly [number, number, number, number],
): boolean {
  const [px, py, pz, pw] = clippingPlane
  const length = Math.hypot(px, py, pz)
  if (!(length > 0)) return false

  const nx = px / length
  const ny = py / length
  const nz = pz / length
  const invDistance = -pw / length // 1 / D
  if (!(invDistance > 0) || invDistance >= 1) return false // camera at or below the surface

  const cosPlanetRadius = Math.sqrt(1 - invDistance * invDistance)
  const alongCameraAxis = direction[0] * nx + direction[1] * ny + direction[2] * nz
  // The centre lies opposite the camera axis, so the covered cone is at -n.
  return -alongCameraAxis > cosPlanetRadius
}

/**
 * Finite-point occlusion is an exact ray-against-the-sphere test in
 * occlusion.ts; re-exported so callers keep one import path.
 */
export { isPointOccludedByGlobe } from './occlusion'


/**
 * Background for the billboard element. The solid core ends exactly at the
 * disk's true angular size; everything past it is glow, a visual aid with no
 * physical extent.
 *
 * The glow box is only twice the disk and falls off fast, so the crisp disk
 * dominates the way the Sun does in astronaut photography. A wider, softer
 * halo reads as neither physical nor decorative: it just makes the Sun look
 * like a fuzzy blob of the wrong size.
 */
export const SUN_GLOW_SCALE = 2

export function sunBillboardBackground(diskColor: string, glowRgb: string): string {
  const core = (100 / SUN_GLOW_SCALE).toFixed(3)
  const at = (fraction: number) => (Number(core) + (100 - Number(core)) * fraction).toFixed(3)
  return [
    'radial-gradient(circle closest-side,',
    `${diskColor} 0%,`,
    `${diskColor} ${core}%,`,
    `rgba(${glowRgb}, 0.45) ${core}%,`,
    `rgba(${glowRgb}, 0.16) ${at(0.35)}%,`,
    `rgba(${glowRgb}, 0.04) ${at(0.65)}%,`,
    `rgba(${glowRgb}, 0) 100%)`,
  ].join(' ')
}
