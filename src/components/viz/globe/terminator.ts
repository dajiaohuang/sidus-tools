/**
 * Solar illumination geometry for the globe view: the lit caps around the
 * subsolar point. Pure math, no React, no MapLibre, no physics imports. The
 * caller supplies the subsolar point in degrees.
 *
 * The globe lights the DAY side rather than veiling the night side: on a dark
 * base map a night veil reads backwards, since more veil means a brighter
 * night. Here nothing is drawn over full night, and each successively higher
 * sun elevation adds another warm layer, so brightness rises toward the
 * subsolar point the way it does on a real globe.
 *
 * Accuracy: the caller's subsolar point comes from the shipped low-precision
 * solar ephemeris (Vallado, valid 1950-2050, about 0.01 deg), so these bands
 * are visual grade. Their boundaries are good to a few hundredths of a
 * degree, far finer than a rendered pixel at any usable zoom, and not a
 * substitute for an almanac.
 */

const DEG = Math.PI / 180

/**
 * Web Mercator latitude limit (MapLibre ships the same 85.051129 figure).
 * Tiled GeoJSON beyond it has no mercator representation, so polygons stop
 * their polar edges here.
 */
export const MAX_MERCATOR_LAT_DEG = 85.051129

/**
 * Sun-elevation thresholds, faintest first. Each band is the region where the
 * sun sits ABOVE that elevation, so the caps are nested around the subsolar
 * point and each one drawn adds light to everything inside it:
 *   -18    astronomical twilight; darker than this is full night, undrawn
 *   -12    nautical twilight
 *   -6     civil twilight
 *   -0.83  sunrise/sunset including standard refraction and solar radius
 */
export const DAYLIGHT_BANDS = [
  { id: 'astronomical', sunElevationDeg: -18 },
  { id: 'nautical', sunElevationDeg: -12 },
  { id: 'civil', sunElevationDeg: -6 },
  { id: 'day', sunElevationDeg: -0.83 },
] as const

export type DaylightBandId = (typeof DAYLIGHT_BANDS)[number]['id']

export type DaylightBands = {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    properties: { band: DaylightBandId }
    geometry: { type: 'Polygon'; coordinates: [number, number][][] }
  }[]
}

/**
 * Angular radius of the cap, measured from the SUBSOLAR point, inside which
 * the sun sits above `sunElevationDeg`. Sun elevation h and angular distance
 * psi from the subsolar point satisfy sin(h) = cos(psi), so psi = 90 - h.
 * Every lit cap is therefore larger than a hemisphere.
 */
export function litCapRadiusDeg(sunElevationDeg: number): number {
  return 90 - sunElevationDeg
}

export function wrapLonDeg(lonDeg: number): number {
  return ((((lonDeg + 180) % 360) + 360) % 360) - 180
}

export function antipode(latDeg: number, lonDeg: number): { lat: number; lon: number } {
  return { lat: -latDeg, lon: wrapLonDeg(lonDeg + 180) }
}

function clampToMercator(latDeg: number): number {
  return Math.max(-MAX_MERCATOR_LAT_DEG, Math.min(MAX_MERCATOR_LAT_DEG, latDeg))
}

/**
 * Ring of the spherical cap, sampled by bearing with the standard
 * destination-point formula. Longitudes are unwrapped continuously, so a ring
 * that winds around a pole keeps increasing instead of jumping at the date
 * line.
 */
function capRing(
  centerLatDeg: number,
  centerLonDeg: number,
  radiusDeg: number,
  steps: number,
): [number, number][] {
  const lat1 = centerLatDeg * DEG
  const r = radiusDeg * DEG
  const sinLat1 = Math.sin(lat1)
  const cosLat1 = Math.cos(lat1)
  const sinR = Math.sin(r)
  const cosR = Math.cos(r)

  const ring: [number, number][] = []
  let offset = 0
  let prevLon: number | null = null

  for (let i = 0; i <= steps; i++) {
    const bearing = (2 * Math.PI * i) / steps
    const lat2 = Math.asin(sinLat1 * cosR + cosLat1 * sinR * Math.cos(bearing))
    const dLon = Math.atan2(Math.sin(bearing) * sinR * cosLat1, cosR - sinLat1 * Math.sin(lat2))
    let lon = centerLonDeg + dLon / DEG
    if (prevLon !== null) {
      while (lon + offset - prevLon > 180) offset -= 360
      while (lon + offset - prevLon < -180) offset += 360
    }
    lon += offset
    prevLon = lon
    ring.push([lon, clampToMercator(lat2 / DEG)])
  }
  return ring
}

