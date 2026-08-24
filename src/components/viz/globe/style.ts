/**
 * MapLibre style for the globe view: a dark, lines-only rendering of
 * OpenFreeMap's OpenMapTiles-schema planet vector tiles, plus the empty
 * night / marker sources the component fills at runtime.
 *
 * The palette below is written as literal colors on purpose: a MapLibre
 * style is plain JSON handed to the GL renderer, so it cannot read the
 * Tailwind theme tokens (`var(--color-…)`) the surrounding React chrome
 * uses. These values mirror the theme's dark surfaces.
 */

import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl'
import { cssRgbaWithAlpha } from './color'
import { DAYLIGHT_BANDS, type DaylightBandId } from './terminator'

const PALETTE = {
  background: '#050506',
  water: '#0b0e13',
  halo: '#050506',
  boundaryAdmin0: 'rgba(245,245,245,0.35)',
  boundaryAdmin1: 'rgba(245,245,245,0.2)',
  placeCountry: '#9a9a9a',
  placeState: '#6e6e6e',
  placeCity: '#cccccc',
  placeCapital: '#f2f2f2',
  daylight: '#ffe3b0',
  marker: '#f2f2f2',
  sunDisk: '#fff6de',
  sunGlow: '255, 214, 120',
} as const

/**
 * Daylight opacities. The lit caps are nested and overlap, so each layer
 * composites over the one under it: the per-layer alpha below is derived from
 * the intended cumulative ramp 0.02 / 0.045 / 0.08 / 0.13 by
 * a_n = 1 - (1 - cum_n) / (1 - cum_(n-1)). Full night is left untouched, so
 * the dark base map IS the night side.
 */
const DAYLIGHT_LAYER_OPACITY: Record<DaylightBandId, number> = {
  astronomical: 0.02,
  nautical: 0.0255,
  civil: 0.0367,
  day: 0.0543,
}

/** Fallback marker color when the caller does not pass one. */
export const DEFAULT_MARKER_COLOR: string = PALETTE.marker
/** Sun billboard colors, kept with the rest of the globe palette. */
export const SUN_DISK_COLOR: string = PALETTE.sunDisk
export const SUN_GLOW_RGB: string = PALETTE.sunGlow

export const OPENMAPTILES_SOURCE_ID = 'openmaptiles'
export const NIGHT_SOURCE_ID = 'night'
export const MARKERS_SOURCE_ID = 'markers'
/** Satellite trail layers are inserted before this one, so markers stay on top. */
export const MARKERS_FIRST_LAYER_ID = 'markers-dot-static'
export const SATELLITE_MARKER_LAYER_IDS = ['markers-dot-satellite', 'markers-label-satellite']

export const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection' as const, features: [] }

export function daylightLayerId(band: DaylightBandId): string {
  return `daylight-${band}`
}

/*
 * boundary layer fields (verified against the real OpenMapTiles schema
 * docs, https://openmaptiles.org/schema/#boundary): admin_level (number),
 * maritime (0/1), disputed (0/1), claimed_by (ISO2 string, only present on
 * alternate/claim lines a specific country's map wants to show, e.g.
 * Antarctic sector claims). All boundary layers exclude maritime=1,
 * disputed=1 and any feature that HAS claimed_by, matching the filter
 * pattern OpenFreeMap's own reference "liberty" style uses for this same
 * tile source (https://tiles.openfreemap.org/styles/liberty).
 */
function boundaryFilter(adminLevel: ExpressionSpecification): FilterSpecification {
  return [
    'all',
    adminLevel,
    ['!=', ['get', 'maritime'], 1],
    ['!=', ['get', 'disputed'], 1],
    ['!', ['has', 'claimed_by']],
  ]
}

/*
 * place layer fields (verified against the real OpenMapTiles schema docs,
 * https://openmaptiles.org/schema/#place): name/name_en, class
 * (country/state/province/city/town/village/...), capital (marks the
 * admin_level a place is a capital of, 2 = national capital), rank
 * (countries and states 1-6, cities 1-10+, lower = more important). Font
 * stacks match the ones OpenFreeMap's own "liberty" reference style uses
 * for these same tiers, confirmed live via the glyphs endpoint.
 */
