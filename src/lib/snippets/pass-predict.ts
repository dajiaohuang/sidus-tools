import type { FormulaSnippet } from './types'

const ASSUMPTIONS =
  'Coarse time sampling of SGP4 elevation; AOS/LOS when elevation crosses a minimum mask angle.'

/**
 * Library-backed for Python / JS / TS. Systems langs: pure geometric elevation
 * mask / AOS-LOS educational core (el from SEZ zenith component).
 */
export const passPredictSnippets: FormulaSnippet = {
  formulaId: 'pass-predict',
  assumptions: ASSUMPTIONS,
  deps: [
    {
      name: 'sgp4',
      ecosystem: 'pypi',
      url: 'https://pypi.org/project/sgp4/',
      install: 'pip install sgp4',
      note: 'Python SGP4 used in the educational pass sampler.',
      langs: ['python'],
    },
    {
      name: 'satellite.js',
      ecosystem: 'npm',
      url: 'https://www.npmjs.com/package/satellite.js',
      install: 'npm i satellite.js',
      note: 'Browser/TS equivalent for TLE → elevation sampling.',
      langs: ['javascript', 'typescript'],
    },
  ],
  code: {
    python: `# Next pass (coarse): ${ASSUMPTIONS}
import math
from datetime import datetime, timezone, timedelta
from sgp4.api import Satrec, jday

# SGP4 returns TEME. Treat UTC as UT1 and ignore polar motion in this
# educational TEME → PEF approximation (Vallado GMST-1982).
def teme_to_pef_m(r_teme_km, jd, fr):
    tut1 = ((jd - 2451545.0) + fr) / 36525.0
    gmst_seconds = (
        -6.2e-6 * tut1 ** 3
        + 0.093104 * tut1 ** 2
        + (876600.0 * 3600.0 + 8640184.812866) * tut1
        + 67310.54841
    )
    theta = math.radians(gmst_seconds / 240.0) % (2.0 * math.pi)
    x_km, y_km, z_km = r_teme_km
    c, s = math.cos(theta), math.sin(theta)
    return [
        (x_km * c + y_km * s) * 1000.0,
        (-x_km * s + y_km * c) * 1000.0,
        z_km * 1000.0,
    ]

def look_angles(lat_deg, lon_deg, h_m, r_pef_m):
    # Observer geodetic coordinates are degrees; the SEZ trigonometry is radians.
    lat_rad, lon_rad = math.radians(lat_deg), math.radians(lon_deg)
    f = 1.0 / 298.257223563
    e2 = f * (2.0 - f)
    a_m = 6378137.0
    n_m = a_m / math.sqrt(1.0 - e2 * math.sin(lat_rad) ** 2)
    obs_x = (n_m + h_m) * math.cos(lat_rad) * math.cos(lon_rad)
    obs_y = (n_m + h_m) * math.cos(lat_rad) * math.sin(lon_rad)
    obs_z = (n_m * (1.0 - e2) + h_m) * math.sin(lat_rad)
    dx_m, dy_m, dz_m = r_pef_m[0] - obs_x, r_pef_m[1] - obs_y, r_pef_m[2] - obs_z
    south = (
        math.sin(lat_rad) * math.cos(lon_rad) * dx_m
        + math.sin(lat_rad) * math.sin(lon_rad) * dy_m
        - math.cos(lat_rad) * dz_m
    )
    east = -math.sin(lon_rad) * dx_m + math.cos(lon_rad) * dy_m
    zenith = (
        math.cos(lat_rad) * math.cos(lon_rad) * dx_m
        + math.cos(lat_rad) * math.sin(lon_rad) * dy_m
        + math.sin(lat_rad) * dz_m
    )
    az = math.atan2(east, -south) % (2.0 * math.pi)
    el = math.atan2(zenith, math.hypot(south, east))
    range_m = math.hypot(south, east, zenith)
    return az, el, range_m

def elev_at(sat, lat_deg, lon_deg, h_m, t):
    jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute,
                  t.second + t.microsecond * 1e-6)
    err, r_km, _v = sat.sgp4(jd, fr)
    if err != 0:
        return None
    r_pef_m = teme_to_pef_m(r_km, jd, fr)
    _az, el, _rng = look_angles(lat_deg, lon_deg, h_m, r_pef_m)
    return el

def find_next_pass(sat, lat_deg, lon_deg, h_m, start=None,
                   horizon_h=24, step_s=30, min_el_deg=10):
    start = start or datetime.now(timezone.utc)
    min_el = math.radians(min_el_deg)
    t_end = start + timedelta(hours=horizon_h)
    t = start
    in_pass = False
    aos = max_el = max_el_at = None
    while t <= t_end:
        el = elev_at(sat, lat_deg, lon_deg, h_m, t)
        if el is None:
            t += timedelta(seconds=step_s); continue
        if not in_pass and el >= min_el:
            in_pass = True
            aos = t
            max_el, max_el_at = el, t
        elif in_pass:
            if el > max_el:
                max_el, max_el_at = el, t
            if el < min_el:
                los = t
                return {
                    "aos": aos, "los": los,
                    "max_el_deg": math.degrees(max_el),
                    "max_el_at": max_el_at,
                    "duration_s": (los - aos).total_seconds(),
                }
        t += timedelta(seconds=step_s)
    return None`,

    javascript: `// Next pass (coarse): ${ASSUMPTIONS}
// Sample elevation every stepS; AOS on rising minEl, LOS on falling.
function findNextPass(satrec, observer, start, {
  horizonH = 24, stepS = 30, minElDeg = 10,
} = {}) {
  const minEl = (minElDeg * Math.PI) / 180
  const t0 = start.getTime()
  const tEnd = t0 + horizonH * 3600 * 1000
  let inPass = false, aos = null, maxEl = -Infinity, maxElAt = null
  for (let t = t0; t <= tEnd; t += stepS * 1000) {
    const date = new Date(t)
    const pv = propagate(satrec, date)
    if (!pv?.position || typeof pv.position === 'boolean') continue
    const gmst = gstime(date)
    const look = ecfToLookAngles(observer, eciToEcf(pv.position, gmst))
    const el = look.elevation
    if (!inPass && el >= minEl) {
      inPass = true; aos = date; maxEl = el; maxElAt = date
    } else if (inPass) {
      if (el > maxEl) { maxEl = el; maxElAt = date }
      if (el < minEl) {
        return { aos, los: date, maxElDeg: maxEl*180/Math.PI, maxElAt,
          durationS: (date - aos) / 1000 }
      }
    }
  }
  return null
}`,

    typescript: `// Next pass (coarse): ${ASSUMPTIONS}
// Sample elevation every stepS; AOS on rising minEl, LOS on falling.
// Uses satellite.js: propagate → eciToEcf → ecfToLookAngles (see JS block).
function findNextPass(
  satrec: SatRec,
  observer: GeodeticLocation,
  start: Date,
  opts: { horizonH?: number; stepS?: number; minElDeg?: number } = {},
): { aos: Date; los: Date; maxElDeg: number; maxElAt: Date; durationS: number } | null {
  const { horizonH = 24, stepS = 30, minElDeg = 10 } = opts
  const minEl = (minElDeg * Math.PI) / 180
  const t0 = start.getTime()
  const tEnd = t0 + horizonH * 3600 * 1000
  let inPass = false
  let aos: Date | null = null
  let maxEl = -Infinity
  let maxElAt: Date | null = null
  for (let t = t0; t <= tEnd; t += stepS * 1000) {
    const date = new Date(t)
    const pv = propagate(satrec, date)
    if (!pv?.position || typeof pv.position === 'boolean') continue
    const gmst = gstime(date)
    const look = ecfToLookAngles(observer, eciToEcf(pv.position, gmst))
    const el = look.elevation
    if (!inPass && el >= minEl) {
      inPass = true; aos = date; maxEl = el; maxElAt = date
    } else if (inPass) {
      if (el > maxEl) { maxEl = el; maxElAt = date }
      if (el < minEl && aos && maxElAt) {
        return {
          aos, los: date, maxElDeg: (maxEl * 180) / Math.PI, maxElAt,
          durationS: (date.getTime() - aos.getTime()) / 1000,
        }
      }
    }
  }
  return null
}`,

    // Pure geometric elevation / mask core (systems langs)
    c: `/* Pass geometry core: pure SI (not full AOS search) */
/* free: south, east, zenith [m SEZ], el_min [rad] */
const double range_m = sqrt(south * south + east * east + zenith * zenith);
const double el = asin(zenith / range_m);
const double above = el - el_min; /* >0 ⇒ in-pass candidate */`,

    cpp: `// Pass geometry core: pure SI (not full AOS search)
// free: south, east, zenith [m SEZ], el_min [rad]
const double range_m = std::sqrt(south * south + east * east + zenith * zenith);
const double el = std::asin(zenith / range_m);
const double above = el - el_min; // >0 ⇒ in-pass candidate`,

    rust: `// Pass geometry core: pure SI (not full AOS search)
// free: south, east, zenith [m SEZ], el_min [rad]
let range_m = south.hypot(east).hypot(zenith);
let el = (zenith / range_m).asin();
let above = el - el_min; // >0 ⇒ in-pass candidate`,

    zig: `// Pass geometry core: pure SI (not full AOS search)
// free: south, east, zenith [m SEZ], el_min [rad]
const range_m = std.math.sqrt(south * south + east * east + zenith * zenith);
const el = std.math.asin(zenith / range_m);
const above = el - el_min; // >0 ⇒ in-pass candidate`,

    fortran: `! Pass geometry core: pure SI (not full AOS search)
! free: south, east, zenith [m SEZ], el_min [rad]
range_m = sqrt(south**2 + east**2 + zenith**2)
el = asin(zenith / range_m)
above = el - el_min`,

    matlab: `% Pass geometry core: pure SI (not full AOS search)
% free: south, east, zenith [m SEZ], el_min [rad]
% Full AOS/LOS: sample el(t) every step; AOS on rising el_min, LOS on falling.
range_m = sqrt(south^2 + east^2 + zenith^2);
el = asin(zenith / range_m);
above = el - el_min; % >0 ⇒ in-pass candidate`,

    julia: `# Pass geometry core: pure SI (not full AOS search)
# free: south, east, zenith [m SEZ], el_min [rad]
range_m = hypot(south, east, zenith)
el = asin(zenith / range_m)
above = el - el_min  # >0 ⇒ in-pass candidate`,

    latex: `% AOS/LOS = elevation zero-crossings of $el(t)-el_{\\min}$.
\\[
  \\sin el = z_{\\mathrm{SEZ}}/|\\boldsymbol\\rho|,\\quad
  \\mathrm{AOS}: el\\uparrow el_{\\min},\\quad
  \\mathrm{LOS}: el\\downarrow el_{\\min}
\\]`,
  },
}
