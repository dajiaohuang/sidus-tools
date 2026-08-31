/**
 * Radiator heat rejection in Earth orbit, heat-pump temperature lift and
 * orbital-data-center power / radiator sizing. Pure SI.
 *
 * Environment loads follow Gilmore (Spacecraft Thermal Control Handbook) and
 * Turyshev 2026 eq. 35: q_env = alpha S f_sun + F (alpha a S + alpha_ir sigma T_e^4).
 * The Earth-IR term uses the IR absorptivity, which for a gray surface equals
 * the emissivity (Kirchhoff). The Starcloud 2024 worked example applies the
 * solar absorptivity to that term; callers reproduce it with `irAbsorptivity`.
 */
import { EARTH_RADIUS } from './constants'
import { SOLAR_CONSTANT_1AU, STEFAN_BOLTZMANN } from './power'

export type RadiatorNetFluxInput = {
  tempK: number
  emissivity: number
  absorptivity: number
  /** Emitting faces (2 = free-flying panel, 1 = body-mounted). Default 2. */
  sides?: 1 | 2
  solarFlux?: number
  /** cos(incidence) times sunlit fraction on the sunlit face, in [0, 1]. Default 1. */
  sunExposure?: number
  /** Lumped plate-to-Earth view factor in [0, 1]. Default 0.25. */
  viewFactor?: number
  albedo?: number
  earthTempK?: number
  /** IR absorptivity; defaults to `emissivity` (Kirchhoff). */
  irAbsorptivity?: number
  sigma?: number
}

export type RadiatorNetFlux = {
  qEmit: number
  qSun: number
  qAlbedo: number
  qIr: number
  qNet: number
  /** m² per kW of rejected heat; null when qNet <= 0. */
  areaPerKw: number | null
  /** Temperature at which qNet = 0 for the same loads. */
  tFloorK: number
}

export function radiatorNetFlux(i: RadiatorNetFluxInput): RadiatorNetFlux | null {
  const sides = i.sides ?? 2
  const S = i.solarFlux ?? SOLAR_CONSTANT_1AU
  const fSun = i.sunExposure ?? 1
  const F = i.viewFactor ?? 0.25
  const albedo = i.albedo ?? 0.3
  const Te = i.earthTempK ?? 255
  const alphaIr = i.irAbsorptivity ?? i.emissivity
  const sigma = i.sigma ?? STEFAN_BOLTZMANN
  if (!(i.tempK > 0) || !(i.emissivity > 0) || i.emissivity > 1) return null
  if (!(i.absorptivity >= 0) || i.absorptivity > 1) return null
  if (sides !== 1 && sides !== 2) return null
  if (!(S > 0) || !(fSun >= 0) || fSun > 1 || !(F >= 0) || F > 1) return null
  if (!(albedo >= 0) || albedo > 1 || !(Te > 0)) return null
  if (!(alphaIr >= 0) || alphaIr > 1 || !(sigma > 0)) return null
  const qEmit = sides * i.emissivity * sigma * i.tempK ** 4
  const qSun = i.absorptivity * S * fSun
  const qAlbedo = F * i.absorptivity * albedo * S
  const qIr = F * alphaIr * sigma * Te ** 4
  const qNet = qEmit - qSun - qAlbedo - qIr
  const tFloorK = ((qSun + qAlbedo + qIr) / (sides * i.emissivity * sigma)) ** 0.25
  return { qEmit, qSun, qAlbedo, qIr, qNet, areaPerKw: qNet > 0 ? 1000 / qNet : null, tFloorK }
}

/** View factor from a flat plate facing nadir to a sphere: (R/(R+h))². */
export function nadirPlateViewFactor(altitudeM: number, bodyR = EARTH_RADIUS): number | null {
  if (!(altitudeM >= 0) || !(bodyR > 0)) return null
  const x = bodyR / (bodyR + altitudeM)
  return x * x
}

export type RadiatorHeatPumpInput = {
  q: number
  tColdK: number
  tHotK: number
  /** Given cooling COP; wins over carnotFraction when both are set. */
  cop?: number
  /** Second-law fraction: COP = carnotFraction × T_c/(T_h − T_c). */
  carnotFraction?: number
  emissivity: number
  sides?: 1 | 2
  /** Absorbed environment flux on the radiator, W/m². Default 0. */
  qEnv?: number
  /** Baseline radiator temperature without heat pump. Default tColdK. */
  tBaseK?: number
  /** Electric W/m² of the array that feeds the compressor. 0 or absent skips the PV trade. */
  pvPowerDensity?: number
  sigma?: number
}

export type RadiatorHeatPump = {
  copCarnot: number
  cop: number
  carnotFraction: number
  work: number
  qRej: number
  qNetBase: number
  qNetHp: number
  aBase: number | null
  aHp: number | null
  areaSaved: number | null
  areaReduction: number | null
  extraPvArea: number | null
  netAreaSaved: number | null
  /** W / Q: extra electric power per unit of payload heat. */
  overhead: number
}