const PLACE_NAME_EXPR: DataDrivenPropertyValueSpecification<string> = [
  'coalesce',
  ['get', 'name_en'],
  ['get', 'name'],
]

/* Zoom-stepped rank ceiling for the regular (non-prominent) city tier:
   rank<=4 from this layer's minzoom (5) to z7, rank<=8 from z7 to z9, then
   effectively unlimited (9999) from z9 on. */
const PLACE_CITY_RANK_THRESHOLD: ExpressionSpecification = ['step', ['zoom'], 4, 7, 8, 9, 9999]
const PLACE_CITY_PROMINENT_FILTER: FilterSpecification = [
  'all',
  ['==', ['get', 'class'], 'city'],
  ['any', ['==', ['get', 'capital'], 2], ['<=', ['get', 'rank'], 2]],
]
const PLACE_CITY_REGULAR_FILTER: FilterSpecification = [
  'all',
  ['==', ['get', 'class'], 'city'],
  ['!', ['any', ['==', ['get', 'capital'], 2], ['<=', ['get', 'rank'], 2]]],
  ['<=', ['get', 'rank'], PLACE_CITY_RANK_THRESHOLD],
]

/**
 * Base style. Satellite trail sources and layers are added at runtime (see
 * satelliteSourceSpecs / satelliteLayerSpecs) so one code path serves both
 * the first satellite and any added later.
 */
