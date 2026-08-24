/**
 * What the view shows, by how many satellites are on it.
 *
 * One satellite is a subject; a thousand are a population, and the treatment
 * that makes the first legible is exactly what makes the second unreadable.
 * The thresholds are where each treatment stops paying: past about thirty
 * labels the names overlap into a smear, and past a couple of hundred trails
 * the globe disappears under its own orbits.
 */
export type SwarmScaleTier = 'named' | 'trails' | 'dots'

/** Every satellite named and trailed. */
export const TIER_NAMED_MAX = 30
/** Trails for all, names only where the pointer or the chase asks. */
export const TIER_TRAILS_MAX = 200
/** Above this many entries the list gets its own filter field. */
export const TIER_FILTER_MIN = 8

export function swarmScaleTier(total: number): SwarmScaleTier {
  if (total <= TIER_NAMED_MAX) return 'named'
  if (total <= TIER_TRAILS_MAX) return 'trails'
  return 'dots'
}

/**
 * Which pipeline draws a selection of this size on the globe.
 *
 * 'full' is the main-thread treatment: an Earth-fixed propagated track per
 * satellite, three distinct passes for a lone one, with the refined trail,
 * the dashed future, the precise marker and the name. 'swarm' is the worker:
 * one draw call, cached inertial trails, keyframe-interpolated dots.
 *
 * Exactly one of them may own a satellite. Both at once drew every named
 * satellite twice, and neither alone serves both ends of the scale: the full
 * treatment is thousands of SGP4 calls per satellite per bucket, and the
 * swarm's inertial ninety-six-sample rings are built for a crowd seen from
 * afar, not for one orbit followed up close. The named-tier boundary is where
 * the trade flips, so it is the ownership boundary too.
 *
 * One carve-out, and it is per SATELLITE rather than per selection: in the
 * swarm tiers the satellite currently being identified is not crowd: it is
 * the subject, and its TRACK goes through the full-treatment path while the
 * swarm keeps the population. The swarm's own saturated highlight ring stands
 * down for it, so the satellite still has exactly one trajectory on screen.
 */
export function globeDrawPath(total: number): 'full' | 'swarm' {
  return swarmScaleTier(total) === 'named' ? 'full' : 'swarm'
}
