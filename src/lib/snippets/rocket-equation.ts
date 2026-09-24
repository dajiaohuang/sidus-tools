import type { FormulaSnippet } from './types'

const ASSUMPTIONS =
  'Ideal Tsiolkovsky rocket: constant ve (or isp·g0), no gravity/drag losses; solve for delta-v from masses or initial mass from target delta-v; SI units.'

export const rocketSnippets: FormulaSnippet = {
  formulaId: 'rocket-equation',
  assumptions: ASSUMPTIONS,
  code: {
    python: `# Rocket equation: ${ASSUMPTIONS}
import math
g0 = 9.80665
ve = isp * g0
if solve_for_m0 >= 0.5:
    dv_result = dv_target
    m0_result = mf * math.exp(dv_target / ve)
else:
    dv_result = ve * math.log(m0 / mf)
    m0_result = m0
propellant_result = m0_result - mf
mass_ratio = m0_result / mf`,

    javascript: `// Rocket equation: ${ASSUMPTIONS}
const g0 = 9.80665
const ve = isp * g0
const dv_result = solve_for_m0 >= 0.5 ? dv_target : ve * Math.log(m0 / mf)
const m0_result = solve_for_m0 >= 0.5 ? mf * Math.exp(dv_target / ve) : m0
const propellant_result = m0_result - mf
const mass_ratio = m0_result / mf`,

    typescript: `// Rocket equation: ${ASSUMPTIONS}
const g0: number = 9.80665
const ve: number = isp * g0
const dv_result: number = solve_for_m0 >= 0.5 ? dv_target : ve * Math.log(m0 / mf)
const m0_result: number = solve_for_m0 >= 0.5 ? mf * Math.exp(dv_target / ve) : m0
const propellant_result: number = m0_result - mf
const mass_ratio: number = m0_result / mf`,

    c: `/* Rocket equation: ${ASSUMPTIONS} */
const double g0 = 9.80665;
const double ve = isp * g0;
const double dv_result = solve_for_m0 >= 0.5 ? dv_target : ve * log(m0 / mf);
const double m0_result = solve_for_m0 >= 0.5 ? mf * exp(dv_target / ve) : m0;
const double propellant_result = m0_result - mf;
const double mass_ratio = m0_result / mf;`,

    cpp: `// Rocket equation: ${ASSUMPTIONS}
const double g0 = 9.80665;
const double ve = isp * g0;
const double dv_result = solve_for_m0 >= 0.5 ? dv_target : ve * std::log(m0 / mf);
const double m0_result = solve_for_m0 >= 0.5 ? mf * std::exp(dv_target / ve) : m0;
const double propellant_result = m0_result - mf;
const double mass_ratio = m0_result / mf;`,

    rust: `// Rocket equation: ${ASSUMPTIONS}
let g0 = 9.80665_f64;
let ve = isp * g0;
let dv_result = if solve_for_m0 >= 0.5 { dv_target } else { ve * (m0 / mf).ln() };
let m0_result = if solve_for_m0 >= 0.5 { mf * (dv_target / ve).exp() } else { m0 };
let propellant_result = m0_result - mf;
let mass_ratio = m0_result / mf;`,

    zig: `// Rocket equation: ${ASSUMPTIONS}
const g0: f64 = 9.80665;
const ve = isp * g0;
const dv_result = if (solve_for_m0 >= 0.5) dv_target else ve * @log(m0 / mf);
const m0_result = if (solve_for_m0 >= 0.5) mf * @exp(dv_target / ve) else m0;
const propellant_result = m0_result - mf;
const mass_ratio = m0_result / mf;`,

    fortran: `! Rocket equation: ${ASSUMPTIONS}
g0 = 9.80665d0
ve = isp * g0
if (solve_for_m0 >= 0.5d0) then
    dv_result = dv_target
    m0_result = mf * exp(dv_target / ve)
else
    dv_result = ve * log(m0 / mf)
    m0_result = m0
end if
propellant_result = m0_result - mf
mass_ratio = m0_result / mf`,

    matlab: `% Rocket equation: ${ASSUMPTIONS}
g0 = 9.80665;
ve = isp * g0;
if solve_for_m0 >= 0.5
  dv_result = dv_target;
  m0_result = mf * exp(dv_target / ve);
else
  dv_result = ve * log(m0 / mf);
  m0_result = m0;
end
propellant_result = m0_result - mf;
mass_ratio = m0_result / mf;`,

    julia: `# Rocket equation: ${ASSUMPTIONS}
g0 = 9.80665
ve = isp * g0
if solve_for_m0 >= 0.5
    dv_result = dv_target
    m0_result = mf * exp(dv_target / ve)
else
    dv_result = ve * log(m0 / mf)
    m0_result = m0
end
propellant_result = m0_result - mf
mass_ratio = m0_result / mf`,

    latex: `% Tsiolkovsky
\\[
\\Delta v = I_{sp} g_0 \\ln\\frac{m_0}{m_f} = v_e \\ln\\frac{m_0}{m_f}, \\qquad
m_0 = m_f \\exp\\left(\\frac{\\Delta v}{I_{sp} g_0}\\right) = m_f \\exp\\left(\\frac{\\Delta v}{v_e}\\right)
\\]`,
  },
}
