/**
 * Sky bodies for the globe view: the Moon and the naked-eye planets drawn as
 * billboards in their true geocentric directions, with their apparent paths.
 *
 * Everything here is screen-space drawing and geometry. The caller supplies
 * already-computed directions and angular sizes, so this module stays free of
 * ephemeris code, exactly like the satellite side of the component.
 *
 * Honesty: a planet's true apparent disk is far below one pixel (Venus tops
 * out near 0.018 deg, about 0.4 px at the default field of view), so planets
 * are drawn at a fixed minimum dot and the caption says so. The Moon is the
 * one body whose disk is real at this scale, so it gets its true angular size
 * and its real phase.
 */

import { phaseGeometry, type ViewDir } from '../solar/scene-math'

/**
 * Bodies the globe can draw. Earth is excluded for the obvious reason. The Sun
 * is in the list because its checkbox gates its billboard and its path; the
 * day/night shading of the globe is not an overlay and is never gated.
 */
export const SKY_BODY_IDS = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
] as const

export type SkyBodyId = (typeof SKY_BODY_IDS)[number]


/** Samples per path. Enough for a smooth curve without flooding the frame. */
export const SKY_PATH_SAMPLES = 180

/**
 * Colour overrides for the sky view only.
 *
 * The shared body table is built for the solar scene, where each planet is a
 * disk with a label beside it and a neutral grey is simply what Mercury looks
 * like. Here every body is a one-pixel dashed line among eight others, and two
 * pairs collapse: Mercury #9a9a9a against the Moon #b0b0b0 is 22/255 in every
 * channel, and Saturn #d4c4a0 against Jupiter #c4a882 is close enough that two
 * correct arcs read as one broken one. These two are pulled apart on hue
 * instead of lightness, which survives the dashing. The solar scene keeps the
 * table's own colours: it does not have the problem.
 *
 * Saturn is measured against ALL eight others, not just Jupiter: a pale gold
 * that clears Jupiter can still land 9/255 from the Sun. The test beside this
 * pins the whole distance table so any palette edit has to measure too.
 */
const SKY_PATH_COLOR_OVERRIDES: Partial<Record<SkyBodyId, string>> = {
  mercury: '#b08968',
  saturn: '#d8b45c',
}

/** The colour a body's path and marker are drawn in on the globe. */
export function skyBodyColor(id: SkyBodyId, tableColor: string): string {
  return SKY_PATH_COLOR_OVERRIDES[id] ?? tableColor
}

/** Planets are sub-pixel at truth; this is the drawn floor, declared in the caption. */
export const PLANET_MIN_DOT_PX = 2.5

/** Screen-space dash pattern, so dashes keep their size at any zoom. */
export const SKY_PATH_DASH_PX: [number, number] = [6, 5]

/**
 * Longest chord the drawn path may leave between two samples.
 *
 * A fixed cadence in TIME does not give a fixed spacing on SCREEN: the
 * projection of a direction at infinity stretches enormously as the direction
 * swings off the view axis, so the same half-degree of sky is a couple of
 * pixels near the centre and hundreds near the edge. Straight lines between
 * those samples cut visible corners off the curve. Segments longer than this
 * are split until they are not.
 */
export const SKY_PATH_MAX_CHORD_PX = 12

/**
 * Splits allowed per frame, across all bodies. The refinement is monotone and
 * the refined samples are camera-independent, so spreading the work over a few
 * frames costs nothing but converges without ever stalling one.
 */
export const SKY_PATH_REFINE_BUDGET = 64

/** Ceiling on one body's refined sample count, so a pathological view cannot run away. */
export const SKY_PATH_MAX_SAMPLES = 2400

