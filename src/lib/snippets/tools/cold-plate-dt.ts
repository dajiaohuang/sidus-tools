// src/lib/snippets/tools/cold-plate-dt.ts
import type { FormulaSnippet } from '../types'

/**
 * Cold-plate junction temperature from a 1-D resistance chain.
 * q_flux = Q/A_die; R_tim = t/(k A_tim); R_conv = 1/(h A_wet); R_tot = R_jc + R_tim + R_conv;
 * dT_fluid = Q/(mdot cp); T_case = T_in + dT_fluid/2 + Q (R_conv + R_tim); T_j = T_case + Q R_jc.
 * Free vars: Q, A_die, R_jc, t_tim, k_tim, A_tim, h, A_wet, mdot, cp, T_in (SI).
 * Matches ColdPlateDtTool + lib/physics/cold-plate.ts coldPlateChain.
 */
const A = 'Single-phase liquid cold plate, 1-D resistance chain, mean-fluid reference, no spreading, no boiling. SI.'

export const coldPlateDtSnippets: FormulaSnippet = {
  formulaId: 'cold-plate-dt',
  assumptions: A,
  code: {
    python: `# Cold plate junction dT: ${A}
q_flux = Q / A_die
R_tim = t_tim / (k_tim * A_tim)
R_conv = 1.0 / (h * A_wet)
R_tot = R_jc + R_tim + R_conv
dT_fluid = Q / (mdot * cp)
T_case = T_in + dT_fluid / 2.0 + Q * (R_conv + R_tim)
T_j = T_case + Q * R_jc`,

    javascript: `// Cold plate junction dT: ${A}
const q_flux = Q / A_die
const R_tim = t_tim / (k_tim * A_tim)
const R_conv = 1 / (h * A_wet)
const R_tot = R_jc + R_tim + R_conv
const dT_fluid = Q / (mdot * cp)
const T_case = T_in + dT_fluid / 2 + Q * (R_conv + R_tim)
const T_j = T_case + Q * R_jc`,

    typescript: `// Cold plate junction dT: ${A}
const q_flux: number = Q / A_die
const R_tim: number = t_tim / (k_tim * A_tim)
const R_conv: number = 1 / (h * A_wet)
const R_tot: number = R_jc + R_tim + R_conv
const dT_fluid: number = Q / (mdot * cp)
const T_case: number = T_in + dT_fluid / 2 + Q * (R_conv + R_tim)
const T_j: number = T_case + Q * R_jc`,

    c: `/* Cold plate junction dT: ${A} */
const double q_flux = Q / A_die;
const double R_tim = t_tim / (k_tim * A_tim);
const double R_conv = 1.0 / (h * A_wet);
const double R_tot = R_jc + R_tim + R_conv;
const double dT_fluid = Q / (mdot * cp);
const double T_case = T_in + dT_fluid / 2.0 + Q * (R_conv + R_tim);
const double T_j = T_case + Q * R_jc;`,

    cpp: `// Cold plate junction dT: ${A}
const double q_flux = Q / A_die;
const double R_tim = t_tim / (k_tim * A_tim);
const double R_conv = 1.0 / (h * A_wet);
const double R_tot = R_jc + R_tim + R_conv;
const double dT_fluid = Q / (mdot * cp);
const double T_case = T_in + dT_fluid / 2.0 + Q * (R_conv + R_tim);
const double T_j = T_case + Q * R_jc;`,

    rust: `// Cold plate junction dT: ${A}
let q_flux = Q / A_die;
let R_tim = t_tim / (k_tim * A_tim);
let R_conv = 1.0 / (h * A_wet);
let R_tot = R_jc + R_tim + R_conv;
let dT_fluid = Q / (mdot * cp);
let T_case = T_in + dT_fluid / 2.0 + Q * (R_conv + R_tim);
let T_j = T_case + Q * R_jc;`,

    zig: `// Cold plate junction dT: ${A}
const q_flux = Q / A_die;
const R_tim = t_tim / (k_tim * A_tim);
const R_conv = 1.0 / (h * A_wet);
const R_tot = R_jc + R_tim + R_conv;
const dT_fluid = Q / (mdot * cp);
const T_case = T_in + dT_fluid / 2.0 + Q * (R_conv + R_tim);
const T_j = T_case + Q * R_jc;`,

    fortran: `! Cold plate junction dT: ${A}
q_flux = Q / A_die
R_tim = t_tim / (k_tim * A_tim)
R_conv = 1.0d0 / (h * A_wet)
R_tot = R_jc + R_tim + R_conv
dT_fluid = Q / (mdot * cp)
T_case = T_in + dT_fluid / 2.0d0 + Q * (R_conv + R_tim)
T_j = T_case + Q * R_jc`,

    matlab: `% Cold plate junction dT: ${A}
q_flux = Q / A_die;
R_tim = t_tim / (k_tim * A_tim);
R_conv = 1 / (h * A_wet);
R_tot = R_jc + R_tim + R_conv;
dT_fluid = Q / (mdot * cp);
T_case = T_in + dT_fluid / 2 + Q * (R_conv + R_tim);
T_j = T_case + Q * R_jc;`,

    julia: `# Cold plate junction dT: ${A}
q_flux = Q / A_die
R_tim = t_tim / (k_tim * A_tim)
R_conv = 1 / (h * A_wet)
R_tot = R_jc + R_tim + R_conv
dT_fluid = Q / (mdot * cp)
T_case = T_in + dT_fluid / 2 + Q * (R_conv + R_tim)
T_j = T_case + Q * R_jc`,

    latex: `% Cold plate junction dT: pure SI
\\[
  q'' = \\frac{Q}{A_{\\mathrm{die}}},\\quad
  R_{\\mathrm{TIM}} = \\frac{t}{k A_{\\mathrm{TIM}}},\\quad
  R_{\\mathrm{conv}} = \\frac{1}{h A_{\\mathrm{wet}}},\\quad
  \\Delta T_{f} = \\frac{Q}{\\dot m c_{p}}
\\]
\\[
  T_{j} = T_{\\mathrm{in}} + \\frac{\\Delta T_{f}}{2} + Q\\left(R_{\\mathrm{conv}} + R_{\\mathrm{TIM}} + R_{jc}\\right)
\\]`,
  },
}
