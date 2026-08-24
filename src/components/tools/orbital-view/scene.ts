/**
 * What pressing a scene chip should actually do.
 *
 * The two scenes are joined by a flight, not by a switch: zooming out past the
 * globe's floor hands the solar scene the scale Earth was drawn at, and zooming
 * back in until Earth reaches that scale hands it back. That is the good
 * behaviour and it is why the chips fly rather than cut.
 *
 * But the return flight needs the scale to aim at, and that scale exists only
 * because the globe recorded it on the way out. Arrive on the solar scene from
 * a link and there is no such record, so a chip that only ever asks for the
 * flight asks for something that cannot happen, and the view becomes a
 * one-way door. Deciding that here, rather than inside the handler, is what
 * makes it a rule that can be stated and checked instead of a branch that has
 * to be re-derived every time someone reads it.
 */

export type SceneId = 'globe' | 'solar'

export type SceneAction =
  /** Already there; pressing the chip you are on is not a request. */
  | 'ignore'
  /** Fly out through the globe's zoom floor and across. */
  | 'flyOut'
  /** Fly in until Earth reaches the scale the globe handed over at. */
  | 'flyIn'
  /** No flight is possible, so change scene directly. */
  | 'switch'

export function sceneChipAction(
  target: SceneId,
  currentScene: SceneId,
  /** True when the globe recorded a scale on the way out, so a return can aim. */
  hasHandoff: boolean,
): SceneAction {
  if (target === currentScene) return 'ignore'
  if (target === 'solar') return 'flyOut'
  return hasHandoff ? 'flyIn' : 'switch'
}