export function radiatorHeatPump(i: RadiatorHeatPumpInput): RadiatorHeatPump | null {
  const sides = i.sides ?? 1
  const qEnv = i.qEnv ?? 0
  const tBase = i.tBaseK ?? i.tColdK
  const pv = i.pvPowerDensity ?? 0
  const sigma = i.sigma ?? STEFAN_BOLTZMANN
  if (!(i.q > 0) || !(i.tColdK > 0) || !(i.tHotK > i.tColdK)) return null
  if (!(i.emissivity > 0) || i.emissivity > 1 || (sides !== 1 && sides !== 2)) return null
  if (!(qEnv >= 0) || !(tBase > 0) || !(pv >= 0) || !(sigma > 0)) return null
  const copCarnot = i.tColdK / (i.tHotK - i.tColdK)
  let cop: number
  if (i.cop != null) {
    if (!(i.cop > 0)) return null
    cop = i.cop
  } else if (i.carnotFraction != null) {
    if (!(i.carnotFraction > 0) || i.carnotFraction > 1) return null
    cop = i.carnotFraction * copCarnot
  } else {
    return null
  }
  const carnotFraction = cop / copCarnot
  const work = i.q / cop
  const qRej = i.q + work
  const qNetBase = sides * i.emissivity * sigma * tBase ** 4 - qEnv
  const qNetHp = sides * i.emissivity * sigma * i.tHotK ** 4 - qEnv
  const aBase = qNetBase > 0 ? i.q / qNetBase : null
  const aHp = qNetHp > 0 ? qRej / qNetHp : null
  const areaSaved = aBase != null && aHp != null ? aBase - aHp : null
  const areaReduction = areaSaved != null && aBase != null ? areaSaved / aBase : null
  const extraPvArea = pv > 0 ? work / pv : null
  const netAreaSaved = areaSaved != null && extraPvArea != null ? areaSaved - extraPvArea : null
  return {
    copCarnot,
    cop,
    carnotFraction,
    work,
    qRej,
    qNetBase,
    qNetHp,
    aBase,
    aHp,
    areaSaved,
    areaReduction,
    extraPvArea,
    netAreaSaved,
    overhead: work / i.q,
  }
}

export type OdcSizingInput = {
  pIt: number
  /** α_OH: P_tot = α_OH P_IT. Default 1. */
  overhead?: number
  solarFlux?: number
  cellEff: number
  fillFactor: number
  cosTheta?: number
  /** Radiator net rejected flux, W/m² (from radiatorNetFlux). */
  qNet: number
  pvArealMass?: number
  radArealMass?: number
}

export type OdcSizing = {
  pTot: number
  pvPowerDensity: number
  aPv: number
  pvSide: number
  aRad: number
  areaRatio: number
  mPv: number | null
  mRad: number | null
  kgPerKwPv: number | null
  kgPerKwRad: number | null
  kgPerKwTotal: number | null
}

export function odcPowerThermalSizing(i: OdcSizingInput): OdcSizing | null {
  const overhead = i.overhead ?? 1
  const S = i.solarFlux ?? SOLAR_CONSTANT_1AU
  const cosTheta = i.cosTheta ?? 1
  const pvA = i.pvArealMass ?? 0
  const radA = i.radArealMass ?? 0
  if (!(i.pIt > 0) || !(overhead > 0) || !(S > 0)) return null
  if (!(i.cellEff > 0) || i.cellEff > 1 || !(i.fillFactor > 0) || i.fillFactor > 1) return null
  if (!(cosTheta > 0) || cosTheta > 1 || !(i.qNet > 0) || !(pvA >= 0) || !(radA >= 0)) return null
  const pTot = overhead * i.pIt
  const pvPowerDensity = S * i.cellEff * i.fillFactor * cosTheta
  const aPv = pTot / pvPowerDensity
  const aRad = pTot / i.qNet
  const kw = i.pIt / 1000
  const mPv = pvA > 0 ? pvA * aPv : null
  const mRad = radA > 0 ? radA * aRad : null
  const kgPerKwPv = mPv != null ? mPv / kw : null
  const kgPerKwRad = mRad != null ? mRad / kw : null
  const kgPerKwTotal =
    kgPerKwPv != null || kgPerKwRad != null ? (kgPerKwPv ?? 0) + (kgPerKwRad ?? 0) : null
  return {
    pTot,
    pvPowerDensity,
    aPv,
    pvSide: Math.sqrt(aPv),
    aRad,
    areaRatio: aRad / aPv,
    mPv,
    mRad,
    kgPerKwPv,
    kgPerKwRad,
    kgPerKwTotal,
  }
}
