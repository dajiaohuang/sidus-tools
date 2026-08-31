/**
 * Two-phase mechanically pumped loop against a single-phase loop. Pure SI.
 * mdot_2ph = Q / (dx h_fg); mdot_1ph = Q / (c_p dT); pump power = mdot dp / (rho_L eta)
 * with liquid pumped upstream of the evaporator in both cases and the same dp.
 * Fluid rows: NIST Chemistry WebBook saturation tables (20 °C rows; water also at 100 °C).
 */

export type TwoPhaseFluidId = 'ammonia' | 'water20' | 'water100' | 'co2' | 'r134a'

export type TwoPhaseFluid = {
  /** Latent heat of vaporisation [J/kg] at tRefK. */
  hfg: number
  /** Saturated liquid density [kg/m³]. */
  rhoL: number
  /** Saturated liquid specific heat [J/(kg·K)]. */
  cpL: number
  /** Saturation pressure [Pa]. */
  pSat: number
  tRefK: number
  labelKey: string
}

export const TWO_PHASE_FLUIDS: Record<TwoPhaseFluidId, TwoPhaseFluid> = {
  ammonia: { hfg: 1186.28e3, rhoL: 610.39, cpL: 4738.9, pSat: 857.04e3, tRefK: 293.15, labelKey: 'fields.tpl_fluid_ammonia' },
  water20: { hfg: 2453.49e3, rhoL: 998.16, cpL: 4184.4, pSat: 2.3393e3, tRefK: 293.15, labelKey: 'fields.tpl_fluid_water20' },
  water100: { hfg: 2256.43e3, rhoL: 958.35, cpL: 4215.7, pSat: 101.42e3, tRefK: 373.15, labelKey: 'fields.tpl_fluid_water100' },
  co2: { hfg: 152.0e3, rhoL: 773.39, cpL: 4263.7, pSat: 5729.1e3, tRefK: 293.15, labelKey: 'fields.tpl_fluid_co2' },
  r134a: { hfg: 182.28e3, rhoL: 1225.3, cpL: 1404.9, pSat: 571.71e3, tRefK: 293.15, labelKey: 'fields.tpl_fluid_r134a' },
}

export type TwoPhaseLoopInput = {
  q: number
  hfg: number
  /** Vapour quality change across the evaporator, (0, 1]. Default 1. */
  qualityChange?: number
  cp: number
  deltaT: number
  rhoL: number
  pressureDrop: number
  pumpEff: number
}

export type TwoPhaseLoop = {
  mdotTwoPhase: number
  mdotSinglePhase: number
  /** mdot_1ph / mdot_2ph = dx h_fg / (c_p dT). */
  flowRatio: number
  volFlowTwoPhase: number
  volFlowSinglePhase: number
  pumpPowerTwoPhase: number
  pumpPowerSinglePhase: number
}

export function twoPhaseLoop(i: TwoPhaseLoopInput): TwoPhaseLoop | null {
  const dx = i.qualityChange ?? 1
  if (!(i.q > 0) || !(i.hfg > 0) || !(dx > 0) || dx > 1) return null
  if (!(i.cp > 0) || !(i.deltaT > 0) || !(i.rhoL > 0) || !(i.pressureDrop >= 0)) return null
  if (!(i.pumpEff > 0) || i.pumpEff > 1) return null
  const mdotTwoPhase = i.q / (dx * i.hfg)
  const mdotSinglePhase = i.q / (i.cp * i.deltaT)
  const pump = (mdot: number) => (mdot * i.pressureDrop) / (i.rhoL * i.pumpEff)
  return {
    mdotTwoPhase,
    mdotSinglePhase,
    flowRatio: mdotSinglePhase / mdotTwoPhase,
    volFlowTwoPhase: mdotTwoPhase / i.rhoL,
    volFlowSinglePhase: mdotSinglePhase / i.rhoL,
    pumpPowerTwoPhase: pump(mdotTwoPhase),
    pumpPowerSinglePhase: pump(mdotSinglePhase),
  }
}
