/**
 * The hover tooltips, computed from the propagation at the displayed instant
 * rather than read from a table.
 *
 * These take the translator as an argument instead of importing i18n: the
 * convention keeps user-facing copy at the React edge, and a function of
 * `(inputs, t)` can be exercised without a component tree.
 */

import {
  AU,
  bodyApparentAngularDiameterRad,
  eciSiToEcefSi,
  eciSiToGeodetic,
  propagateEci,
  sunEciSi,
  type ObservableBodyId,
} from '@/lib/physics'
import type { SatRec } from 'satellite.js'
import { SUN_ANGULAR_DIAMETER_DEG } from '@/components/viz/globe/sun'
import { SKY_BODY_IDS } from '@/components/viz/globe/celestial'
import { eclipticLonLatDeg, formatAngularDiameter, formatSignedDeg } from './sky-math'
import { geocentricEciOf } from './sky-bodies'

export type TooltipTranslate = (key: string, options?: Record<string, unknown>) => string

export type Tooltip = {
  title: string
  rows: [string, string][]
  /** Encyclopedic read-more, omitted when no public page exists. */
  href?: string
  linkLabel?: string
}

/** Window over which the earth-fixed displacement is sampled to judge stationarity. */
export const GROUND_RATE_WINDOW_S = 60
/**
 * Below this earth-fixed speed a satellite is called geostationary. The bands
 * are far apart, so the threshold decides nothing a real orbit would argue
 * about: a true geostationary bird sits near zero, a 5-degree inclined
 * geosynchronous one runs at a few hundred metres a second, and LEO at
 * thousands.
 */
export const GEOSTATIONARY_SPEED_MS = 50

/**
 * Facts for a satellite under the pointer.
 *
 * Stationarity is decided by the earth-fixed ground track, not by the orbit's
 * name: a satellite whose sub-satellite point barely moves in a minute appears
 * fixed over one meridian, which is the fact a viewer of this view can check.
 */
export function satelliteTooltip(
  satrec: SatRec,
  name: string,
  atMs: number,
  t: TooltipTranslate,
): Tooltip | null {
  const at = new Date(atMs)
  const state = propagateEci(satrec, at)
  if (!state) return null
  const geo = eciSiToGeodetic(state.r, at)
  if (!geo) return null
  const periodMin = (2 * Math.PI) / satrec.no
  const speedKms = Math.hypot(state.v[0], state.v[1], state.v[2]) / 1000
  const inclinationDeg = (satrec.inclo * 180) / Math.PI

  const later = new Date(atMs + GROUND_RATE_WINDOW_S * 1000)
  const laterState = propagateEci(satrec, later)
  let groundSpeedMs: number | null = null
  if (laterState) {
    const ecef0 = eciSiToEcefSi(state.r, at)
    const ecef1 = eciSiToEcefSi(laterState.r, later)
    groundSpeedMs =
      Math.hypot(ecef1[0] - ecef0[0], ecef1[1] - ecef0[1], ecef1[2] - ecef0[2]) /
      GROUND_RATE_WINDOW_S
  }

  const rows: [string, string][] = [
    [t('fields.solar_info_altitude'), `${Math.round(geo.heightM / 1000).toLocaleString()} km`],
    [t('fields.solar_info_speed'), `${speedKms.toFixed(2)} km/s`],
    [
      t('fields.solar_info_period'),
      periodMin < 120 ? `${periodMin.toFixed(1)} min` : `${(periodMin / 60).toFixed(2)} h`,
    ],
    [t('fields.sat_tip_inclination'), `${inclinationDeg.toFixed(2)}°`],
  ]
  if (groundSpeedMs !== null && groundSpeedMs < GEOSTATIONARY_SPEED_MS) {
    rows.push([
      t('fields.sat_tip_stationary'),
      t('fields.sat_tip_stationary_at', { lon: geo.lonDeg.toFixed(1) }),
    ])
  }
  return { title: name, rows }
}

/**
 * Facts for a sky body under the pointer. The ecliptic pair is the labelled
 * one: these paths ARE the ecliptic and the bodies' wanderings about it, so it
 * is the frame that explains the picture.
 */
export function skyBodyTooltip(bodyId: string, atMs: number, t: TooltipTranslate): Tooltip | null {
  const id = SKY_BODY_IDS.find((candidate) => candidate === bodyId)
  if (!id) return null
  const date = new Date(atMs)
  const eci = geocentricEciOf(id, date)
  const distanceM = Math.hypot(eci[0], eci[1], eci[2])
  const sun = sunEciSi(date)
  const elongationDeg =
    id === 'sun'
      ? 0
      : (Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              (eci[0] * sun[0] + eci[1] * sun[1] + eci[2] * sun[2]) /
                (distanceM * Math.hypot(sun[0], sun[1], sun[2])),
            ),
          ),
        ) *
          180) /
        Math.PI
  const angularDeg =
    id === 'sun'
      ? SUN_ANGULAR_DIAMETER_DEG
      : (bodyApparentAngularDiameterRad(id as ObservableBodyId, date) * 180) / Math.PI
  const ecl = eclipticLonLatDeg(eci)
  const rows: [string, string][] = [
    [
      t('fields.sky_tip_distance'),
      id === 'moon'
        ? `${Math.round(distanceM / 1000).toLocaleString()} km`
        : `${(distanceM / AU).toFixed(4)} au · ${Math.round(distanceM / 1000).toLocaleString()} km`,
    ],
    [t('fields.sky_tip_angular_diameter'), formatAngularDiameter(angularDeg)],
  ]
  if (id !== 'sun') rows.push([t('fields.sky_tip_elongation'), `${elongationDeg.toFixed(1)}°`])
  rows.push([
    t('fields.sky_tip_ecliptic'),
    `${ecl.lonDeg.toFixed(2)}° / ${formatSignedDeg(ecl.latDeg)}°`,
  ])
  return { title: t(`fields.body_${id}`), rows }
}
