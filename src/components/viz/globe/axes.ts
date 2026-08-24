/**
 * Earth's two axes, drawn through the globe the way a physical one shows them.
 *
 * Two lines, both through the centre, both sticking a little way out at each
 * end: the ROTATION axis through the geographic poles, and the MAGNETIC one
 * through the geomagnetic poles, leaning about eleven degrees off it. Their
 * separation is the whole reason to draw the second: a compass does not point
 * at the pole the planet turns about, and this is the picture of why.
 *
 * Sampled rather than drawn as one line between two projected ends, even
 * though the axis IS straight in three dimensions. The globe hides its middle,
 * and where it starts and stops hiding it depends on the camera; sampling and
 * testing each point is what lets the hidden stretch be drawn faint instead of
 * being either omitted whole or drawn straight over the planet.
 */

/** North geomagnetic pole, IGRF-13 epoch 2020: the dipole's northern end. */
export const GEOMAGNETIC_POLE_LAT_DEG = 80.65
export const GEOMAGNETIC_POLE_LON_DEG = -72.68

/**
 * How far past the surface each end reaches, as a fraction of the radius.
 *
 * Enough to read as an axle through the planet rather than as a scratch on it,
 * and not so much that it becomes the subject: at 0.18 the stub is about a
 * ninth of the drawn disc at any zoom, because it scales with the globe.
 */
export const AXIS_OVERHANG = 0.18

/** Points along one axis, enough that the hidden stretch ends where it should. */
export const AXIS_SAMPLES = 96

export type AxisSample = {
  lonDeg: number
  latDeg: number
  /** Height above the ellipsoid, metres. Negative inside the planet. */
  elevationM: number
}

/**
 * One axis as a chain of samples from its southern end to its northern one.
 *
 * The parameter runs -1..1 along the axis, so `t` is the signed fraction of a
 * radius from the centre. A sample at |t| < 1 is INSIDE the planet, which is
 * why the elevation goes negative: the drawing side needs a real position for
 * every point so it can ask whether the globe is in front of it, and dropping
 * the interior would leave the two stubs floating unconnected.
 */
export function axisSamples(
  poleLatDeg: number,
  poleLonDeg: number,
  radiusM: number,
  samples: number = AXIS_SAMPLES,
  overhang: number = AXIS_OVERHANG,
): AxisSample[] {
  const reach = 1 + overhang
  const out: AxisSample[] = []
  for (let i = 0; i < samples; i++) {
    const t = -reach + (2 * reach * i) / (samples - 1)
    /* Past the centre the point is on the OTHER pole's side, which is the
       antipode of the one named. Latitude flips and longitude turns half a
       world, which is what keeps a single chain running end to end. */
    const northward = t >= 0
    out.push({
      latDeg: northward ? poleLatDeg : -poleLatDeg,
      lonDeg: northward ? poleLonDeg : poleLonDeg + 180,
      elevationM: (Math.abs(t) - 1) * radiusM,
    })
  }
  return out
}

/** Unit direction of a lon/lat in the globe's own frame, matching projection.ts. */
export function axisDirection(
  lonDeg: number,
  latDeg: number,
): [number, number, number] {
  const lon = (lonDeg * Math.PI) / 180
  const lat = (latDeg * Math.PI) / 180
  const c = Math.cos(lat)
  return [Math.sin(lon) * c, Math.sin(lat), Math.cos(lon) * c]
}

/**
 * Angle between the two axes, degrees. Not used to draw anything: it is the
 * number the picture is FOR, so it is worth being able to state and check.
 */
export function magneticTiltDeg(
  poleLatDeg: number = GEOMAGNETIC_POLE_LAT_DEG,
  poleLonDeg: number = GEOMAGNETIC_POLE_LON_DEG,
): number {
  const [x, y, z] = axisDirection(poleLonDeg, poleLatDeg)
  const dot = y // the rotation axis is +Y in this frame
  void x
  void z
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
}
