/**
 * Occlusion of ELEVATED geometry by the planet, done as a ray against the
 * sphere rather than as MapLibre's horizon plane.
 *
 * The globe prelude's `projectTileFor3D` overwrites clip-space z with a
 * horizon-PLANE test: anything behind the plane through the planet's
 * silhouette is discarded. For ground tiles that plane IS the far side of
 * the sphere. For geometry drawn at altitude it is wrong: a GEO ring at six
 * and a half Earth radii spends most of its far half behind that plane
 * while sitting in plain sight BESIDE the planet, so clipping on that plane
 * cuts high arcs off mid-air.
 *
 * The honest test: a point is hidden exactly when the segment from the camera
 * to it enters the sphere first. One quadratic per vertex, in the same globe
 * units the prelude already works in, with the camera recovered from the
 * prelude's own clipping plane.
 */

/**
 * GLSL for the vertex shaders, globe variant only: the mercator prelude has
 * neither the clipping plane nor `projectToSphere`, so a source containing
 * this must not be compiled under it.
 *
 * Returns 0.0 for a visible vertex and 2.0 for a hidden one; the caller
 * multiplies by `gl_Position.w`, so hidden vertices land outside the clip
 * volume and a segment crossing the limb is clipped between its endpoints,
 * within one sample spacing of the true limb, against losing the whole arc.
 */
export const SPHERE_OCCLUSION_GLSL = `
    float sphereOcclusionClipZ(vec3 elevatedPos) {
        vec3 planeN = u_projection_clipping_plane.xyz;
        float planeLen = length(planeN);
        if (planeLen < 1e-9) return 0.0;
        float invD = -u_projection_clipping_plane.w / planeLen;
        if (invD <= 0.0 || invD >= 1.0) return 0.0;
        vec3 cameraPos = (planeN / planeLen) / invD;
        vec3 toPoint = elevatedPos - cameraPos;
        float a = dot(toPoint, toPoint);
        float b = 2.0 * dot(cameraPos, toPoint);
        float c = dot(cameraPos, cameraPos) - 1.0;
        float disc = b * b - 4.0 * a * c;
        if (disc <= 0.0) return 0.0;
        float t = (-b - sqrt(disc)) / (2.0 * a);
        return (t > 0.0 && t < 1.0) ? 2.0 : 0.0;
    }
`

/**
 * The same test on the CPU, for picking, labels and the axes. `point` is in
 * globe units: the unit-sphere direction scaled by 1 + elevation / R.
 *
 * A point INSIDE the sphere is always hidden: the ray enters the surface
 * before reaching it, which is also the right answer for the axis samples
 * that pass through the planet's interior.
 */
export function isPointOccludedByGlobe(
  point: readonly [number, number, number],
  clippingPlane: readonly [number, number, number, number],
): boolean {
  const [px, py, pz, pw] = clippingPlane
  const length = Math.hypot(px, py, pz)
  if (!(length > 0)) return false
  const invDistance = -pw / length
  if (!(invDistance > 0) || invDistance >= 1) return false // camera at or below the surface

  const distance = 1 / invDistance
  const cx = (px / length) * distance
  const cy = (py / length) * distance
  const cz = (pz / length) * distance
  const vx = point[0] - cx
  const vy = point[1] - cy
  const vz = point[2] - cz
  const a = vx * vx + vy * vy + vz * vz
  const b = 2 * (cx * vx + cy * vy + cz * vz)
  const c = cx * cx + cy * cy + cz * cz - 1
  const disc = b * b - 4 * a * c
  if (disc <= 0) return false
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return t > 0 && t < 1
}
