import type { FormulaSnippet } from '../types'

/**
 * Radiator net heat flux in Earth orbit.
 * q_emit = n eps sigma T^4; q_sun = alpha S f_sun; q_alb = F alpha a S; q_ir = F alpha_ir sigma Te^4;
 * q_net = q_emit - q_sun - q_alb - q_ir; m2_per_kw = 1000 / q_net.
 * Free vars: T, eps, alpha, n_sides, S, f_sun, F, albedo, Te, alpha_ir (SI).
 * Matches RadiatorNetFluxTool + lib/physics/radiator.ts radiatorNetFlux.
 */
const A =
  'Gray flat plate, lumped Earth view factor F; IR absorptivity alpha_ir (= eps by Kirchhoff). SI, W/m².'

export const radiatorNetFluxSnippets: FormulaSnippet = {
  formulaId: 'radiator-net-flux',
  assumptions: A,
  code: {
    python: `# Radiator net flux: ${A}
sigma = 5.670374419e-8
q_emit = n_sides * eps * sigma * T**4
q_sun = alpha * S * f_sun
q_alb = F * alpha * albedo * S
q_ir = F * alpha_ir * sigma * Te**4
q_net = q_emit - q_sun - q_alb - q_ir
m2_per_kw = 1000.0 / q_net`,

    javascript: `// Radiator net flux: ${A}
const sigma = 5.670374419e-8
const q_emit = n_sides * eps * sigma * T ** 4
const q_sun = alpha * S * f_sun
const q_alb = F * alpha * albedo * S
const q_ir = F * alpha_ir * sigma * Te ** 4
const q_net = q_emit - q_sun - q_alb - q_ir
const m2_per_kw = 1000 / q_net`,

    typescript: `// Radiator net flux: ${A}
const sigma: number = 5.670374419e-8
const q_emit: number = n_sides * eps * sigma * T ** 4
const q_sun: number = alpha * S * f_sun
const q_alb: number = F * alpha * albedo * S
const q_ir: number = F * alpha_ir * sigma * Te ** 4
const q_net: number = q_emit - q_sun - q_alb - q_ir
const m2_per_kw: number = 1000 / q_net`,

    c: `/* Radiator net flux: ${A} */
const double sigma = 5.670374419e-8;
const double q_emit = n_sides * eps * sigma * pow(T, 4.0);
const double q_sun = alpha * S * f_sun;
const double q_alb = F * alpha * albedo * S;
const double q_ir = F * alpha_ir * sigma * pow(Te, 4.0);
const double q_net = q_emit - q_sun - q_alb - q_ir;
const double m2_per_kw = 1000.0 / q_net;`,

    cpp: `// Radiator net flux: ${A}
const double sigma = 5.670374419e-8;
const double q_emit = n_sides * eps * sigma * std::pow(T, 4.0);
const double q_sun = alpha * S * f_sun;
const double q_alb = F * alpha * albedo * S;
const double q_ir = F * alpha_ir * sigma * std::pow(Te, 4.0);
const double q_net = q_emit - q_sun - q_alb - q_ir;
const double m2_per_kw = 1000.0 / q_net;`,

    rust: `// Radiator net flux: ${A}
let sigma = 5.670374419e-8_f64;
let q_emit = n_sides * eps * sigma * T.powi(4);
let q_sun = alpha * S * f_sun;
let q_alb = F * alpha * albedo * S;
let q_ir = F * alpha_ir * sigma * Te.powi(4);
let q_net = q_emit - q_sun - q_alb - q_ir;
let m2_per_kw = 1000.0 / q_net;`,

    zig: `// Radiator net flux: ${A}
const sigma = 5.670374419e-8;
const q_emit = n_sides * eps * sigma * std.math.pow(f64, T, 4.0);
const q_sun = alpha * S * f_sun;
const q_alb = F * alpha * albedo * S;
const q_ir = F * alpha_ir * sigma * std.math.pow(f64, Te, 4.0);
const q_net = q_emit - q_sun - q_alb - q_ir;
const m2_per_kw = 1000.0 / q_net;`,

    fortran: `! Radiator net flux: ${A}
sigma = 5.670374419d-8
q_emit = n_sides * eps * sigma * T**4
q_sun = alpha * S * f_sun
q_alb = F * alpha * albedo * S
q_ir = F * alpha_ir * sigma * Te**4
q_net = q_emit - q_sun - q_alb - q_ir
m2_per_kw = 1000.0d0 / q_net`,

    matlab: `% Radiator net flux: ${A}
sigma = 5.670374419e-8;
q_emit = n_sides * eps * sigma * T^4;
q_sun = alpha * S * f_sun;
q_alb = F * alpha * albedo * S;
q_ir = F * alpha_ir * sigma * Te^4;
q_net = q_emit - q_sun - q_alb - q_ir;
m2_per_kw = 1000 / q_net;`,

    julia: `# Radiator net flux: ${A}
sigma = 5.670374419e-8
q_emit = n_sides * eps * sigma * T^4
q_sun = alpha * S * f_sun
q_alb = F * alpha * albedo * S
q_ir = F * alpha_ir * sigma * Te^4
q_net = q_emit - q_sun - q_alb - q_ir
m2_per_kw = 1000 / q_net`,

    latex: `% Radiator net flux: pure SI
\\[
  q_{\\mathrm{emit}} = n\\,\\varepsilon\\,\\sigma T^{4},\\quad
  q_{\\odot} = \\alpha S f_{\\odot},\\quad
  q_{\\mathrm{alb}} = F\\,\\alpha\\,a\\,S,\\quad
  q_{\\mathrm{IR}} = F\\,\\alpha_{\\mathrm{IR}}\\,\\sigma T_{e}^{4}
\\]
\\[
  q_{\\mathrm{net}} = q_{\\mathrm{emit}} - q_{\\odot} - q_{\\mathrm{alb}} - q_{\\mathrm{IR}},\\quad
  \\frac{A}{P} = \\frac{1000}{q_{\\mathrm{net}}}\\ \\mathrm{m^{2}/kW}
\\]`,
  },
}