function closeRing(ring: [number, number][]): [number, number][] {
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
  return ring
}

/** Boundary that winds around the globe: single valued in longitude, closed along the polar edge. */
function polarClosedRing(
  centerLatDeg: number,
  centerLonDeg: number,
  radiusDeg: number,
  steps: number,
): [number, number][] {
  const byLon = capRing(centerLatDeg, centerLonDeg, radiusDeg, steps)
    .map(([lon, lat]): [number, number] => [wrapLonDeg(lon), lat])
    .sort((a, b) => a[0] - b[0])
  const edgeLat = centerLatDeg >= 0 ? MAX_MERCATOR_LAT_DEG : -MAX_MERCATOR_LAT_DEG

  const ring: [number, number][] = [[-180, edgeLat], [-180, byLon[0][1]]]
  for (const point of byLon) ring.push(point)
  ring.push([180, byLon[byLon.length - 1][1]])
  ring.push([180, edgeLat])
  ring.push([-180, edgeLat])
  return ring
}

/**
 * Rings for one cap, in a form MapLibre can tile. Three topologies, chosen by
 * how the cap sits relative to the poles:
 *   - reaches both poles: everything except a loop around the antipode, so
 *     the polygon is a full-width box with that loop as a hole. The box is
 *     centred on the hole's own longitude window, which keeps both rings
 *     continuous when the loop straddles the date line.
 *   - reaches one pole: the boundary crosses every meridian exactly once, so
 *     it is single valued in longitude and closes along that polar edge.
 *   - reaches neither: a plain closed loop.
 */
function capPolygonRings(
  centerLatDeg: number,
  centerLonDeg: number,
  radiusDeg: number,
  steps: number,
): [number, number][][] {
  const absLat = Math.abs(centerLatDeg)

  if (radiusDeg >= 90 + absLat) {
    const far = antipode(centerLatDeg, centerLonDeg)
    const hole = closeRing(capRing(far.lat, far.lon, 180 - radiusDeg, steps))
    const lons = hole.map(([lon]) => lon)
    const mid = (Math.min(...lons) + Math.max(...lons)) / 2
    const box: [number, number][] = [
      [mid - 180, -MAX_MERCATOR_LAT_DEG],
      [mid + 180, -MAX_MERCATOR_LAT_DEG],
      [mid + 180, MAX_MERCATOR_LAT_DEG],
      [mid - 180, MAX_MERCATOR_LAT_DEG],
      [mid - 180, -MAX_MERCATOR_LAT_DEG],
    ]
    return [box, hole]
  }

  if (radiusDeg > 90 - absLat) {
    return [polarClosedRing(centerLatDeg, centerLonDeg, radiusDeg, steps)]
  }

  return [closeRing(capRing(centerLatDeg, centerLonDeg, radiusDeg, steps))]
}

/**
 * Nested lit caps for a subsolar point, faintest first. They are drawn as
 * overlapping caps, so each successive layer adds light to the one under it;
 * see the style for the per-layer opacities that compose into the ramp.
 */
export function daylightBands(
  subsolarLatDeg: number,
  subsolarLonDeg: number,
  steps = 180,
): DaylightBands {
  return {
    type: 'FeatureCollection',
    features: DAYLIGHT_BANDS.map((band) => ({
      type: 'Feature' as const,
      properties: { band: band.id },
      geometry: {
        type: 'Polygon' as const,
        coordinates: capPolygonRings(
          subsolarLatDeg,
          subsolarLonDeg,
          litCapRadiusDeg(band.sunElevationDeg),
          steps,
        ),
      },
    })),
  }
}
