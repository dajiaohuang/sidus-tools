import type { FormulaSnippet } from '../types'

/**
 * Heat pump raising radiator temperature.
 * COP_c = T_c/(T_h - T_c); COP = eta_II COP_c; W = Q/COP; Q_rej = Q + W;
 * q_net(T) = n eps sigma T^4 - q_env; A_base = Q/q_net(T_base); A_hp = Q_rej/q_net(T_h);
 * dA_pv = W/q_pv; A_saved_net = A_base - A_hp - dA_pv.
 * Free vars: Q, T_c, T_h, eta_II, eps, n_sides, q_env, T_base, q_pv (SI).
 * Matches RadiatorHeatPumpTool + lib/physics/radiator.ts radiatorHeatPump.
 */
const A = 'Ideal cycle bookkeeping, one radiator temperature, lumped absorbed environment q_env. SI.'

export const radiatorHeatPumpSnippets: FormulaSnippet = {
  formulaId: 'radiator-heat-pump',
  assumptions: A,
  code: {
    python: `# Radiator heat pump trade: ${A}
sigma = 5.670374419e-8
COP_c = T_c / (T_h - T_c)
COP = eta_II * COP_c
W = Q / COP
Q_rej = Q + W
q_net_base = n_sides * eps * sigma * T_base**4 - q_env
q_net_hp = n_sides * eps * sigma * T_h**4 - q_env
A_base = Q / q_net_base
A_hp = Q_rej / q_net_hp
dA_pv = W / q_pv
A_saved_net = A_base - A_hp - dA_pv`,

    javascript: `// Radiator heat pump trade: ${A}
const sigma = 5.670374419e-8
const COP_c = T_c / (T_h - T_c)
const COP = eta_II * COP_c
const W = Q / COP
const Q_rej = Q + W
const q_net_base = n_sides * eps * sigma * T_base ** 4 - q_env
const q_net_hp = n_sides * eps * sigma * T_h ** 4 - q_env
const A_base = Q / q_net_base
const A_hp = Q_rej / q_net_hp
const dA_pv = W / q_pv
const A_saved_net = A_base - A_hp - dA_pv`,

    typescript: `// Radiator heat pump trade: ${A}
const sigma: number = 5.670374419e-8
const COP_c: number = T_c / (T_h - T_c)
const COP: number = eta_II * COP_c
const W: number = Q / COP
const Q_rej: number = Q + W
const q_net_base: number = n_sides * eps * sigma * T_base ** 4 - q_env
const q_net_hp: number = n_sides * eps * sigma * T_h ** 4 - q_env
const A_base: number = Q / q_net_base
const A_hp: number = Q_rej / q_net_hp
const dA_pv: number = W / q_pv
const A_saved_net: number = A_base - A_hp - dA_pv`,

    c: `/* Radiator heat pump trade: ${A} */
const double sigma = 5.670374419e-8;
const double COP_c = T_c / (T_h - T_c);
const double COP = eta_II * COP_c;
const double W = Q / COP;
const double Q_rej = Q + W;
const double q_net_base = n_sides * eps * sigma * pow(T_base, 4.0) - q_env;
const double q_net_hp = n_sides * eps * sigma * pow(T_h, 4.0) - q_env;
const double A_base = Q / q_net_base;
const double A_hp = Q_rej / q_net_hp;
const double dA_pv = W / q_pv;
const double A_saved_net = A_base - A_hp - dA_pv;`,

    cpp: `// Radiator heat pump trade: ${A}
const double sigma = 5.670374419e-8;
const double COP_c = T_c / (T_h - T_c);
const double COP = eta_II * COP_c;
const double W = Q / COP;
const double Q_rej = Q + W;
const double q_net_base = n_sides * eps * sigma * std::pow(T_base, 4.0) - q_env;
const double q_net_hp = n_sides * eps * sigma * std::pow(T_h, 4.0) - q_env;
const double A_base = Q / q_net_base;
const double A_hp = Q_rej / q_net_hp;
const double dA_pv = W / q_pv;
const double A_saved_net = A_base - A_hp - dA_pv;`,

    rust: `// Radiator heat pump trade: ${A}
let sigma = 5.670374419e-8_f64;
let cop_c = T_c / (T_h - T_c);
let cop = eta_II * cop_c;
let W = Q / cop;
let Q_rej = Q + W;
let q_net_base = n_sides * eps * sigma * T_base.powi(4) - q_env;
let q_net_hp = n_sides * eps * sigma * T_h.powi(4) - q_env;
let A_base = Q / q_net_base;
let A_hp = Q_rej / q_net_hp;
let dA_pv = W / q_pv;
let A_saved_net = A_base - A_hp - dA_pv;`,

    zig: `// Radiator heat pump trade: ${A}
const sigma = 5.670374419e-8;
const COP_c = T_c / (T_h - T_c);
const COP = eta_II * COP_c;
const W = Q / COP;
const Q_rej = Q + W;
const q_net_base = n_sides * eps * sigma * std.math.pow(f64, T_base, 4.0) - q_env;
const q_net_hp = n_sides * eps * sigma * std.math.pow(f64, T_h, 4.0) - q_env;
const A_base = Q / q_net_base;
const A_hp = Q_rej / q_net_hp;
const dA_pv = W / q_pv;
const A_saved_net = A_base - A_hp - dA_pv;`,

    fortran: `! Radiator heat pump trade: ${A}
sigma = 5.670374419d-8
COP_c = T_c / (T_h - T_c)
COP = eta_II * COP_c
W = Q / COP
Q_rej = Q + W
q_net_base = n_sides * eps * sigma * T_base**4 - q_env
q_net_hp = n_sides * eps * sigma * T_h**4 - q_env
A_base = Q / q_net_base
A_hp = Q_rej / q_net_hp
dA_pv = W / q_pv
A_saved_net = A_base - A_hp - dA_pv`,

    matlab: `% Radiator heat pump trade: ${A}
sigma = 5.670374419e-8;
COP_c = T_c / (T_h - T_c);
COP = eta_II * COP_c;
W = Q / COP;
Q_rej = Q + W;
q_net_base = n_sides * eps * sigma * T_base^4 - q_env;
q_net_hp = n_sides * eps * sigma * T_h^4 - q_env;
A_base = Q / q_net_base;
A_hp = Q_rej / q_net_hp;
dA_pv = W / q_pv;
A_saved_net = A_base - A_hp - dA_pv;`,

    julia: `# Radiator heat pump trade: ${A}
sigma = 5.670374419e-8
COP_c = T_c / (T_h - T_c)
COP = eta_II * COP_c
W = Q / COP
Q_rej = Q + W
q_net_base = n_sides * eps * sigma * T_base^4 - q_env
q_net_hp = n_sides * eps * sigma * T_h^4 - q_env
A_base = Q / q_net_base
A_hp = Q_rej / q_net_hp
dA_pv = W / q_pv
A_saved_net = A_base - A_hp - dA_pv`,

    latex: `% Radiator heat pump trade: pure SI
\\[
  \\mathrm{COP}_{C} = \\frac{T_{c}}{T_{h}-T_{c}},\\quad
  \\mathrm{COP} = \\eta_{II}\\,\\mathrm{COP}_{C},\\quad
  W = \\frac{Q}{\\mathrm{COP}},\\quad
  Q_{\\mathrm{rej}} = Q + W
\\]
\\[
  q_{\\mathrm{net}}(T) = n\\,\\varepsilon\\,\\sigma T^{4} - q_{\\mathrm{env}},\\quad
  A_{\\mathrm{base}} = \\frac{Q}{q_{\\mathrm{net}}(T_{\\mathrm{base}})},\\quad
  A_{\\mathrm{hp}} = \\frac{Q_{\\mathrm{rej}}}{q_{\\mathrm{net}}(T_{h})},\\quad
  \\Delta A_{\\mathrm{pv}} = \\frac{W}{q_{\\mathrm{pv}}}
\\]`,
  },
}