export function buildBaseStyle(): StyleSpecification {
  return {
    version: 8,
    /* Projection is set at STYLE level: the runtime setProjection() call in
       the component is only a defensive re-assert after style load. */
    projection: { type: 'globe' },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      [OPENMAPTILES_SOURCE_ID]: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: '&copy; OpenStreetMap contributors, OpenFreeMap',
      },
      [NIGHT_SOURCE_ID]: { type: 'geojson', data: EMPTY_FEATURE_COLLECTION },
      [MARKERS_SOURCE_ID]: { type: 'geojson', data: EMPTY_FEATURE_COLLECTION },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': PALETTE.background } },
      {
        /*
         * Water/coast is a FILL only, never stroked. Vector-tile polygons
         * are clipped per tile; stroking them draws their internal tile-cut
         * edges as spurious straight lines (hairy coastlines locally,
         * dead-straight pole-to-pole lines along the antimeridian and prime
         * meridian tile columns at low zoom). Fills of adjacent tiles abut
         * seamlessly, so this removes the artifact instead of hiding it.
         * fill-outline-color is left unset so it defaults to fill-color.
         */
        id: 'water-fill',
        type: 'fill',
        source: OPENMAPTILES_SOURCE_ID,
        'source-layer': 'water',
        paint: { 'fill-color': PALETTE.water, 'fill-antialias': true },
      },
      /* Daylight bands, faintest (astronomical twilight) first so the higher
         sun elevations add light on top. Antialiasing off so the closing edge
         at the mercator latitude limit does not read as a drawn line. */
      ...DAYLIGHT_BANDS.map(
        (band): LayerSpecification => ({
          id: daylightLayerId(band.id),
          type: 'fill',
          source: NIGHT_SOURCE_ID,
          filter: ['==', ['get', 'band'], band.id],
          paint: {
            'fill-color': PALETTE.daylight,
            'fill-opacity': DAYLIGHT_LAYER_OPACITY[band.id],
            'fill-antialias': false,
          },
        }),
      ),
      {
        id: 'boundaries-admin0',
        type: 'line',
        source: OPENMAPTILES_SOURCE_ID,
        'source-layer': 'boundary',
        minzoom: 1.5,
        filter: boundaryFilter(['==', ['get', 'admin_level'], 2]),
        paint: {
          'line-color': PALETTE.boundaryAdmin0,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1.5, 0.6, 6, 1.4, 10, 2],
        },
      },
      {
        id: 'boundaries-admin1',
        type: 'line',
        source: OPENMAPTILES_SOURCE_ID,
        'source-layer': 'boundary',
        minzoom: 3,
        filter: boundaryFilter(['>=', ['get', 'admin_level'], 4]),
        paint: {
          'line-color': PALETTE.boundaryAdmin1,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.3, 6, 0.6, 10, 1.0],
        },
      },
      {
        id: 'place-country',
        type: 'symbol',
        source: OPENMAPTILES_SOURCE_ID,
        'source-layer': 'place',
        minzoom: 2.5,
        filter: ['==', ['get', 'class'], 'country'],
        layout: {
          'text-field': PLACE_NAME_EXPR,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2.5, 11, 8, 16],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.15,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': PALETTE.placeCountry,
          'text-halo-color': PALETTE.halo,
          'text-halo-width': 1.2,
        },
      },
      {
        /* The real OpenMapTiles schema lists BOTH "state" and "province" as
           class values for admin-1 regions, so admin-1 labels cover both. */
        id: 'place-state',
        type: 'symbol',
        source: OPENMAPTILES_SOURCE_ID,
        'source-layer': 'place',
        minzoom: 4,
        filter: ['any', ['==', ['get', 'class'], 'state'], ['==', ['get', 'class'], 'province']],
        layout: {
          'text-field': PLACE_NAME_EXPR,
          'text-font': ['Noto Sans Italic'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 8, 13],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': PALETTE.placeState,
          'text-halo-color': PALETTE.halo,
          'text-halo-width': 1,
        },
      },
      {
        /* Regular cities: excludes the prominent tier (capital OR rank<=2),
           with the rank threshold relaxing as zoom increases. */
        id: 'place-city-dot',
        type: 'circle',
        source: OPENMAPTILES_SOURCE_ID,
        'source-layer': 'place',
        minzoom: 5,
        filter: PLACE_CITY_REGULAR_FILTER,
        paint: { 'circle-radius': 2, 'circle-color': PALETTE.placeCity },
      },
      {
        id: 'place-city-label',
        type: 'symbol',
        source: OPENMAPTILES_SOURCE_ID,
        'source-layer': 'place',
        minzoom: 5,
        filter: PLACE_CITY_REGULAR_FILTER,
        layout: {
          'text-field': PLACE_NAME_EXPR,
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 9, 9, 12],
          'text-anchor': 'left',
          'text-offset': [0.5, 0],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': PALETTE.placeCity,
          'text-halo-color': PALETTE.halo,
          'text-halo-width': 1,
        },
      },
      {
        /* Prominent tier: capital=2 (national capital, per the schema's
           "capital marks the admin_level this place is a capital of") OR
           rank<=2, visible one zoom step earlier than regular cities. */
        id: 'place-capital-dot',
        type: 'circle',
        source: OPENMAPTILES_SOURCE_ID,
        'source-layer': 'place',
        minzoom: 4,
        filter: PLACE_CITY_PROMINENT_FILTER,
        paint: { 'circle-radius': 2.6, 'circle-color': PALETTE.placeCapital },
      },
      {
        id: 'place-capital-label',
        type: 'symbol',
        source: OPENMAPTILES_SOURCE_ID,
        'source-layer': 'place',
        minzoom: 4,
        filter: PLACE_CITY_PROMINENT_FILTER,
        layout: {
          'text-field': PLACE_NAME_EXPR,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 9, 14],
          'text-anchor': 'left',
          'text-offset': [0.5, 0],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': PALETTE.placeCapital,
          'text-halo-color': PALETTE.halo,
          'text-halo-width': 1,
        },
      },
      {
        /* Static markers (observer, pass instants): always on the surface,
           never elevated, never hidden by the altitude toggle. */
        id: MARKERS_FIRST_LAYER_ID,
        type: 'circle',
        source: MARKERS_SOURCE_ID,
        filter: ['==', ['get', 'kind'], 'static'],
        paint: { 'circle-radius': 4, 'circle-color': ['get', 'color'] },
      },
      {
        id: 'markers-label-static',
        type: 'symbol',
        source: MARKERS_SOURCE_ID,
        filter: ['==', ['get', 'kind'], 'static'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, -1.2],
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': ['get', 'color'] },
      },
      {
        /* Satellite surface dot: hidden while the altitude layer draws the
           real elevated dot instead. */
        id: 'markers-dot-satellite',
        type: 'circle',
        source: MARKERS_SOURCE_ID,
        filter: ['==', ['get', 'kind'], 'satellite'],
        paint: { 'circle-radius': 4, 'circle-color': ['get', 'color'] },
      },
      {
        /* Satellite label: flat 2D symbol layer, hidden while altitude mode
           is on in favor of the HTML overlay label that tracks the real
           elevated position. */
        id: 'markers-label-satellite',
        type: 'symbol',
        source: MARKERS_SOURCE_ID,
        filter: ['==', ['get', 'kind'], 'satellite'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, -1.2],
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': ['get', 'color'] },
      },
    ],
  }
}