export type SkyBody = {
  id: SkyBodyId
  color: string
  /**
   * Unit direction in the INERTIAL frame: the world frame's convention with
   * right ascension where longitude would be, and no instant baked in. The
   * drawing side turns it Earth-fixed by spinning it about the pole by minus
   * the current sidereal angle, once per frame, which is the whole reason the
   * sky sweeps smoothly instead of stepping on the ephemeris tick.
   */
  direction: [number, number, number]
  /** True apparent angular diameter, radians. */
  angularDiameterRad: number
  /** The body's ORBIT as unit directions: one closed ring, first point repeated last. */
  path: [number, number, number][]
  /**
   * Where each point of `path` sits on that ring, in TURNS of mean anomaly.
   *
   * Not instants. The ring is swept by walking the body round its own ellipse
   * with Earth held still, because sweeping time instead would carry Earth
   * along and fold one parallax loop per year into the curve.
   */
  pathParams: number[]
  /**
   * A point of the ring at any fraction of a turn. The screen-space refinement
   * calls this between samples: a real ephemeris evaluation, not an
   * interpolation between neighbours.
   */
  pathPointAt: (turns: number) => [number, number, number]
  /** The body's inertial direction at any INSTANT, for the marker. */
  directionAt: (timeMs: number) => [number, number, number]
}

export type ScreenPoint = { x: number; y: number }

/** Pointer slack for picking a path, and the size a hovered body eases to. */
export const SKY_PATH_HOVER_PX = 8
export const SKY_HOVER_DIAMETER_PX = 20
/** Seconds-scale easing for the hover grow, expressed as a per-frame approach. */
export const SKY_HOVER_EASE = 0.22

/**
 * Distance from a point to a polyline, in pixels, skipping the breaks. Returns
 * Infinity when the polyline has no drawable segment near the point.
 */
export function distanceToPolylinePx(
  points: (ScreenPoint | null)[],
  x: number,
  y: number,
): number {
  let best = Infinity
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    const t =
      lengthSquared > 0
        ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared))
        : 0
    const distance = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy))
    if (distance < best) best = distance
  }
  return best
}

/**
 * A direction just sunward of `body`, on the sky tangent at the body.
 *
 * The bright limb has to face the Sun ON SCREEN, and the obvious way to get
 * that bearing, projecting the Sun itself, fails whenever the Sun is far off
 * the view axis: a direction at infinity projects to enormous coordinates and
 * gets dropped, leaving the phase pointing at a fallback. Probing a hair
 * toward the Sun from the body instead is always projectable, because the body
 * is on screen by construction whenever it is being drawn.
 */
export function sunwardProbeDirection(
  body: [number, number, number],
  sun: [number, number, number],
  epsilon = 0.02,
): [number, number, number] | null {
  const dot = body[0] * sun[0] + body[1] * sun[1] + body[2] * sun[2]
  const tangent: [number, number, number] = [
    sun[0] - body[0] * dot,
    sun[1] - body[1] * dot,
    sun[2] - body[2] * dot,
  ]
  const length = Math.hypot(tangent[0], tangent[1], tangent[2])
  if (!(length > 1e-9)) return null // Sun exactly along the body direction
  const probe: [number, number, number] = [
    body[0] + (tangent[0] / length) * epsilon,
    body[1] + (tangent[1] / length) * epsilon,
    body[2] + (tangent[2] / length) * epsilon,
  ]
  const norm = Math.hypot(probe[0], probe[1], probe[2])
  return [probe[0] / norm, probe[1] / norm, probe[2] / norm]
}

/**
 * Phase geometry for a body lit by the Sun, expressed for screen drawing.
 *
 * `phaseAngleRad` is the Sun-body-Earth angle, so the lit fraction follows
 * from it directly. The bright limb has to face the Sun on screen, so the
 * on-screen direction comes from where the Sun projects relative to the body:
 * that pair is fed to the shared phaseGeometry as a view direction whose z is
 * cos(phase) and whose x/y carry the screen bearing.
 */
export function screenPhase(
  bodyScreen: ScreenPoint,
  sunScreen: ScreenPoint | null,
  phaseAngleRad: number,
  radiusPx: number,
) {
  const dx = sunScreen ? sunScreen.x - bodyScreen.x : 1
  // Canvas Y grows downward while phaseGeometry works in maths orientation.
  const dy = sunScreen ? -(sunScreen.y - bodyScreen.y) : 0
  const length = Math.hypot(dx, dy)
  const sin = Math.sin(phaseAngleRad)
  const sun: ViewDir =
    length > 0
      ? { x: (dx / length) * sin, y: (dy / length) * sin, z: Math.cos(phaseAngleRad) }
      : { x: sin, y: 0, z: Math.cos(phaseAngleRad) }
  return phaseGeometry(sun, radiusPx)
}

