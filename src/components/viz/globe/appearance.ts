/**
 * How the view dresses a satellite, as a function of HOW MANY there are.
 *
 * One satellite is a subject and ten thousand are a population, and the
 * treatment that makes the first legible is what makes the second unreadable.
 * That is a real distinction and these rules keep it.
 *
 * What is NOT a distinction: which satellites they are. Every rule here takes
 * a COUNT and nothing else. No rule may ask which group a satellite came from,
 * whether it was searched for or arrived with a preset, or what it is called.
 * A Starlink and a GPS satellite in a selection of thirty-two are dressed
 * identically, because to this module they are indistinguishable, and the only
 * way to keep that promise is to make the group unavailable to ask about.
 *
 * Group membership is a data-loading filter and a label in the panel. It is
 * never an input to behaviour.
 */

/** Above this many satellites, names would overlap into a smear. */
export const LABEL_ALWAYS_MAX = 30

/**
 * Revolutions of trail, either side of the current instant.
 *
 * A lone satellite gets a revolution and a half each way: the pass being
 * flown, the one before it and the one after, three DISTINCT lines on the
 * Earth-fixed globe because the planet turns under them. Add a second
 * satellite and that becomes three overlapping loops per object, so everyone
 * drops to a single revolution.
 *
 * WHO consumes this depends on the tier. In the named tier the full-treatment
 * track is propagated on the main thread, where the extra revolutions
 * genuinely are extra lines. The swarm only ever sees populations above the
 * named tier, so it only ever sees the 0.5 branch: half a revolution per
 * satellite is what keeps ten thousand ground tracks readable as a weave
 * rather than a solid shell.
 */
export function trailRevolutionsFor(satelliteCount: number): number {
  return satelliteCount <= 1 ? 1.5 : 0.5
}

/*
 * There is deliberately no per-satellite SAMPLE-COUNT rule here: the count
 * is fixed at SWARM_TRAIL_POINTS because it sets the stride of the shared
 * buffer, the draw offsets of the GL layer and the segment-id arithmetic of
 * the pick index, none of which can vary per satellite inside one draw call.
 *
 * The budget that IS spent: 95 segments over one revolution, a 459 km
 * chord, 3.8 km of departure from the true path, 0.39 px at a continental
 * view.
 */

/**
 * Width in pixels and alpha for a trail, before the user's own multipliers.
 *
 * Sub-pixel widths are honest here: GL cannot rasterise them, so the drawing
 * layer spends the fraction as coverage instead. See swarmTrailLayer.ts.
 */
export function trailWeightFor(satelliteCount: number): { widthPx: number; alpha: number } {
  if (satelliteCount <= 1) return { widthPx: 1.4, alpha: 1 }
  if (satelliteCount <= 5) return { widthPx: 1.2, alpha: 0.8 }
  /* 0.9 runs to the end of the naming count so that a trail carrying a name is
     always wide enough to carry a dash pattern too. */
  if (satelliteCount <= LABEL_ALWAYS_MAX) return { widthPx: 0.9, alpha: 0.6 }
  if (satelliteCount <= 200) return { widthPx: 0.6, alpha: 0.4 }
  return { widthPx: 0.35, alpha: 0.15 }
}

/**
 * Marker diameter in pixels.
 *
 * A single satellite is a target to aim at; a crowd is a texture, and a dot
 * big enough to aim at would merge with its neighbours long before ten
 * thousand of them.
 */
export function markerSizeFor(satelliteCount: number): number {
  if (satelliteCount <= 1) return 7
  if (satelliteCount <= 5) return 6
  if (satelliteCount <= LABEL_ALWAYS_MAX) return 5
  if (satelliteCount <= 200) return 3.5
  return 2.5
}

/**
 * Whether every satellite carries its name, or only the ones being attended
 * to. Above the naming count the labels overlap into a smear, so the name
 * follows the pointer and the followed satellite instead.
 */
export function labelsAlwaysShownFor(satelliteCount: number): boolean {
  return satelliteCount <= LABEL_ALWAYS_MAX
}

/**
 * Whether a trail is drawn dashed ahead of the satellite.
 *
 * The dash says which part of the orbit has not been flown yet, which is worth
 * saying while a trail is a subject and is only noise once it is one line in a
 * crowd. Tied to the drawn width because a dash needs width to read as a dash.
 */
export function trailIsDashedFor(satelliteCount: number): boolean {
  return trailWeightFor(satelliteCount).widthPx >= 0.9
}

/** Everything the renderer needs, resolved once from the count. */
export type SwarmAppearance = {
  trailRevolutions: number
  trailWidthPx: number
  trailAlpha: number
  markerSizePx: number
  labelsAlwaysShown: boolean
  trailDashed: boolean
}

export function appearanceFor(satelliteCount: number): SwarmAppearance {
  const weight = trailWeightFor(satelliteCount)
  return {
    trailRevolutions: trailRevolutionsFor(satelliteCount),
    trailWidthPx: weight.widthPx,
    trailAlpha: weight.alpha,
    markerSizePx: markerSizeFor(satelliteCount),
    labelsAlwaysShown: labelsAlwaysShownFor(satelliteCount),
    trailDashed: trailIsDashedFor(satelliteCount),
  }
}
