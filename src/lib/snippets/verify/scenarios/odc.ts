/**
 * Verification scenarios for the ODC thermal wave (radiator, dawn-dusk SSO,
 * two-phase loop, heat pump, sizing, cold plate, shield geometry).
 * Anchors: Starcloud 2024 white paper, Turyshev 2026, ICES-2015-35, NIST WebBook, NASA RP-1121. See scenarios/index.ts for the merge.
 */
import type { Scenario } from '../inputs'

export const ODC_SCENARIOS: Record<string, Scenario[]> = {
  'radiator-net-flux': [
    {
      name: 'starcloud-2024-convention',
      source: 'Starcloud 2024 white paper worked example with alpha applied to Earth IR (633.08 W/m2 with sigma 5.67e-8)',
      bag: { T: 293.15, eps: 0.92, alpha: 0.09, n_sides: 2, S: 1366, f_sun: 1, F: 0.25, albedo: 0.3, Te: 253.15, alpha_ir: 0.09 },
    },
    {
      name: 'kirchhoff-repo-defaults',
      source: 'same plate with epsilon on Earth IR (Kirchhoff), S 1361, Te 255 K',
      bag: { T: 293.15, eps: 0.92, alpha: 0.09, n_sides: 2, S: 1361, f_sun: 1, F: 0.25, albedo: 0.3, Te: 255, alpha_ir: 0.92 },
    },
    {
      name: 'synthetic',
      source: 'adversarial synthetic: one-sided plate, partial sun, non-round loads (q_net stays positive)',
      bag: { T: 301.7, eps: 0.87, alpha: 0.13, n_sides: 1, S: 1361, f_sun: 0.37, F: 0.41, albedo: 0.28, Te: 257.3, alpha_ir: 0.87 },
    },
  ],

  'sso-dawn-dusk': [
    {
      name: 'ltan18-500km-june-solstice',
      source: '500 km dusk-dawn SSO on 2026-06-21 00:00 UTC (JD 2461212.5): beta 59.16 deg, 22.65 min eclipse',
      bag: { h: 500_000, ltan_h: 18, jd: 2461212.5, mu: 3.986004418e14, R: 6_378_137, J2: 1.08262668e-3, omega_sun: 1.9910638518083137e-7 },
    },
    {
      name: 'ltan06-550km-december-solstice',
      source: '550 km dawn-dusk SSO on 2026-12-21 00:00 UTC (JD 2461395.5): beta -58.97 deg with eclipse',
      bag: { h: 550_000, ltan_h: 6, jd: 2461395.5, mu: 3.986004418e14, R: 6_378_137, J2: 1.08262668e-3, omega_sun: 1.9910638518083137e-7 },
    },
    {
      name: 'synthetic',
      source: 'adversarial synthetic: 612.3 km, LTAN 18.4 h, JD 2461230.75 (2026-07-09), beta about 59.5 deg, eclipse well inside beta*',
      bag: { h: 612_300, ltan_h: 18.4, jd: 2461230.75, mu: 3.986004418e14, R: 6_378_137, J2: 1.08262668e-3, omega_sun: 1.9910638518083137e-7 },
    },
  ],

  'two-phase-loop': [
    {
      name: 'ammonia-1mw',
      source: 'NIST ammonia at 20 C (h_fg 1186.28 kJ/kg), 1 MW, full evaporation vs 10 K single-phase',
      bag: { Q: 1e6, h_fg: 1186.28e3, dx: 1, cp: 4738.9, dT: 10, rho_l: 610.39, dp: 1e5, eta_p: 0.5 },
    },
    {
      name: 'water-100c-100kw',
      source: 'NIST water at 100 C (h_fg 2256.43 kJ/kg), 100 kW, quality change 0.5',
      bag: { Q: 1e5, h_fg: 2256.43e3, dx: 0.5, cp: 4215.7, dT: 10, rho_l: 958.35, dp: 5e4, eta_p: 0.6 },
    },
    {
      name: 'synthetic',
      source: 'adversarial synthetic: distinct non-round loads and properties',
      bag: { Q: 43_217, h_fg: 1.5127e5, dx: 0.63, cp: 2311, dT: 7.3, rho_l: 812.4, dp: 6.4e4, eta_p: 0.43 },
    },
  ],

  'radiator-heat-pump': [
    {
      name: 'ices-2015-35',
      source: 'NLR/ESA demonstrator: 45 -> 100 C, 5 kW, measured COP 2.3 (eta_II 0.3976 of Carnot 5.7845)',
      bag: { Q: 5000, T_c: 318.15, T_h: 373.15, eta_II: 0.39761118969, eps: 0.85, n_sides: 1, q_env: 150, T_base: 318.15, q_pv: 270.468 },
    },
    {
      name: 'cop-1.85-10kw',
      source: '10 kW at COP 1.85 (300 -> 375 K, eta_II 0.4625): rejected 15.405 kW',
      bag: { Q: 10_000, T_c: 300, T_h: 375, eta_II: 0.4625, eps: 0.85, n_sides: 1, q_env: 0, T_base: 300, q_pv: 270.468 },
    },
    {
      name: 'synthetic',
      source: 'adversarial synthetic: two-sided radiator, non-round temperatures and loads',
      bag: { Q: 7431, T_c: 305.2, T_h: 351.7, eta_II: 0.37, eps: 0.88, n_sides: 2, q_env: 120, T_base: 298.4, q_pv: 250.1 },
    },
  ],

  'odc-power-thermal-sizing': [
    {
      name: 'starcloud-5gw',
      source: 'Starcloud 2024: 5 GW, S 1366, eta 0.22, fill 0.9 -> 4.30 km side; q_net 633.08 -> A_rad/A_pv 0.427',
      bag: { P_it: 5e9, a_oh: 1, S: 1366, eta_cell: 0.22, fill: 0.9, cos_th: 1, q_net: 633.078565, sigma_pv: 1, sigma_rad: 5 },
    },
    {
      name: 'turyshev-1mw',
      source: 'Turyshev 2026 base case: alpha_OH 1.25, q_net 500.95 W/m2, sigma_rad 5 kg/m2 -> A_rad 2495 m2, 12.5 kg/kW',
      bag: { P_it: 1e6, a_oh: 1.25, S: 1361, eta_cell: 0.22, fill: 0.9, cos_th: 1, q_net: 500.9465793571585, sigma_pv: 3, sigma_rad: 5 },
    },
    {
      name: 'synthetic',
      source: 'adversarial synthetic: non-round efficiencies, tilt and masses',
      bag: { P_it: 3.7e7, a_oh: 1.13, S: 1361, eta_cell: 0.287, fill: 0.83, cos_th: 0.91, q_net: 412.6, sigma_pv: 1.7, sigma_rad: 4.2 },
    },
  ],

  'cold-plate-dt': [
    {
      name: 'h100-sxm-700w',
      source: 'NVIDIA H100 SXM 700 W on the 814 mm2 GH100 die; illustrative R_jc 0.05 K/W, 50 um TIM k 5, h 30 kW/m2K, 0.05 kg/s water at 20 C',
      bag: { Q: 700, A_die: 814e-6, R_jc: 0.05, t_tim: 50e-6, k_tim: 5, A_tim: 814e-6, h: 3e4, A_wet: 814e-6, mdot: 0.05, cp: 4184, T_in: 293.15 },
    },
    {
      name: 'pcie-class-350w',
      source: '350 W PCIe-class card on a 600 mm2 die, thicker TIM, lower h, propylene-glycol-water c_p 3500',
      bag: { Q: 350, A_die: 600e-6, R_jc: 0.08, t_tim: 80e-6, k_tim: 3.5, A_tim: 600e-6, h: 2e4, A_wet: 600e-6, mdot: 0.03, cp: 3500, T_in: 298.15 },
    },
    {
      name: 'synthetic',
      source: 'adversarial synthetic: wetted area larger than the die, non-round everything',
      bag: { Q: 913.7, A_die: 731e-6, R_jc: 0.037, t_tim: 63e-6, k_tim: 4.2, A_tim: 791e-6, h: 2.63e4, A_wet: 1.437e-3, mdot: 0.041, cp: 3921, T_in: 291.4 },
    },
  ],

  'shield-mass-scaling': [
    {
      name: 'cube-2m-2mm-al',
      source: '2 m cube, 2 mm aluminium (5.4 kg/m2), 50 kW/m3 -> 0.324 kg/kW',
      bag: { L: 2, W: 2, H: 2, t: 2e-3, rho: 2700, m_extra: 0, p_v: 5e4 },
    },
    {
      name: 'iso-40ft-box',
      source: '12.2 x 2.44 x 2.6 m box (135.664 m2), 2 mm aluminium plus 1.6 kg/m2 cold-block credit',
      bag: { L: 12.2, W: 2.44, H: 2.6, t: 2e-3, rho: 2700, m_extra: 1.6, p_v: 5e4 },
    },
    {
      name: 'synthetic',
      source: 'adversarial synthetic: non-cubic box, non-round thickness and density',
      bag: { L: 3.7, W: 1.9, H: 2.35, t: 3.3e-3, rho: 2810, m_extra: 0.7, p_v: 6.13e4 },
    },
  ],
}
