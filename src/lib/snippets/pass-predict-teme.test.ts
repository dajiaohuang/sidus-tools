import { describe, expect, it } from 'vitest'
import { passPredictSnippets } from './pass-predict'

const python = passPredictSnippets.code.python!

function gmstRadUtcAsUt1(date: Date) {
  const jdUt1 = date.getTime() / 86_400_000 + 2_440_587.5
  const t = (jdUt1 - 2_451_545.0) / 36_525
  const siderealSeconds =
    -6.2e-6 * t ** 3 +
    0.093104 * t ** 2 +
    (876_600 * 3600 + 8_640_184.812866) * t +
    67_310.54841
  const angle = (siderealSeconds * Math.PI) / 43_200
  return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
}

function lookAnglesWgs84(satEcefM: number[], latDeg: number, lonDeg: number, heightM: number) {
  const f = 1 / 298.257223563
  const e2 = f * (2 - f)
  const a = 6_378_137
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2)
  const obs = [
    (n + heightM) * Math.cos(lat) * Math.cos(lon),
    (n + heightM) * Math.cos(lat) * Math.sin(lon),
    (n * (1 - e2) + heightM) * Math.sin(lat),
  ]
  const [dx, dy, dz] = satEcefM.map((v, i) => v - obs[i])
  const south = Math.sin(lat) * Math.cos(lon) * dx + Math.sin(lat) * Math.sin(lon) * dy - Math.cos(lat) * dz
  const east = -Math.sin(lon) * dx + Math.cos(lon) * dy
  const zenith = Math.cos(lat) * Math.cos(lon) * dx + Math.cos(lat) * Math.sin(lon) * dy + Math.sin(lat) * dz
  const az = Math.atan2(east, -south)
  return {
    azRad: (az + 2 * Math.PI) % (2 * Math.PI),
    elRad: Math.atan2(zenith, Math.hypot(south, east)),
    rangeM: Math.hypot(south, east, zenith),
  }
}

describe('Python pass-predict coordinate contract', () => {
  it('is self-contained, rotates TEME to PEF, and converts observer degrees to radians', () => {
    expect(python).toContain('def teme_to_pef_m(r_teme_km, jd, fr):')
    expect(python).toContain('def look_angles(lat_deg, lon_deg, h_m, r_pef_m):')
    expect(python).toContain('lat_rad, lon_rad = math.radians(lat_deg), math.radians(lon_deg)')
    expect(python).toContain('r_pef_m = teme_to_pef_m(r_km, jd, fr)')
    expect(python).not.toContain('also use look_angles()')
    expect(python).not.toContain('TEME-as-ECEF')
  })

  it('matches the fixed ISS/TLE frame-and-look-angle anchor', () => {
    // Shipped ISS TLE at 2026-08-24T14:04:46.002Z; Vallado GMST and WGS-84/SEZ.
    const date = new Date('2026-08-24T14:04:46.002Z')
    const theta = gmstRadUtcAsUt1(date)
    const [x, y, z] = [-942.5043541427743, 5135.064294151067, 4336.645343937117]
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    const pefM = [
      (x * c + y * s) * 1000,
      (-x * s + y * c) * 1000,
      z * 1000,
    ]
    const look = lookAnglesWgs84(pefM, 28.5721, -80.648, 3)

    expect(pefM[0] / 1000).toBeCloseTo(576.7621131578625, 6)
    expect(pefM[1] / 1000).toBeCloseTo(-5188.8867040502, 6)
    expect(look.azRad * 180 / Math.PI).toBeCloseTo(348.3803078876, 6)
    expect(look.elRad * 180 / Math.PI).toBeCloseTo(11.6068646869, 6)
    expect(look.elRad).toBeGreaterThan((10 * Math.PI) / 180)
    expect(look.rangeM).toBeCloseTo(1_389_257.531913, 3)
  })
})
