/**
 * Picking an individually drawn satellite by its TRAIL.
 *
 * The marker has always been pickable; the line it leaves behind was not, so
 * pointing at the very curve that identifies an orbit did nothing. This is the
 * hit test for it, kept pure so it can be checked against known polylines
 * rather than against a browser.
 *
 * ## It takes PROJECTED points, deliberately
 *
 * A trail is drawn through one of two chains: elevated by the custom layer when
 * the altitude toggle is on, flat on the ground when it is off. The difference
 * is the whole elevation offset, which for a GPS orbit is most of the frame, so
 * a hit test that assumed either one would miss in the other mode. Rather than
 * model both here, the caller projects through whichever chain it is actually
 * drawing with and hands the pixels over. That also makes the globe's limb the
 * caller's business: a sample it cannot draw arrives as `null`, and a null
 * breaks the polyline exactly as it breaks the drawn line.
 */

export type ScreenPoint = { x: number; y: number }

/** One satellite's trail as it currently sits on screen. */
export type TrailPolyline = {
  id: string
  /** Projected samples in order; null marks one that is not drawn. */
  screen: readonly (ScreenPoint | null)[]
}

/** Pointer slack for catching a trail, in CSS pixels. */
export const TRAIL_PICK_RADIUS_PX = 7

export type TrailScreenBounds = { minX: number; minY: number; maxX: number; maxY: number }

/** Screen extent of the drawable samples, or null when none are drawable. */
export function trailScreenBounds(
  screen: readonly (ScreenPoint | null)[],
): TrailScreenBounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let any = false
  for (const point of screen) {
    if (!point) continue
    any = true
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  return any ? { minX, minY, maxX, maxY } : null
}

/** Distance from a point to one segment, in pixels. */
function distanceToSegment(a: ScreenPoint, b: ScreenPoint, x: number, y: number): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared > 0
      ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared))
      : 0
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy))
}

/**
 * The trail nearest the pointer, or null when none is within `thresholdPx`.
 *
 * Nearest wins outright, so where two orbits cross the pointer takes the line
 * it is actually on rather than whichever happened to be drawn last. The bounds
 * test in front is only a prune: it may admit a trail that then loses, but it
 * must never reject one that would have won, which is why it is expanded by the
 * threshold before it is trusted.
 */
export function pickNearestTrail(
  trails: readonly TrailPolyline[],
  x: number,
  y: number,
  thresholdPx: number = TRAIL_PICK_RADIUS_PX,
): { id: string; distancePx: number; tested: number; segments: number } | null {
  let best: { id: string; distancePx: number } | null = null
  let tested = 0
  let segments = 0

  for (const trail of trails) {
    const bounds = trailScreenBounds(trail.screen)
    if (!bounds) continue
    if (
      x < bounds.minX - thresholdPx ||
      x > bounds.maxX + thresholdPx ||
      y < bounds.minY - thresholdPx ||
      y > bounds.maxY + thresholdPx
    ) {
      continue
    }
    tested++

    for (let i = 1; i < trail.screen.length; i++) {
      const a = trail.screen[i - 1]
      const b = trail.screen[i]
      if (!a || !b) continue // a break in the drawn line has no segment here
      segments++
      const distance = distanceToSegment(a, b, x, y)
      if (distance > thresholdPx) continue
      if (!best || distance < best.distancePx) best = { id: trail.id, distancePx: distance }
    }
  }

  return best ? { ...best, tested, segments } : null
}