export function trailSourceIds(satelliteId: string): { body: string; fade: string } {
  return { body: `trail-body-${satelliteId}`, fade: `trail-fade-${satelliteId}` }
}

export function trailLayerIds(satelliteId: string): string[] {
  return [
    `trail-solid-fade-${satelliteId}`,
    `trail-solid-body-${satelliteId}`,
    `trail-dashed-body-${satelliteId}`,
    `trail-dashed-fade-${satelliteId}`,
  ]
}

/**
 * Fade gradients for one satellite. `fadeFraction` is where the gradient
 * reaches full opacity, as a fraction of the fade segment's own length.
 * Shared with the runtime repaint path, which re-applies them when the
 * caller's trail window (and therefore the fraction) changes.
 */
/**
 * Colours satellites are assigned, in order, as they are selected.
 *
 * Chosen for the same reason the sky paths have their own map: a trail is a
 * one-pixel line on a dark globe, so neighbours have to separate on hue, not on
 * lightness. Every pair is at least 40/255 apart in some channel, twice the
 * bar the sky palette holds, because these lines cross each other constantly
 * rather than running parallel. The first entry is the gold the ISS has always
 * been drawn in, so the default view is unchanged. The list wraps: past its
 * length the population is large enough that identity comes from selecting a
 * satellite, not from telling its colour apart.
 */
export const SATELLITE_PALETTE: readonly string[] = [
  '#b8a55a', // gold, the ISS as it has always been
  '#e65c5c', // red
  '#e6e65c', // yellow
  '#7db247', // olive
  '#5ce65c', // green
  '#47b27d', // jade
  '#5ce6e6', // cyan
  '#477db2', // steel blue
  '#5c5ce6', // indigo
  '#7d47b2', // violet
  '#e65ce6', // magenta
  '#b2477d', // rose
]

/** The colour for the nth selected satellite, wrapping past the palette. */
export function satelliteColorAt(index: number): string {
  return SATELLITE_PALETTE[index % SATELLITE_PALETTE.length]
}

/**
 * How heavily a trail is drawn, given how many are on screen at once.
 *
 * One satellite is the subject of the view and gets the full weight. Once
 * several share the globe the trails stop being the subject and become
 * context: each one thins and dims so the bundle reads as a population rather
 * than a tangle, and so the ground beneath stays visible. Stepped rather than
 * continuous, so adding one satellite does not visibly restyle the others
 * except at the boundaries; the steps were set by eye at 1, 3, 10 and 30
 * satellites on a 1280x900 canvas.
 */
