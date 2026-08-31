import type { FormulaSnippet } from '../types'

/**
 * Dawn-dusk SSO beta angle and eclipse at a Julian date.
 * i_sso from J2 node regression; Vallado low-precision Sun for declination;
 * beta = asin(cos d sin i sin dOmega + sin d cos i), dOmega = (LTAN - 12 h) x 15 deg;
 * beta* = asin(R/a); f_ecl = acos(min(sqrt(1-(R/a)^2)/cos beta, 1))/pi; t_ecl = f_ecl T.
 * Free vars: h, ltan_h, jd, mu, R, J2, omega_sun (SI, hours, Julian date).
 * Matches SsoDawnDuskTool + lib/physics/dawn-dusk.ts dawnDuskBetaJd.
 */
const A =
  'Circular SSO, J2 secular inclination, Vallado low-precision Sun (0.01 deg), LTAN to true Sun, cylindrical shadow. SI.'

export const ssoDawnDuskSnippets: FormulaSnippet = {
  formulaId: 'sso-dawn-dusk',
  assumptions: A,
  code: {
    python: `# Dawn-dusk SSO beta and eclipse: ${A}
import math
deg2rad = math.pi / 180.0
a = R + h
n = math.sqrt(mu / a**3)
i_sso = math.acos(-(2.0 / 3.0) * (a / R)**2 * omega_sun / (n * J2))
T = 2.0 * math.pi / n
tut1 = (jd - 2451545.0) / 36525.0
meanlong = 280.46 + 36000.77 * tut1
M = (357.5277233 + 35999.05034 * tut1) * deg2rad
lam = (meanlong + 1.914666471 * math.sin(M) + 0.019994643 * math.sin(2.0 * M)) * deg2rad
obl = (23.439291 - 0.0130042 * tut1) * deg2rad
decl = math.asin(math.sin(obl) * math.sin(lam))
d_omega = (ltan_h - 12.0) * 15.0 * deg2rad
beta = math.asin(math.cos(decl) * math.sin(i_sso) * math.sin(d_omega) + math.sin(decl) * math.cos(i_sso))
beta_star = math.asin(R / a)
arg = math.sqrt(1.0 - (R / a)**2) / math.cos(beta)
f_ecl = math.acos(min(arg, 1.0)) / math.pi
t_ecl = f_ecl * T`,

    javascript: `// Dawn-dusk SSO beta and eclipse: ${A}
const deg2rad = Math.PI / 180
const a = R + h
const n = Math.sqrt(mu / a ** 3)
const i_sso = Math.acos(-(2 / 3) * (a / R) ** 2 * omega_sun / (n * J2))
const T = 2 * Math.PI / n
const tut1 = (jd - 2451545) / 36525
const meanlong = 280.46 + 36000.77 * tut1
const M = (357.5277233 + 35999.05034 * tut1) * deg2rad
const lam = (meanlong + 1.914666471 * Math.sin(M) + 0.019994643 * Math.sin(2 * M)) * deg2rad
const obl = (23.439291 - 0.0130042 * tut1) * deg2rad
const decl = Math.asin(Math.sin(obl) * Math.sin(lam))
const d_omega = (ltan_h - 12) * 15 * deg2rad
const beta = Math.asin(Math.cos(decl) * Math.sin(i_sso) * Math.sin(d_omega) + Math.sin(decl) * Math.cos(i_sso))
const beta_star = Math.asin(R / a)
const arg = Math.sqrt(1 - (R / a) ** 2) / Math.cos(beta)
const f_ecl = Math.acos(Math.min(arg, 1)) / Math.PI
const t_ecl = f_ecl * T`,

    typescript: `// Dawn-dusk SSO beta and eclipse: ${A}
const deg2rad: number = Math.PI / 180
const a: number = R + h
const n: number = Math.sqrt(mu / a ** 3)
const i_sso: number = Math.acos(-(2 / 3) * (a / R) ** 2 * omega_sun / (n * J2))
const T: number = 2 * Math.PI / n
const tut1: number = (jd - 2451545) / 36525
const meanlong: number = 280.46 + 36000.77 * tut1
const M: number = (357.5277233 + 35999.05034 * tut1) * deg2rad
const lam: number = (meanlong + 1.914666471 * Math.sin(M) + 0.019994643 * Math.sin(2 * M)) * deg2rad
const obl: number = (23.439291 - 0.0130042 * tut1) * deg2rad
const decl: number = Math.asin(Math.sin(obl) * Math.sin(lam))
const d_omega: number = (ltan_h - 12) * 15 * deg2rad
const beta: number = Math.asin(Math.cos(decl) * Math.sin(i_sso) * Math.sin(d_omega) + Math.sin(decl) * Math.cos(i_sso))
const beta_star: number = Math.asin(R / a)
const arg: number = Math.sqrt(1 - (R / a) ** 2) / Math.cos(beta)
const f_ecl: number = Math.acos(Math.min(arg, 1)) / Math.PI
const t_ecl: number = f_ecl * T`,

    c: `/* Dawn-dusk SSO beta and eclipse: ${A} */
const double deg2rad = M_PI / 180.0;
const double a = R + h;
const double n = sqrt(mu / (a * a * a));
const double i_sso = acos(-(2.0 / 3.0) * (a / R) * (a / R) * omega_sun / (n * J2));
const double T = 2.0 * M_PI / n;
const double tut1 = (jd - 2451545.0) / 36525.0;
const double meanlong = 280.46 + 36000.77 * tut1;
const double M = (357.5277233 + 35999.05034 * tut1) * deg2rad;
const double lam = (meanlong + 1.914666471 * sin(M) + 0.019994643 * sin(2.0 * M)) * deg2rad;
const double obl = (23.439291 - 0.0130042 * tut1) * deg2rad;
const double decl = asin(sin(obl) * sin(lam));
const double d_omega = (ltan_h - 12.0) * 15.0 * deg2rad;
const double beta = asin(cos(decl) * sin(i_sso) * sin(d_omega) + sin(decl) * cos(i_sso));
const double beta_star = asin(R / a);
const double arg = sqrt(1.0 - (R / a) * (R / a)) / cos(beta);
const double f_ecl = acos(fmin(arg, 1.0)) / M_PI;
const double t_ecl = f_ecl * T;`,

    cpp: `// Dawn-dusk SSO beta and eclipse: ${A}
const double deg2rad = M_PI / 180.0;
const double a = R + h;
const double n = std::sqrt(mu / (a * a * a));
const double i_sso = std::acos(-(2.0 / 3.0) * (a / R) * (a / R) * omega_sun / (n * J2));
const double T = 2.0 * M_PI / n;
const double tut1 = (jd - 2451545.0) / 36525.0;
const double meanlong = 280.46 + 36000.77 * tut1;
const double M = (357.5277233 + 35999.05034 * tut1) * deg2rad;
const double lam = (meanlong + 1.914666471 * std::sin(M) + 0.019994643 * std::sin(2.0 * M)) * deg2rad;
const double obl = (23.439291 - 0.0130042 * tut1) * deg2rad;
const double decl = std::asin(std::sin(obl) * std::sin(lam));
const double d_omega = (ltan_h - 12.0) * 15.0 * deg2rad;
const double beta = std::asin(std::cos(decl) * std::sin(i_sso) * std::sin(d_omega) + std::sin(decl) * std::cos(i_sso));
const double beta_star = std::asin(R / a);
const double arg = std::sqrt(1.0 - (R / a) * (R / a)) / std::cos(beta);
const double f_ecl = std::acos(std::fmin(arg, 1.0)) / M_PI;
const double t_ecl = f_ecl * T;`,

    rust: `// Dawn-dusk SSO beta and eclipse: ${A}
let deg2rad = std::f64::consts::PI / 180.0;
let a = R + h;
let n = (mu / (a * a * a)).sqrt();
let i_sso = (-(2.0 / 3.0) * (a / R).powi(2) * omega_sun / (n * J2)).acos();
let t = 2.0 * std::f64::consts::PI / n;
let tut1 = (jd - 2451545.0) / 36525.0;
let meanlong = 280.46 + 36000.77 * tut1;
let m_anom = (357.5277233 + 35999.05034 * tut1) * deg2rad;
let lam = (meanlong + 1.914666471 * m_anom.sin() + 0.019994643 * (2.0 * m_anom).sin()) * deg2rad;
let obl = (23.439291 - 0.0130042 * tut1) * deg2rad;
let decl = (obl.sin() * lam.sin()).asin();
let d_omega = (ltan_h - 12.0) * 15.0 * deg2rad;
let beta = (decl.cos() * i_sso.sin() * d_omega.sin() + decl.sin() * i_sso.cos()).asin();
let beta_star = (R / a).asin();
let arg = (1.0 - (R / a).powi(2)).sqrt() / beta.cos();
let f_ecl = arg.min(1.0).acos() / std::f64::consts::PI;
let t_ecl = f_ecl * t;`,

    zig: `// Dawn-dusk SSO beta and eclipse: ${A}
const deg2rad = std.math.pi / 180.0;
const a = R + h;
const n = @sqrt(mu / (a * a * a));
const i_sso = std.math.acos(-(2.0 / 3.0) * (a / R) * (a / R) * omega_sun / (n * J2));
const T = 2.0 * std.math.pi / n;
const tut1 = (jd - 2451545.0) / 36525.0;
const meanlong = 280.46 + 36000.77 * tut1;
const M = (357.5277233 + 35999.05034 * tut1) * deg2rad;
const lam = (meanlong + 1.914666471 * std.math.sin(M) + 0.019994643 * std.math.sin(2.0 * M)) * deg2rad;
const obl = (23.439291 - 0.0130042 * tut1) * deg2rad;
const decl = std.math.asin(std.math.sin(obl) * std.math.sin(lam));
const d_omega = (ltan_h - 12.0) * 15.0 * deg2rad;
const beta = std.math.asin(std.math.cos(decl) * std.math.sin(i_sso) * std.math.sin(d_omega) + std.math.sin(decl) * std.math.cos(i_sso));
const beta_star = std.math.asin(R / a);
const arg = @sqrt(1.0 - (R / a) * (R / a)) / std.math.cos(beta);
const f_ecl = std.math.acos(@min(arg, 1.0)) / std.math.pi;
const t_ecl = f_ecl * T;`,

    fortran: `! Dawn-dusk SSO beta and eclipse: ${A}
deg2rad = 3.141592653589793d0 / 180.0d0
a = R + h
n = sqrt(mu / a**3)
i_sso = acos(-(2.0d0 / 3.0d0) * (a / R)**2 * omega_sun / (n * J2))
T = 2.0d0 * 3.141592653589793d0 / n
tut1 = (jd - 2451545.0d0) / 36525.0d0
meanlong = 280.46d0 + 36000.77d0 * tut1
M = (357.5277233d0 + 35999.05034d0 * tut1) * deg2rad
lam = (meanlong + 1.914666471d0 * sin(M) + 0.019994643d0 * sin(2.0d0 * M)) * deg2rad
obl = (23.439291d0 - 0.0130042d0 * tut1) * deg2rad
decl = asin(sin(obl) * sin(lam))
d_omega = (ltan_h - 12.0d0) * 15.0d0 * deg2rad
beta = asin(cos(decl) * sin(i_sso) * sin(d_omega) + sin(decl) * cos(i_sso))
beta_star = asin(R / a)
arg = sqrt(1.0d0 - (R / a)**2) / cos(beta)
f_ecl = acos(min(arg, 1.0d0)) / 3.141592653589793d0
t_ecl = f_ecl * T`,

    matlab: `% Dawn-dusk SSO beta and eclipse: ${A}
deg2rad = pi / 180;
a = R + h;
n = sqrt(mu / a^3);
i_sso = acos(-(2 / 3) * (a / R)^2 * omega_sun / (n * J2));
T = 2 * pi / n;
tut1 = (jd - 2451545) / 36525;
meanlong = 280.46 + 36000.77 * tut1;
M = (357.5277233 + 35999.05034 * tut1) * deg2rad;
lam = (meanlong + 1.914666471 * sin(M) + 0.019994643 * sin(2 * M)) * deg2rad;
obl = (23.439291 - 0.0130042 * tut1) * deg2rad;
decl = asin(sin(obl) * sin(lam));
d_omega = (ltan_h - 12) * 15 * deg2rad;
beta = asin(cos(decl) * sin(i_sso) * sin(d_omega) + sin(decl) * cos(i_sso));
beta_star = asin(R / a);
arg = sqrt(1 - (R / a)^2) / cos(beta);
f_ecl = acos(min(arg, 1)) / pi;
t_ecl = f_ecl * T;`,

    julia: `# Dawn-dusk SSO beta and eclipse: ${A}
deg2rad = π / 180
a = R + h
n = sqrt(mu / a^3)
i_sso = acos(-(2 / 3) * (a / R)^2 * omega_sun / (n * J2))
T = 2 * π / n
tut1 = (jd - 2451545) / 36525
meanlong = 280.46 + 36000.77 * tut1
M = (357.5277233 + 35999.05034 * tut1) * deg2rad
lam = (meanlong + 1.914666471 * sin(M) + 0.019994643 * sin(2 * M)) * deg2rad
obl = (23.439291 - 0.0130042 * tut1) * deg2rad
decl = asin(sin(obl) * sin(lam))
d_omega = (ltan_h - 12) * 15 * deg2rad
beta = asin(cos(decl) * sin(i_sso) * sin(d_omega) + sin(decl) * cos(i_sso))
beta_star = asin(R / a)
arg = sqrt(1 - (R / a)^2) / cos(beta)
f_ecl = acos(min(arg, 1)) / π
t_ecl = f_ecl * T`,

    latex: `% Dawn-dusk SSO beta and eclipse: pure SI
\\[
  \\cos i_{\\mathrm{sso}} = -\\frac{2}{3}\\left(\\frac{a}{R}\\right)^{2}\\frac{\\omega_{\\odot}}{n J_{2}},\\quad
  \\Omega - \\alpha_{\\odot} = (\\mathrm{LTAN} - 12\\,\\mathrm{h})\\cdot 15^{\\circ}/\\mathrm{h}
\\]
\\[
  \\beta = \\arcsin\\!\\left(\\cos\\delta_{\\odot}\\sin i\\sin(\\Omega-\\alpha_{\\odot}) + \\sin\\delta_{\\odot}\\cos i\\right),\\quad
  \\beta^{*} = \\arcsin\\frac{R}{a}
\\]
\\[
  f_{\\mathrm{ecl}} = \\frac{1}{\\pi}\\arccos\\!\\left(\\min\\!\\left[\\frac{\\sqrt{1-(R/a)^{2}}}{\\cos\\beta},\\,1\\right]\\right),\\quad
  t_{\\mathrm{ecl}} = f_{\\mathrm{ecl}}\\,T
\\]`,
  },
}
