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
    propellant_result = mf * math.expm1(dv_target / ve)
else:
    dv_result = ve * math.log(m0 / mf)
    m0_result = m0
    propellant_result = m0 - mf
mass_ratio = m0_result / mf`,

    javascript: `// Rocket equation: ${ASSUMPTIONS}
const g0 = 9.80665
const ve = isp * g0
const exponent = dv_target / ve
const dv_result = solve_for_m0 >= 0.5 ? dv_target : ve * Math.log(m0 / mf)
const m0_result = solve_for_m0 >= 0.5 ? mf * Math.exp(exponent) : m0
const propellant_result = solve_for_m0 >= 0.5 ? mf * Math.expm1(exponent) : m0 - mf
const mass_ratio = m0_result / mf`,

    typescript: `// Rocket equation: ${ASSUMPTIONS}
const g0: number = 9.80665
const ve: number = isp * g0
const exponent: number = dv_target / ve
const dv_result: number = solve_for_m0 >= 0.5 ? dv_target : ve * Math.log(m0 / mf)
const m0_result: number = solve_for_m0 >= 0.5 ? mf * Math.exp(exponent) : m0
const propellant_result: number = solve_for_m0 >= 0.5 ? mf * Math.expm1(exponent) : m0 - mf
const mass_ratio: number = m0_result / mf`,

    c: `/* Rocket equation: ${ASSUMPTIONS} */
const double g0 = 9.80665;
const double ve = isp * g0;
const double exponent = dv_target / ve;
const double dv_result = solve_for_m0 >= 0.5 ? dv_target : ve * log(m0 / mf);
const double m0_result = solve_for_m0 >= 0.5 ? mf * exp(exponent) : m0;
const double propellant_result = solve_for_m0 >= 0.5 ? mf * expm1(exponent) : m0 - mf;
const double mass_ratio = m0_result / mf;`,

    cpp: `// Rocket equation: ${ASSUMPTIONS}
const double g0 = 9.80665;
const double ve = isp * g0;
const double exponent = dv_target / ve;
const double dv_result = solve_for_m0 >= 0.5 ? dv_target : ve * std::log(m0 / mf);
const double m0_result = solve_for_m0 >= 0.5 ? mf * std::exp(exponent) : m0;
const double propellant_result = solve_for_m0 >= 0.5 ? mf * std::expm1(exponent) : m0 - mf;
const double mass_ratio = m0_result / mf;`,

    rust: `// Rocket equation: ${ASSUMPTIONS}
let g0 = 9.80665_f64;
let ve = isp * g0;
let exponent = dv_target / ve;
let dv_result = if solve_for_m0 >= 0.5 { dv_target } else { ve * (m0 / mf).ln() };
let m0_result = if solve_for_m0 >= 0.5 { mf * exponent.exp() } else { m0 };
let propellant_result = if solve_for_m0 >= 0.5 { mf * exponent.exp_m1() } else { m0 - mf };
let mass_ratio = m0_result / mf;`,

    zig: `// Rocket equation: ${ASSUMPTIONS}
const g0: f64 = 9.80665;
const ve = isp * g0;
const exponent = dv_target / ve;
const dv_result = if (solve_for_m0 >= 0.5) dv_target else ve * @log(m0 / mf);
const m0_result = if (solve_for_m0 >= 0.5) mf * @exp(exponent) else m0;
// Use a Taylor branch near zero to avoid cancellation in exp(x) - 1.
const propellant_result = if (solve_for_m0 >= 0.5)
    mf * (if (exponent < 1e-3) exponent * (1.0 + exponent * (0.5 + exponent * (1.0 / 6.0 + exponent * (1.0 / 24.0 + exponent / 120.0)))) else @exp(exponent) - 1.0)
else m0 - mf;
const mass_ratio = m0_result / mf;`,

    fortran: `! Rocket equation: ${ASSUMPTIONS}
g0 = 9.80665d0
ve = isp * g0
exponent = dv_target / ve
if (solve_for_m0 >= 0.5d0) then
    dv_result = dv_target
    m0_result = mf * exp(exponent)
    if (exponent < 1.0d-3) then
        propellant_result = mf * exponent * (1.0d0 + exponent * (0.5d0 + exponent * (1.0d0 / 6.0d0 + exponent * (1.0d0 / 24.0d0 + exponent / 120.0d0))))
    else
        propellant_result = mf * (exp(exponent) - 1.0d0)
    end if
else
    dv_result = ve * log(m0 / mf)
    m0_result = m0
    propellant_result = m0 - mf
end if
mass_ratio = m0_result / mf`,

    matlab: `% Rocket equation: ${ASSUMPTIONS}
g0 = 9.80665;
ve = isp * g0;
exponent = dv_target / ve;
if solve_for_m0 >= 0.5
  dv_result = dv_target;
  m0_result = mf * exp(exponent);
  if exponent < 1e-3
    propellant_result = mf * exponent * (1 + exponent * (0.5 + exponent * (1/6 + exponent * (1/24 + exponent/120))));
  else
    propellant_result = mf * (exp(exponent) - 1);
  end
else
  dv_result = ve * log(m0 / mf);
  m0_result = m0;
  propellant_result = m0 - mf;
end
mass_ratio = m0_result / mf;`,

    julia: `# Rocket equation: ${ASSUMPTIONS}
g0 = 9.80665
ve = isp * g0
exponent = dv_target / ve
if solve_for_m0 >= 0.5
    dv_result = dv_target
    m0_result = mf * exp(exponent)
    if exponent < 1e-3
        propellant_result = mf * exponent * (1 + exponent * (0.5 + exponent * (1/6 + exponent * (1/24 + exponent/120))))
    else
        propellant_result = mf * (exp(exponent) - 1)
    end
else
    dv_result = ve * log(m0 / mf)
    m0_result = m0
    propellant_result = m0 - mf
end
mass_ratio = m0_result / mf`,

    latex: `% Tsiolkovsky
\\[
\\Delta v = I_{sp} g_0 \\ln\\frac{m_0}{m_f} = v_e \\ln\\frac{m_0}{m_f}, \\qquad
m_0 = m_f \\exp\\left(\\frac{\\Delta v}{I_{sp} g_0}\\right) = m_f \\exp\\left(\\frac{\\Delta v}{v_e}\\right), \\qquad
m_{prop} = m_f \\operatorname{expm1}\\left(\\frac{\\Delta v}{v_e}\\right)
\\]`,
  },
}
