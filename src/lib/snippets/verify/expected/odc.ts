/**
 * Expected numeric results for the ODC thermal wave, sourced from shipped physics.
 * See expected/index.ts for the verification chain this module feeds.
 */
import {
  coldPlateChain,
  dawnDuskBetaJd,
  odcPowerThermalSizing,
  radiatorHeatPump,
  radiatorNetFlux,
  shieldMassScaling,
  twoPhaseLoop,
} from '@/lib/physics'
import { num, put, type ExpectedFn } from './shared'

export const ODC_EXPECTED: Record<string, ExpectedFn> = {
  'radiator-net-flux': (bag) => {
    const out: Record<string, number> = {}
    const r = radiatorNetFlux({
      tempK: num(bag, 'T'),
      emissivity: num(bag, 'eps'),
      absorptivity: num(bag, 'alpha'),
      sides: num(bag, 'n_sides') === 1 ? 1 : 2,
      solarFlux: num(bag, 'S'),
      sunExposure: num(bag, 'f_sun'),
      viewFactor: num(bag, 'F'),
      albedo: num(bag, 'albedo'),
      earthTempK: num(bag, 'Te'),
      irAbsorptivity: num(bag, 'alpha_ir'),
    })
    if (!r) return out
    put(out, ['q_emit'], r.qEmit)
    put(out, ['q_sun'], r.qSun)
    put(out, ['q_alb'], r.qAlbedo)
    put(out, ['q_ir'], r.qIr)
    put(out, ['q_net'], r.qNet)
    put(out, ['m2_per_kw'], 1000 / r.qNet)
    return out
  },

  'sso-dawn-dusk': (bag) => {
    const out: Record<string, number> = {}
    const r = dawnDuskBetaJd({
      altitudeM: num(bag, 'h'),
      ltanHours: num(bag, 'ltan_h'),
      jd: num(bag, 'jd'),
      mu: num(bag, 'mu'),
      R: num(bag, 'R'),
      j2: num(bag, 'J2'),
      omegaSun: num(bag, 'omega_sun'),
    })
    if (!r) return out
    put(out, ['i_sso'], r.inclRad)
    put(out, ['T', 't'], r.periodS)
    put(out, ['decl'], r.sunDeclRad)
    put(out, ['beta'], r.betaRad)
    put(out, ['beta_star'], r.betaStarRad)
    put(out, ['t_ecl'], r.eclipseS)
    put(out, ['f_ecl'], r.eclipseFraction)
    return out
  },

  'two-phase-loop': (bag) => {
    const out: Record<string, number> = {}
    const r = twoPhaseLoop({
      q: num(bag, 'Q'),
      hfg: num(bag, 'h_fg'),
      qualityChange: num(bag, 'dx'),
      cp: num(bag, 'cp'),
      deltaT: num(bag, 'dT'),
      rhoL: num(bag, 'rho_l'),
      pressureDrop: num(bag, 'dp'),
      pumpEff: num(bag, 'eta_p'),
    })
    if (!r) return out
    put(out, ['mdot_2ph'], r.mdotTwoPhase)
    put(out, ['mdot_1ph'], r.mdotSinglePhase)
    put(out, ['flow_ratio'], r.flowRatio)
    put(out, ['P_pump_2ph'], r.pumpPowerTwoPhase)
    put(out, ['P_pump_1ph'], r.pumpPowerSinglePhase)
    return out
  },

  'radiator-heat-pump': (bag) => {
    const out: Record<string, number> = {}
    const r = radiatorHeatPump({
      q: num(bag, 'Q'),
      tColdK: num(bag, 'T_c'),
      tHotK: num(bag, 'T_h'),
      carnotFraction: num(bag, 'eta_II'),
      emissivity: num(bag, 'eps'),
      sides: num(bag, 'n_sides') === 2 ? 2 : 1,
      qEnv: num(bag, 'q_env'),
      tBaseK: num(bag, 'T_base'),
      pvPowerDensity: num(bag, 'q_pv'),
    })
    if (!r) return out
    put(out, ['COP_c', 'cop_c'], r.copCarnot)
    put(out, ['COP', 'cop'], r.cop)
    put(out, ['W'], r.work)
    put(out, ['Q_rej'], r.qRej)
    put(out, ['q_net_base'], r.qNetBase)
    put(out, ['q_net_hp'], r.qNetHp)
    put(out, ['A_base'], r.aBase)
    put(out, ['A_hp'], r.aHp)
    put(out, ['dA_pv'], r.extraPvArea)
    put(out, ['A_saved_net'], r.netAreaSaved)
    return out
  },

  'odc-power-thermal-sizing': (bag) => {
    const out: Record<string, number> = {}
    const r = odcPowerThermalSizing({
      pIt: num(bag, 'P_it'),
      overhead: num(bag, 'a_oh'),
      solarFlux: num(bag, 'S'),
      cellEff: num(bag, 'eta_cell'),
      fillFactor: num(bag, 'fill'),
      cosTheta: num(bag, 'cos_th'),
      qNet: num(bag, 'q_net'),
      pvArealMass: num(bag, 'sigma_pv'),
      radArealMass: num(bag, 'sigma_rad'),
    })
    if (!r) return out
    put(out, ['P_tot'], r.pTot)
    put(out, ['q_pv'], r.pvPowerDensity)
    put(out, ['A_pv'], r.aPv)
    put(out, ['L_pv'], r.pvSide)
    put(out, ['A_rad'], r.aRad)
    put(out, ['ratio'], r.areaRatio)
    put(out, ['M_pv'], r.mPv)
    put(out, ['M_rad'], r.mRad)
    put(out, ['kg_kw'], r.kgPerKwTotal)
    return out
  },

  'cold-plate-dt': (bag) => {
    const out: Record<string, number> = {}
    const r = coldPlateChain({
      q: num(bag, 'Q'),
      dieArea: num(bag, 'A_die'),
      rJc: num(bag, 'R_jc'),
      timThickness: num(bag, 't_tim'),
      timK: num(bag, 'k_tim'),
      timArea: num(bag, 'A_tim'),
      hCoolant: num(bag, 'h'),
      wettedArea: num(bag, 'A_wet'),
      mdot: num(bag, 'mdot'),
      cp: num(bag, 'cp'),
      tInK: num(bag, 'T_in'),
    })
    if (!r) return out
    put(out, ['q_flux'], r.heatFluxDie)
    put(out, ['R_tim'], r.rTim)
    put(out, ['R_conv'], r.rConv)
    put(out, ['R_tot'], r.rTotal)
    put(out, ['dT_fluid'], r.dTFluid)
    put(out, ['T_case'], r.tCaseK)
    put(out, ['T_j'], r.tJunctionK)
    return out
  },

  'shield-mass-scaling': (bag) => {
    const out: Record<string, number> = {}
    const r = shieldMassScaling({
      length: num(bag, 'L'),
      width: num(bag, 'W'),
      height: num(bag, 'H'),
      thickness: num(bag, 't'),
      density: num(bag, 'rho'),
      extraArealMass: num(bag, 'm_extra'),
      powerDensity: num(bag, 'p_v'),
    })
    if (!r) return out
    put(out, ['A_s'], r.surfaceArea)
    put(out, ['V'], r.volume)
    put(out, ['rho_A'], r.arealDensity)
    put(out, ['rho_A_gcm2'], r.arealDensityGcm2)
    put(out, ['m_shield'], r.shieldMass)
    put(out, ['P'], r.power)
    put(out, ['kg_kw'], r.kgPerKw)
    return out
  },
}
