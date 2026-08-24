/**
 * Screen-space refinement for the sky paths and the full-treatment trails.
 *
 * Both split the WORST chord first and re-evaluate the caller's ephemeris at
 * the midpoint rather than interpolating between neighbours, which is what
 * keeps a high-curvature stretch honest. Pure functions of their inputs, split
 * from the map component so they can be read and tested without one.
 */

import type { SkyBody } from './celestial'
import type { GlobeTrackPoint } from './types'
import { SKY_PATH_MAX_CHORD_PX, SKY_PATH_MAX_SAMPLES } from './celestial'

/** A body's path plus the midpoints the screen has asked for since. */
export type RefinedSkyPath = {
  /** Identity of the caller's path, so a new one starts the refinement over. */
  signature: string
  directions: [number, number, number][]
  /** Where each direction sits on the ring, in turns of mean anomaly. */
  params: number[]
}

/**
 * Splits the segments that are still too long on screen, along the RING, by
 * asking the caller's ephemeris for the midpoint. Returns how much of the
 * budget it used.
 *
 * Splitting the parameter and re-evaluating, rather than interpolating between
 * the neighbouring directions, is what keeps a high-curvature stretch honest:
 * an inner planet's ring swings through several degrees of sky inside a small
 * step of mean anomaly, and that is exactly where a chord between two samples
 * would cut the corner off the real curve.
 */
export function refineSkyPath(
  body: SkyBody,
  refined: RefinedSkyPath,
  screen: ({ x: number; y: number } | null)[],
  budget: number,
): number {
  if (refined.directions.length >= SKY_PATH_MAX_SAMPLES) return 0
  const longest: { index: number; length: number }[] = []
  for (let i = 1; i < screen.length; i++) {
    const a = screen[i - 1]
    const b = screen[i]
    if (!a || !b) continue // A break in the line has no chord to shorten.
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length > SKY_PATH_MAX_CHORD_PX) longest.push({ index: i, length })
  }
  if (longest.length === 0) return 0
  /* Worst first, so the visible corners go before the merely imperfect ones. */
  longest.sort((a, b) => b.length - a.length)
  const taking = longest.slice(0, Math.min(budget, SKY_PATH_MAX_SAMPLES - refined.directions.length))
  // Insert from the back, so the earlier indices stay valid as we go.
  taking.sort((a, b) => b.index - a.index)
  for (const { index } of taking) {
    const mid = (refined.params[index - 1] + refined.params[index]) / 2
    refined.directions.splice(index, 0, body.pathPointAt(mid))
    refined.params.splice(index, 0, mid)
  }
  return taking.length
}


/**
 * Screen-space budget for the trail refinement above, mirroring the sky path's.
 * The per-frame split budget is GLOBAL and one satellite is examined per frame
 * in turn, so the cost of refining is bounded by the budget and not by the size
 * of the population: 200 trails converge progressively instead of all at once.
 */
export const TRAIL_MAX_CHORD_PX = 12
export const TRAIL_REFINE_BUDGET = 24
/** Ceiling on one refined half, so a pathological orbit cannot grow without end. */
export const TRAIL_MAX_REFINED_SAMPLES = 900

/**
 * Splits the trail chords that are still too long on screen, in TIME, by asking
 * the caller's propagator for the midpoint. Returns how much of the budget it
 * used. Same mechanism as refineSkyPath, for the same reason.
 *
 * A trail is sampled uniformly in TIME while the angular rate is anything but:
 * an eccentric orbit crawls through apogee and sweeps through perigee, so the
 * samples that matter most are the ones a uniform step gives fewest of.
 * Measured on ARKTIKA-M 1, a 12 h Molniya orbit: consecutive drawn vertices up
 * to 0.640 Earth radii apart, with the straight line between them departing
 * 164 km from the real path. LEO, by contrast, is already at 4 km.
 */
export function refineTrailHalf(
  points: GlobeTrackPoint[],
  positionAt: (date: Date) => GlobeTrackPoint | null,
  project: (point: GlobeTrackPoint) => { x: number; y: number } | null,
  budget: number,
): number {
  if (points.length < 2 || points.length >= TRAIL_MAX_REFINED_SAMPLES) return 0
  const screen = points.map(project)
  const longest: { index: number; length: number }[] = []
  for (let i = 1; i < points.length; i++) {
    const a = screen[i - 1]
    const b = screen[i]
    if (!a || !b) continue // Off the globe: no chord on screen to shorten.
    /* The date line is a break in the drawn line, not a long chord, and its
       midpoint in raw longitude would land on the far side of the planet. */
    if (Math.abs(points[i].lon - points[i - 1].lon) > 180) continue
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length > TRAIL_MAX_CHORD_PX) longest.push({ index: i, length })
  }
  if (longest.length === 0) return 0
  longest.sort((a, b) => b.length - a.length)
  const room = TRAIL_MAX_REFINED_SAMPLES - points.length
  const taking = longest.slice(0, Math.min(budget, room))
  taking.sort((a, b) => b.index - a.index)
  let used = 0
  for (const { index } of taking) {
    const midMs = (points[index - 1].date.getTime() + points[index].date.getTime()) / 2
    const mid = positionAt(new Date(midMs))
    if (!mid) continue
    points.splice(index, 0, mid)
    used++
  }
  return used
}
