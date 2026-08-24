/**
 * The header clock and the population's trail-progress fraction, kept as
 * pure functions so both can be unit-tested rather than eyeballed.
 */

/**
 * UTC with an explicit `+0000` rather than the reader's own zone: element
 * sets, sidereal time and the day/night terminator are all UTC, so a local
 * time would be the one number on screen that has to be converted before it
 * can be compared with anything else on it.
 */
export function utcStamp(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19)}+0000`
}

/** What the trajectory indicator knows: the population, and how far it has got. */
export type TrailProgressInput = {
  /** Satellites the worker accepted. Zero means there is no population. */
  total: number
  /** True while the worker is still being loaded, before anything is produced. */
  loading: boolean
  /**
   * Satellites whose trajectory has been produced at least once.
   *
   * The SEQUENTIAL pass only. The identified satellite is re-produced every
   * cycle to keep it off its own marker, and counting those refreshes would
   * make a settled population report progress for the rest of the session.
   */
  done: number
}

/**
 * Fraction of the population that has a trajectory, or null when there is
 * nothing to wait for.
 *
 * Null rather than 1 at the end, so the indicator LEAVES instead of sitting
 * there full: a settled view should carry no residue of having loaded.
 */
export function trailProgressOf({ total, loading, done }: TrailProgressInput): number | null {
  if (total <= 0) return null
  if (done <= 0) return loading ? 0 : null
  if (done >= total) return null
  return Math.max(0, Math.min(1, done / total))
}
