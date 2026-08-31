import type { FormulaSnippet } from '../types'

/**
 * Orbital data center power and radiator sizing.
 * P_tot = a_oh P_it; q_pv = S eta fill cos; A_pv = P_tot/q_pv; L_pv = sqrt(A_pv);
 * A_rad = P_tot/q_net; ratio = A_rad/A_pv; M = sigma A; kg_kw = (M_pv + M_rad)/(P_it/1000).
 * Free vars: P_it, a_oh, S, eta_cell, fill, cos_th, q_net, sigma_pv, sigma_rad (SI).
 * Matches OdcPowerThermalSizingTool + lib/physics/radiator.ts odcPowerThermalSizing.
 */
const A = 'Linear sizing chain: array from S eta fill cos, radiator from one net flux, areal masses. SI.'

export const odcPowerThermalSizingSnippets: FormulaSnippet = {
  formulaId: 'odc-power-thermal-sizing',
  assumptions: A,
  code: {
    python: `# ODC power / radiator sizing: ${A}
import math
P_tot = a_oh * P_it
q_pv = S * eta_cell * fill * cos_th
A_pv = P_tot / q_pv
L_pv = math.sqrt(A_pv)
A_rad = P_tot / q_net
ratio = A_rad / A_pv
M_pv = sigma_pv * A_pv
M_rad = sigma_rad * A_rad
kg_kw = (M_pv + M_rad) / (P_it / 1000.0)`,

    javascript: `// ODC power / radiator sizing: ${A}
const P_tot = a_oh * P_it
const q_pv = S * eta_cell * fill * cos_th
const A_pv = P_tot / q_pv
const L_pv = Math.sqrt(A_pv)
const A_rad = P_tot / q_net
const ratio = A_rad / A_pv
const M_pv = sigma_pv * A_pv
const M_rad = sigma_rad * A_rad
const kg_kw = (M_pv + M_rad) / (P_it / 1000)`,

    typescript: `// ODC power / radiator sizing: ${A}
const P_tot: number = a_oh * P_it
const q_pv: number = S * eta_cell * fill * cos_th
const A_pv: number = P_tot / q_pv
const L_pv: number = Math.sqrt(A_pv)
const A_rad: number = P_tot / q_net
const ratio: number = A_rad / A_pv
const M_pv: number = sigma_pv * A_pv
const M_rad: number = sigma_rad * A_rad
const kg_kw: number = (M_pv + M_rad) / (P_it / 1000)`,

    c: `/* ODC power / radiator sizing: ${A} */
const double P_tot = a_oh * P_it;
const double q_pv = S * eta_cell * fill * cos_th;
const double A_pv = P_tot / q_pv;
const double L_pv = sqrt(A_pv);
const double A_rad = P_tot / q_net;
const double ratio = A_rad / A_pv;
const double M_pv = sigma_pv * A_pv;
const double M_rad = sigma_rad * A_rad;
const double kg_kw = (M_pv + M_rad) / (P_it / 1000.0);`,

    cpp: `// ODC power / radiator sizing: ${A}
const double P_tot = a_oh * P_it;
const double q_pv = S * eta_cell * fill * cos_th;
const double A_pv = P_tot / q_pv;
const double L_pv = std::sqrt(A_pv);
const double A_rad = P_tot / q_net;
const double ratio = A_rad / A_pv;
const double M_pv = sigma_pv * A_pv;
const double M_rad = sigma_rad * A_rad;
const double kg_kw = (M_pv + M_rad) / (P_it / 1000.0);`,

    rust: `// ODC power / radiator sizing: ${A}
let P_tot = a_oh * P_it;
let q_pv = S * eta_cell * fill * cos_th;
let A_pv = P_tot / q_pv;
let L_pv = A_pv.sqrt();
let A_rad = P_tot / q_net;
let ratio = A_rad / A_pv;
let M_pv = sigma_pv * A_pv;
let M_rad = sigma_rad * A_rad;
let kg_kw = (M_pv + M_rad) / (P_it / 1000.0);`,

    zig: `// ODC power / radiator sizing: ${A}
const P_tot = a_oh * P_it;
const q_pv = S * eta_cell * fill * cos_th;
const A_pv = P_tot / q_pv;
const L_pv = @sqrt(A_pv);
const A_rad = P_tot / q_net;
const ratio = A_rad / A_pv;
const M_pv = sigma_pv * A_pv;
const M_rad = sigma_rad * A_rad;
const kg_kw = (M_pv + M_rad) / (P_it / 1000.0);`,

    fortran: `! ODC power / radiator sizing: ${A}
P_tot = a_oh * P_it
q_pv = S * eta_cell * fill * cos_th
A_pv = P_tot / q_pv
L_pv = sqrt(A_pv)
A_rad = P_tot / q_net
ratio = A_rad / A_pv
M_pv = sigma_pv * A_pv
M_rad = sigma_rad * A_rad
kg_kw = (M_pv + M_rad) / (P_it / 1000.0d0)`,

    matlab: `% ODC power / radiator sizing: ${A}
P_tot = a_oh * P_it;
q_pv = S * eta_cell * fill * cos_th;
A_pv = P_tot / q_pv;
L_pv = sqrt(A_pv);
A_rad = P_tot / q_net;
ratio = A_rad / A_pv;
M_pv = sigma_pv * A_pv;
M_rad = sigma_rad * A_rad;
kg_kw = (M_pv + M_rad) / (P_it / 1000);`,

    julia: `# ODC power / radiator sizing: ${A}
P_tot = a_oh * P_it
q_pv = S * eta_cell * fill * cos_th
A_pv = P_tot / q_pv
L_pv = sqrt(A_pv)
A_rad = P_tot / q_net
ratio = A_rad / A_pv
M_pv = sigma_pv * A_pv
M_rad = sigma_rad * A_rad
kg_kw = (M_pv + M_rad) / (P_it / 1000)`,

    latex: `% ODC power / radiator sizing: pure SI
\\[
  P_{\\mathrm{tot}} = \\alpha_{OH} P_{IT},\\quad
  q_{pv} = S\\,\\eta\\,f_{\\mathrm{fill}}\\cos\\theta,\\quad
  A_{pv} = \\frac{P_{\\mathrm{tot}}}{q_{pv}},\\quad
  L_{pv} = \\sqrt{A_{pv}}
\\]
\\[
  A_{\\mathrm{rad}} = \\frac{P_{\\mathrm{tot}}}{q_{\\mathrm{net}}},\\quad
  \\frac{A_{\\mathrm{rad}}}{A_{pv}} = \\frac{q_{pv}}{q_{\\mathrm{net}}},\\quad
  \\frac{M_{pv} + M_{\\mathrm{rad}}}{P_{IT}/1000} = \\frac{\\sigma_{pv} A_{pv} + \\sigma_{\\mathrm{rad}} A_{\\mathrm{rad}}}{P_{IT}/1000}
\\]`,
  },
}
