/**
 * What the current zoom actually MEANS, in lengths a reader can check.
 *
 * A zoom number is a coordinate in the tile pyramid and nothing else: it says
 * where the camera is in MapLibre's own units, not how big the thing on screen
 * is. Two lengths turn it into a statement about the world: how much ground
 * one pixel covers, and how wide the view is, and the second is the one that
 * lets this scene be compared with the solar one, which is why it is also given
 * in astronomical units.
 */

/** Mercator world width in pixels at a zoom, for MapLibre's 512 px tiles. */
export const TILE_SIZE_PX = 512

export const AU_M = 1.495978707e11

/**
 * Ground metres per screen pixel at the view centre.
 *
 * Mercator is conformal, so the scale is the same in both directions at a
 * point but grows with latitude: `metersPerPixel` at 60 degrees is half what it
 * is at the equator for the same zoom. Taking it at the CENTRE is the honest
 * single number, and it is the one a scale bar would use.
 *
 * `meterInMercatorUnits` is what MercatorCoordinate reports for the centre
 * latitude, so this stays a pure function of two numbers and can be checked.
 *
 * The figure to check it against is 78,184 m/px at zoom 0 on the equator, NOT
 * the 78,271 usually quoted: that one is derived from the WGS84 equatorial
 * radius and MapLibre's mercator is built on the mean radius, 6,371,008.8 m.
 * The two differ by 0.11%, which is nothing on screen and everything in a
 * test: asserting the quoted number would fail against correct code.
 */
export function metresPerPixel(zoom: number, meterInMercatorUnits: number): number {
  const worldPx = TILE_SIZE_PX * Math.pow(2, zoom)
  if (!(worldPx > 0) || !(meterInMercatorUnits > 0)) return Number.NaN
  return 1 / (meterInMercatorUnits * worldPx)
}

export type ViewScale = {
  metresPerPixel: number
  /** Ground width of the viewport at the centre latitude, metres. */
  viewWidthM: number
  viewWidthAu: number
}

export function viewScale(
  zoom: number,
  meterInMercatorUnits: number,
  canvasCssWidth: number,
): ViewScale {
  const perPixel = metresPerPixel(zoom, meterInMercatorUnits)
  const width = perPixel * canvasCssWidth
  return { metresPerPixel: perPixel, viewWidthM: width, viewWidthAu: width / AU_M }
}

/**
 * Mean radius MapLibre's mercator is built on (`GLOBE_RADIUS_M`). Kept here
 * so the solar scene can name the same zoom number without importing the
 * globe's track math.
 */
const MEAN_RADIUS_M = 6_371_008.8

export function equatorMeterInMercatorUnits(): number {
  return 1 / (2 * Math.PI * MEAN_RADIUS_M)
}

/** Scale of an orthographic view given its px-per-metre camera. */
export function viewScaleFromPxPerMeter(
  pxPerMeter: number,
  canvasCssWidth: number,
): ViewScale {
  const metresPerPixel = pxPerMeter > 0 ? 1 / pxPerMeter : Number.NaN
  const width = metresPerPixel * canvasCssWidth
  return { metresPerPixel, viewWidthM: width, viewWidthAu: width / AU_M }
}

/**
 * MapLibre zoom at the equator that would show this many metres per pixel.
 * Both scenes print that number, so a handoff does not change what Zoom means.
 */
export function mercatorZoomFromMetresPerPixel(metresPerPixel: number): number {
  if (!(metresPerPixel > 0)) return Number.NaN
  const worldPx = 1 / (equatorMeterInMercatorUnits() * metresPerPixel)
  return Math.log2(worldPx / TILE_SIZE_PX)
}

/** Widest globe zoom: the globe hands the solar scene over here. */
export const GLOBE_FLOOR_ZOOM = -4

/** px per metre at the equator for a MapLibre zoom, inverse of metresPerPixel. */
export function pxPerMeterAtEquatorZoom(zoom: number): number {
  const metres = metresPerPixel(zoom, equatorMeterInMercatorUnits())
  return metres > 0 ? 1 / metres : Number.NaN
}

/**
 * A length in kilometres, at a precision that matches how well it is known.
 *
 * Three significant figures throughout: the centre-latitude scale is already an
 * approximation across the frame, so a metre-precise figure would be claiming
 * more than the number carries.
 */
export function formatKm(metres: number): string {
  if (!Number.isFinite(metres)) return '—'
  const km = metres / 1000
  if (km >= 1000) return `${Math.round(km).toLocaleString()} km`
  if (km >= 1) return `${km.toPrecision(3)} km`
  return `${(km * 1000).toPrecision(3)} m`
}

/**
 * The same length in astronomical units. Below a thousandth of an au the
 * mantissa-and-exponent form is the only one that stays readable, and this view
 * spends most of its range down there.
 */
export function formatAu(au: number): string {
  if (!Number.isFinite(au)) return '—'
  if (au >= 0.001) return `${au.toPrecision(3)} au`
  return `${au.toExponential(2)} au`
}

/**
 * The scale BAR: a round length whose drawn width matches it, like every
 * paper map's. A bare "1.71 km/px" asks the reader to multiply; a rule that
 * says "500 km" and is exactly as long as 500 km asks nothing.
 *
 * The length walks the 1-2-5 ladder, the only three mantissas whose gaps are
 * near-uniform on a log scale, and takes the largest rung that still fits
 * `maxWidthPx`. The bar therefore breathes between roughly half the budget
 * and all of it as the zoom sweeps, instead of jumping wildly in width.
 */
export function scaleBarFor(
  metresPerPixel: number,
  maxWidthPx = 120,
): { metres: number; widthPx: number } | null {
  if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0 || maxWidthPx <= 0) return null
  const maxMetres = metresPerPixel * maxWidthPx
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxMetres)))
  let metres = magnitude
  for (const mantissa of [5, 2, 1]) {
    if (mantissa * magnitude <= maxMetres) {
      metres = mantissa * magnitude
      break
    }
  }
  return { metres, widthPx: metres / metresPerPixel }
}
