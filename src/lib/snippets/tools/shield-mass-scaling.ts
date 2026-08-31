import type { FormulaSnippet } from '../types'

/**
 * Shield mass per kW of a box container (geometry only, no dose).
 * A_s = 2(LW + LH + WH); V = LWH; rho_A = rho t + m_extra; rho_A_gcm2 = rho_A/10;
 * m_shield = rho_A A_s; P = p_v V; kg_kw = m_shield/(P/1000).
 * Free vars: L, W, H, t, rho, m_extra, p_v (SI).
 * Matches ShieldMassScalingTool + lib/physics/shield-geometry.ts shieldMassScaling.
 */
const A = 'Box container, uniform shield thickness, areal-mass credit; no dose, no spectrum. SI.'

export const shieldMassScalingSnippets: FormulaSnippet = {
  formulaId: 'shield-mass-scaling',
  assumptions: A,
  code: {
    python: `# Shield mass scaling: ${A}
A_s = 2.0 * (L * W + L * H + W * H)
V = L * W * H
rho_A = rho * t + m_extra
rho_A_gcm2 = rho_A / 10.0
m_shield = rho_A * A_s
P = p_v * V
kg_kw = m_shield / (P / 1000.0)`,

    javascript: `// Shield mass scaling: ${A}
const A_s = 2 * (L * W + L * H + W * H)
const V = L * W * H
const rho_A = rho * t + m_extra
const rho_A_gcm2 = rho_A / 10
const m_shield = rho_A * A_s
const P = p_v * V
const kg_kw = m_shield / (P / 1000)`,

    typescript: `// Shield mass scaling: ${A}
const A_s: number = 2 * (L * W + L * H + W * H)
const V: number = L * W * H
const rho_A: number = rho * t + m_extra
const rho_A_gcm2: number = rho_A / 10
const m_shield: number = rho_A * A_s
const P: number = p_v * V
const kg_kw: number = m_shield / (P / 1000)`,

    c: `/* Shield mass scaling: ${A} */
const double A_s = 2.0 * (L * W + L * H + W * H);
const double V = L * W * H;
const double rho_A = rho * t + m_extra;
const double rho_A_gcm2 = rho_A / 10.0;
const double m_shield = rho_A * A_s;
const double P = p_v * V;
const double kg_kw = m_shield / (P / 1000.0);`,

    cpp: `// Shield mass scaling: ${A}
const double A_s = 2.0 * (L * W + L * H + W * H);
const double V = L * W * H;
const double rho_A = rho * t + m_extra;
const double rho_A_gcm2 = rho_A / 10.0;
const double m_shield = rho_A * A_s;
const double P = p_v * V;
const double kg_kw = m_shield / (P / 1000.0);`,

    rust: `// Shield mass scaling: ${A}
let A_s = 2.0 * (L * W + L * H + W * H);
let V = L * W * H;
let rho_A = rho * t + m_extra;
let rho_A_gcm2 = rho_A / 10.0;
let m_shield = rho_A * A_s;
let P = p_v * V;
let kg_kw = m_shield / (P / 1000.0);`,

    zig: `// Shield mass scaling: ${A}
const A_s = 2.0 * (L * W + L * H + W * H);
const V = L * W * H;
const rho_A = rho * t + m_extra;
const rho_A_gcm2 = rho_A / 10.0;
const m_shield = rho_A * A_s;
const P = p_v * V;
const kg_kw = m_shield / (P / 1000.0);`,

    fortran: `! Shield mass scaling: ${A}
A_s = 2.0d0 * (L * W + L * H + W * H)
V = L * W * H
rho_A = rho * t + m_extra
rho_A_gcm2 = rho_A / 10.0d0
m_shield = rho_A * A_s
P = p_v * V
kg_kw = m_shield / (P / 1000.0d0)`,

    matlab: `% Shield mass scaling: ${A}
A_s = 2 * (L * W + L * H + W * H);
V = L * W * H;
rho_A = rho * t + m_extra;
rho_A_gcm2 = rho_A / 10;
m_shield = rho_A * A_s;
P = p_v * V;
kg_kw = m_shield / (P / 1000);`,

    julia: `# Shield mass scaling: ${A}
A_s = 2 * (L * W + L * H + W * H)
V = L * W * H
rho_A = rho * t + m_extra
rho_A_gcm2 = rho_A / 10
m_shield = rho_A * A_s
P = p_v * V
kg_kw = m_shield / (P / 1000)`,

    latex: `% Shield mass scaling: pure SI
\\[
  A_{s} = 2(LW + LH + WH),\\quad
  V = LWH,\\quad
  \\rho_{A} = \\rho\\,t + m_{\\mathrm{extra}},\\quad
  m_{\\mathrm{shield}} = \\rho_{A} A_{s}
\\]
\\[
  P = p_{v} V,\\quad
  \\frac{m_{\\mathrm{shield}}}{P/1000}\\ \\mathrm{kg/kW},\\quad
  \\text{cube: } \\frac{6\\rho_{A}}{p_{v} L}
\\]`,
  },
}
