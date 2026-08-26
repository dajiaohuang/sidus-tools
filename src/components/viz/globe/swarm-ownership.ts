/**
 * Who draws a satellite when the swarm and the full-treatment path both know
 * about it. Drawing both is two markers and two trails of the same object.
 */

/** Packed slot holding satrec `index`, or -1 when that satellite was skipped. */
export function packedSlotOf(
  keyframe: { count: number; indices: Uint32Array },
  satrecIndex: number,
): number {
  if (satrecIndex < 0) return -1
  for (let i = 0; i < keyframe.count; i++) {
    if (keyframe.indices[i] === satrecIndex) return i
  }
  return -1
}

/** True when the identified satellite already has a full-treatment track. */
export function identifiedIsTracked(
  identified: string | null | undefined,
  satellites: readonly { id: string; positions?: readonly unknown[] }[],
): boolean {
  return (
    identified != null &&
    satellites.some((sat) => sat.id === identified && (sat.positions?.length ?? 0) > 1)
  )
}

export type SwarmDrawOwnership = {
  highlight: number | null
  hidden: number | null
}

/**
 * Marker ownership. The packed keyframe keeps the slot; the draw skips it so
 * deselect can unhide the same buffer instead of waiting on a later produce.
 */
export function pointOwnershipOf(
  identified: string | null | undefined,
  swarmIds: readonly string[] | undefined,
  keyframe: { count: number; indices: Uint32Array } | null | undefined,
  satellites: readonly { id: string; positions?: readonly unknown[] }[],
): SwarmDrawOwnership {
  const satrecIndex = identified && swarmIds ? swarmIds.indexOf(identified) : -1
  const slot = keyframe && satrecIndex >= 0 ? packedSlotOf(keyframe, satrecIndex) : -1
  if (slot < 0) return { highlight: null, hidden: null }
  if (identifiedIsTracked(identified, satellites)) {
    return { highlight: null, hidden: slot }
  }
  return { highlight: slot, hidden: null }
}

/**
 * Trail ownership. Same satellite, two polylines: the swarm's 96-sample
 * chord and the refined ellipse. At the limb they read as a double dashed
 * line. Hide the swarm copy once the full-treatment track exists; until
 * then highlight it so hover still has something to light.
 */
export function trailOwnershipOf(
  identified: string | null | undefined,
  swarmIds: readonly string[] | undefined,
  satellites: readonly { id: string; positions?: readonly unknown[] }[] = [],
): SwarmDrawOwnership {
  const at = identified && swarmIds ? swarmIds.indexOf(identified) : -1
  if (at < 0) return { highlight: null, hidden: null }
  if (identifiedIsTracked(identified, satellites)) {
    return { highlight: null, hidden: at }
  }
  return { highlight: at, hidden: null }
}

/**
 * `gl.drawArrays` ranges that omit one vertex (or one satellite of vertices).
 *
 * Shader discard of a hidden slot is not enough: a uniform that fails to bind
 * still rasterises the point. Skipping it in the draw is the ownership gate.
 */
export function drawRangesSkipping(
  count: number,
  skip: number,
): { first: number; count: number }[] {
  if (count <= 0) return []
  if (!Number.isInteger(skip) || skip < 0 || skip >= count) return [{ first: 0, count }]
  const ranges: { first: number; count: number }[] = []
  if (skip > 0) ranges.push({ first: 0, count: skip })
  const rest = count - skip - 1
  if (rest > 0) ranges.push({ first: skip + 1, count: rest })
  return ranges
}
