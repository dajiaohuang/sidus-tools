/**
 * Points of interest the camera can fly to: launch and mission-control sites.
 *
 * Proper nouns, deliberately not translated: Starbase is Starbase in every
 * locale, the way the satellite names are. The list is data, so adding a site
 * is a row here and nothing anywhere else.
 */

export type GlobePoi = {
  id: string
  label: string
  lon: number
  lat: number
  /** Zoom the flight lands at: site scale for pads, city scale for centres. */
  zoom: number
  /**
   * Grokipedia page slug, for the marker tooltip's read-more link.
   *
   * Every slug in the table below was verified against the live site: the
   * obvious guess is not always the page ("Starbase" is a 404; the article
   * lives at "SpaceX_Starbase"). A new row's slug gets the same check, since
   * Grokipedia answers a wrong slug with a genuine 404 rather than a soft
   * landing page.
   */
  grokipedia: string
}

export const GLOBE_POIS: readonly GlobePoi[] = [
  { id: 'starbase', label: 'Starbase', lon: -97.156, lat: 25.9972, zoom: 4, grokipedia: 'SpaceX_Starbase' },
  { id: 'houston', label: 'Houston (JSC)', lon: -95.089, lat: 29.5602, zoom: 6, grokipedia: 'Johnson_Space_Center' },
  { id: 'kennedy', label: 'Kennedy Space Center', lon: -80.649, lat: 28.5729, zoom: 6, grokipedia: 'Kennedy_Space_Center' },
  { id: 'vandenberg', label: 'Vandenberg', lon: -120.572, lat: 34.742, zoom: 6, grokipedia: 'Vandenberg_Space_Force_Base' },
  { id: 'wallops', label: 'Wallops', lon: -75.466, lat: 37.94, zoom: 6, grokipedia: 'Wallops_Flight_Facility' },
  { id: 'kourou', label: 'Kourou (CSG)', lon: -52.768, lat: 5.239, zoom: 6, grokipedia: 'Guiana_Space_Centre' },
  { id: 'baikonur', label: 'Baikonur', lon: 63.305, lat: 45.965, zoom: 6, grokipedia: 'Baikonur_Cosmodrome' },
  { id: 'plesetsk', label: 'Plesetsk', lon: 40.575, lat: 62.927, zoom: 6, grokipedia: 'Plesetsk_Cosmodrome' },
  { id: 'sriharikota', label: 'Sriharikota (SDSC)', lon: 80.23, lat: 13.72, zoom: 6, grokipedia: 'Satish_Dhawan_Space_Centre' },
  { id: 'jiuquan', label: 'Jiuquan', lon: 100.291, lat: 40.958, zoom: 6, grokipedia: 'Jiuquan_Satellite_Launch_Center' },
  { id: 'wenchang', label: 'Wenchang', lon: 110.951, lat: 19.614, zoom: 6, grokipedia: 'Wenchang_Space_Launch_Site' },
  { id: 'tanegashima', label: 'Tanegashima', lon: 130.975, lat: 30.401, zoom: 6, grokipedia: 'Tanegashima_Space_Center' },
]

/** The tooltip's read-more target for a site. */
export function grokipediaUrl(poi: GlobePoi): string {
  return `https://grokipedia.com/page/${poi.grokipedia}`
}
