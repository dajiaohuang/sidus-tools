/**
 * The window of rows the SELECTED list actually draws.
 *
 * A whole group is over ten thousand rows: laying all of them out costs tens of
 * thousands of DOM nodes and put every filter keystroke at more than a second
 * of reconciliation, measured. Rows are a fixed height, so the window is
 * arithmetic: spacers stand in for what is not drawn and keep the scrollbar
 * honest. The filter still runs over the whole selection; only drawing is
 * windowed.
 */

/** Above this many rows only the visible slice is rendered. */
export const VIRTUAL_LIST_MIN = 100
/** Rows kept either side of the viewport so a fast scroll does not show gaps. */
export const VIRTUAL_LIST_OVERSCAN = 8
/**
 * Height of one row: `py-0.5` around a 10 px monospace line box. The component
 * re-measures this from the first rendered row, since a font fallback can
 * change it; this is the starting estimate and the fallback.
 */
export const SELECTED_ROW_HEIGHT_PX = 19

export type ListWindow = {
  first: number
  count: number
  padTopPx: number
  padBottomPx: number
}

/**
 * Where to scroll so row `index` is visible, or null when it already is.
 *
 * The list is virtualised, so the row the globe is pointing at usually does not
 * exist in the DOM and cannot simply be told to scroll itself into view: its
 * position is arithmetic. Returning null for a row already on screen is the
 * point of the function, not an optimisation: a list that jumped every time
 * the pointer crossed a trail would be unreadable.
 */
export function scrollTopForIndex(
  index: number,
  rowHeightPx: number,
  scrollTopPx: number,
  viewportPx: number,
  totalRows: number,
): number | null {
  if (index < 0 || rowHeightPx <= 0 || viewportPx <= 0) return null
  const top = index * rowHeightPx
  if (top >= scrollTopPx && top + rowHeightPx <= scrollTopPx + viewportPx) return null
  const centred = top - viewportPx / 2 + rowHeightPx / 2
  const furthest = Math.max(0, totalRows * rowHeightPx - viewportPx)
  return Math.max(0, Math.min(furthest, centred))
}

/** Which rows to draw, and how much empty space stands in for the rest. */
export function listWindowFor(
  total: number,
  scrollTopPx: number,
  viewportPx: number,
  rowHeightPx: number,
): ListWindow {
  if (total <= VIRTUAL_LIST_MIN || rowHeightPx <= 0) {
    return { first: 0, count: total, padTopPx: 0, padBottomPx: 0 }
  }
  const first = Math.max(0, Math.floor(scrollTopPx / rowHeightPx) - VIRTUAL_LIST_OVERSCAN)
  const span = Math.ceil(viewportPx / rowHeightPx) + VIRTUAL_LIST_OVERSCAN * 2
  const count = Math.max(0, Math.min(span, total - first))
  return {
    first,
    count,
    padTopPx: first * rowHeightPx,
    padBottomPx: Math.max(0, (total - first - count) * rowHeightPx),
  }
}