export function trailWeightFor(satelliteCount: number): { widthPx: number; alpha: number } {
  if (satelliteCount <= 1) return { widthPx: 1.4, alpha: 1 }
  if (satelliteCount <= 5) return { widthPx: 1.2, alpha: 0.8 }
  /* 0.9 runs to the end of the named tier so that a trail carrying a name is
     always wide enough to carry a dash pattern too; 0.6 belongs to the dense
     tier, where the lines are drawn solid because a dash at that width reads
     as noise rather than as direction. */
  if (satelliteCount <= 30) return { widthPx: 0.9, alpha: 0.6 }
  return { widthPx: 0.6, alpha: 0.4 }
}

/**
 * Whether a trail of this weight is drawn dashed. The dash marks the part of
 * the orbit not yet flown, which is worth saying while a trail is a subject
 * and not worth the noise once it is one line in a crowd.
 */
export function trailIsDashed(weight: { widthPx: number }): boolean {
  return weight.widthPx >= 0.9
}

export function trailFadeGradients(
  color: string,
  fadeFraction: number,
  alpha = 1,
): { solid: ExpressionSpecification; dashed: ExpressionSpecification } {
  const transparent = cssRgbaWithAlpha(color, 0)
  color = alpha >= 1 ? color : cssRgbaWithAlpha(color, alpha)
  return {
    solid: [
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,
      transparent,
      fadeFraction,
      color,
      1,
      color,
    ],
    dashed: [
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,
      color,
      1 - fadeFraction,
      color,
      1,
      transparent,
    ],
  }
}

/**
 * Dash paint for the future half of a flat trail, or nothing at the dense tier.
 *
 * These lengths are in MapLibre's own dasharray units, which scale with the
 * line WIDTH in pixels, not with metres on the ground. The pattern is therefore
 * already effectively screen-constant and is not the zoom-degrading class the
 * elevated layer's metre-based dashes were: nothing here needs converting to
 * the ground-resolution mechanism.
 */
function futureDash(weight: { widthPx: number }): { 'line-dasharray'?: [number, number] } {
  return trailIsDashed(weight) ? { 'line-dasharray': [2, 2] } : {}
}

/** Trail layers for one satellite: solid past and dashed future, each split into body and fade. */
export function trailLayerSpecs(
  satelliteId: string,
  color: string,
  fadeFraction: number,
  weight = trailWeightFor(1),
): LayerSpecification[] {
  const sources = trailSourceIds(satelliteId)
  const [solidFade, solidBody, dashedBody, dashedFade] = trailLayerIds(satelliteId)
  const gradients = trailFadeGradients(color, fadeFraction, weight.alpha)
  const bodyColor = weight.alpha >= 1 ? color : cssRgbaWithAlpha(color, weight.alpha)
  return [
    {
      /* Oldest tail of the past (solid) trail: fades in from transparent.
         Reads the fade source (lineMetrics:true, required for
         line-gradient). Each source only ever holds fade-kind or body-kind
         features, so the filter only needs future/past. */
      id: solidFade,
      type: 'line',
      source: sources.fade,
      filter: ['==', ['get', 'future'], false],
      paint: { 'line-width': weight.widthPx, 'line-gradient': gradients.solid },
    },
    {
      /* Everything else of the past trail: full opacity, no gradient. Reads
         the body source (no lineMetrics: it does not need line-progress,
         and keeping the flag off avoids the dasharray scale caveat for the
         dashed body layer below, which shares this source). */
      id: solidBody,
      type: 'line',
      source: sources.body,
      filter: ['==', ['get', 'future'], false],
      paint: { 'line-color': bodyColor, 'line-width': weight.widthPx },
    },
    {
      /* Everything of the future trail except its furthest tip. */
      id: dashedBody,
      type: 'line',
      source: sources.body,
      filter: ['==', ['get', 'future'], true],
      paint: { 'line-color': bodyColor, 'line-width': weight.widthPx, ...futureDash(weight) },
    },
    {
      /* Furthest tip of the future trail: fades out to transparent. */
      id: dashedFade,
      type: 'line',
      source: sources.fade,
      filter: ['==', ['get', 'future'], true],
      paint: {
        'line-width': weight.widthPx,
        ...futureDash(weight),
        'line-gradient': gradients.dashed,
      },
    },
  ]
}