/**
 * Draws a lit disk with its real phase. The terminator is the ellipse the
 * shared phase math describes: semi-axis `radiusPx` across the Sun direction
 * and `|terminatorMidPx|` along it. Which way that ellipse bulges is what
 * separates a crescent from a gibbous, hence the sweep flag.
 */
export function drawPhasedDisk(
  ctx: CanvasRenderingContext2D,
  center: ScreenPoint,
  radiusPx: number,
  color: string,
  phase: ReturnType<typeof screenPhase>,
): void {
  ctx.save()
  ctx.translate(center.x, center.y)
  // Canvas Y is down, so the maths-oriented sun angle is negated to rotate.
  ctx.rotate(-phase.sunAngleRad)

  // The unlit side stays faintly visible so the disk still reads as a body.
  ctx.beginPath()
  ctx.arc(0, 0, radiusPx, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.12
  ctx.fill()

  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(0, 0, radiusPx, -Math.PI / 2, Math.PI / 2, false)
  ctx.ellipse(
    0,
    0,
    Math.abs(phase.terminatorMidPx),
    radiusPx,
    0,
    Math.PI / 2,
    -Math.PI / 2,
    phase.terminatorMidPx > 0,
  )
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

/** Plain dot, used for bodies whose true disk is below a pixel. */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  center: ScreenPoint,
  radiusPx: number,
  color: string,
): void {
  ctx.beginPath()
  ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

/** One full dash period: the shortest run that can read as a dashed line. */
export const SKY_PATH_DASH_PERIOD_PX = SKY_PATH_DASH_PX[0] + SKY_PATH_DASH_PX[1]

/**
 * Contiguous runs of drawable points, with the crumbs removed.
 *
 * The two visibility gates cut the polyline wherever a sample goes behind the
 * camera or behind the globe, and near those boundaries they can leave a run of
 * one or two points spanning a few pixels. Such a run cannot render as a dashed
 * line, only as a stray tick, and a scatter of stray ticks reads as a broken
 * path rather than as the edge of a real one. Anything shorter than a single
 * dash period is therefore dropped; the count is returned so it can be reported
 * rather than silently swallowed.
 */
export function drawableRuns(points: (ScreenPoint | null)[]): {
  runs: ScreenPoint[][]
  dropped: number
} {
  const runs: ScreenPoint[][] = []
  let current: ScreenPoint[] = []
  const flush = () => {
    if (current.length > 0) runs.push(current)
    current = []
  }
  for (const point of points) {
    if (!point) flush()
    else current.push(point)
  }
  flush()

  const kept: ScreenPoint[][] = []
  let dropped = 0
  for (const run of runs) {
    let length = 0
    for (let i = 1; i < run.length; i++) {
      length += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y)
    }
    if (run.length >= 2 && length >= SKY_PATH_DASH_PERIOD_PX) kept.push(run)
    else dropped++
  }
  return { runs: kept, dropped }
}

/**
 * Draws a dashed path from already-projected samples. `null` marks a sample
 * that is behind the camera or hidden by the globe, which breaks the line
 * rather than drawing a chord across the planet. Returns how many fragments
 * were too short to draw.
 */
export function drawDashedPath(
  ctx: CanvasRenderingContext2D,
  points: (ScreenPoint | null)[],
  color: string,
  alpha = 0.55,
): number {
  const { runs, dropped } = drawableRuns(points)
  ctx.save()
  ctx.setLineDash(SKY_PATH_DASH_PX)
  ctx.strokeStyle = color
  ctx.globalAlpha = alpha
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const run of runs) {
    ctx.moveTo(run[0].x, run[0].y)
    for (let i = 1; i < run.length; i++) ctx.lineTo(run[i].x, run[i].y)
  }
  ctx.stroke()
  ctx.restore()
  return dropped
}
