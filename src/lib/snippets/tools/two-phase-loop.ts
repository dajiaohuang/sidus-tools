import type { FormulaSnippet } from '../types'

/**
 * Two-phase pumped loop vs single-phase loop.
 * mdot_2ph = Q/(dx h_fg); mdot_1ph = Q/(cp dT); flow_ratio = mdot_1ph/mdot_2ph;
 * P_pump = mdot dp/(rho_l eta_p) with liquid pumped upstream of the evaporator.
 * Free vars: Q, h_fg, dx, cp, dT, rho_l, dp, eta_p (SI).
 * Matches TwoPhaseLoopTool + lib/physics/two-phase.ts twoPhaseLoop.
 */
const A = 'Latent heat vs sensible heat mass flow; same loop dp; liquid-only pump. SI.'

export const twoPhaseLoopSnippets: FormulaSnippet = {
  formulaId: 'two-phase-loop',
  assumptions: A,
  code: {
    python: `# Two-phase pumped loop: ${A}
mdot_2ph = Q / (dx * h_fg)
mdot_1ph = Q / (cp * dT)
flow_ratio = mdot_1ph / mdot_2ph
P_pump_2ph = mdot_2ph * dp / (rho_l * eta_p)
P_pump_1ph = mdot_1ph * dp / (rho_l * eta_p)`,

    javascript: `// Two-phase pumped loop: ${A}
const mdot_2ph = Q / (dx * h_fg)
const mdot_1ph = Q / (cp * dT)
const flow_ratio = mdot_1ph / mdot_2ph
const P_pump_2ph = mdot_2ph * dp / (rho_l * eta_p)
const P_pump_1ph = mdot_1ph * dp / (rho_l * eta_p)`,

    typescript: `// Two-phase pumped loop: ${A}
const mdot_2ph: number = Q / (dx * h_fg)
const mdot_1ph: number = Q / (cp * dT)
const flow_ratio: number = mdot_1ph / mdot_2ph
const P_pump_2ph: number = mdot_2ph * dp / (rho_l * eta_p)
const P_pump_1ph: number = mdot_1ph * dp / (rho_l * eta_p)`,

    c: `/* Two-phase pumped loop: ${A} */
const double mdot_2ph = Q / (dx * h_fg);
const double mdot_1ph = Q / (cp * dT);
const double flow_ratio = mdot_1ph / mdot_2ph;
const double P_pump_2ph = mdot_2ph * dp / (rho_l * eta_p);
const double P_pump_1ph = mdot_1ph * dp / (rho_l * eta_p);`,

    cpp: `// Two-phase pumped loop: ${A}
const double mdot_2ph = Q / (dx * h_fg);
const double mdot_1ph = Q / (cp * dT);
const double flow_ratio = mdot_1ph / mdot_2ph;
const double P_pump_2ph = mdot_2ph * dp / (rho_l * eta_p);
const double P_pump_1ph = mdot_1ph * dp / (rho_l * eta_p);`,

    rust: `// Two-phase pumped loop: ${A}
let mdot_2ph = Q / (dx * h_fg);
let mdot_1ph = Q / (cp * dT);
let flow_ratio = mdot_1ph / mdot_2ph;
let P_pump_2ph = mdot_2ph * dp / (rho_l * eta_p);
let P_pump_1ph = mdot_1ph * dp / (rho_l * eta_p);`,

    zig: `// Two-phase pumped loop: ${A}
const mdot_2ph = Q / (dx * h_fg);
const mdot_1ph = Q / (cp * dT);
const flow_ratio = mdot_1ph / mdot_2ph;
const P_pump_2ph = mdot_2ph * dp / (rho_l * eta_p);
const P_pump_1ph = mdot_1ph * dp / (rho_l * eta_p);`,

    fortran: `! Two-phase pumped loop: ${A}
mdot_2ph = Q / (dx * h_fg)
mdot_1ph = Q / (cp * dT)
flow_ratio = mdot_1ph / mdot_2ph
P_pump_2ph = mdot_2ph * dp / (rho_l * eta_p)
P_pump_1ph = mdot_1ph * dp / (rho_l * eta_p)`,

    matlab: `% Two-phase pumped loop: ${A}
mdot_2ph = Q / (dx * h_fg);
mdot_1ph = Q / (cp * dT);
flow_ratio = mdot_1ph / mdot_2ph;
P_pump_2ph = mdot_2ph * dp / (rho_l * eta_p);
P_pump_1ph = mdot_1ph * dp / (rho_l * eta_p);`,

    julia: `# Two-phase pumped loop: ${A}
mdot_2ph = Q / (dx * h_fg)
mdot_1ph = Q / (cp * dT)
flow_ratio = mdot_1ph / mdot_2ph
P_pump_2ph = mdot_2ph * dp / (rho_l * eta_p)
P_pump_1ph = mdot_1ph * dp / (rho_l * eta_p)`,

    latex: `% Two-phase pumped loop: pure SI
\\[
  \\dot m_{2\\phi} = \\frac{Q}{\\Delta x\\,h_{fg}},\\quad
  \\dot m_{1\\phi} = \\frac{Q}{c_{p}\\,\\Delta T},\\quad
  \\frac{\\dot m_{1\\phi}}{\\dot m_{2\\phi}} = \\frac{\\Delta x\\,h_{fg}}{c_{p}\\,\\Delta T}
\\]
\\[
  P_{\\mathrm{pump}} = \\frac{\\dot m\\,\\Delta p}{\\rho_{L}\\,\\eta_{p}}
\\]`,
  },
}
