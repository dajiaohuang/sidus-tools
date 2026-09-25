import type { FormulaSnippet } from './types'

const ASSUMPTIONS =
  'Keplerian ellipse (0 ≤ e < 1); spherical central body; speeds from vis-viva; SI units.'

export const apsidesSnippets: FormulaSnippet = {
  formulaId: 'apsides',
  assumptions: ASSUMPTIONS,
  code: {
    c: `/* Apsides: ${ASSUMPTIONS} */
const double rp = a * (1.0 - e);
const double ra = a * (1.0 + e);
const double sqrt_mu = sqrt(mu);
const double sqrt_a = sqrt(a);
const double vp = sqrt_mu * sqrt((1.0 + e) / (1.0 - e)) / sqrt_a;
const double va = sqrt_mu * sqrt((1.0 - e) / (1.0 + e)) / sqrt_a;`,

    cpp: `// Apsides: ${ASSUMPTIONS}
const double rp = a * (1.0 - e);
const double ra = a * (1.0 + e);
const double sqrt_mu = std::sqrt(mu);
const double sqrt_a = std::sqrt(a);
const double vp = sqrt_mu * std::sqrt((1.0 + e) / (1.0 - e)) / sqrt_a;
const double va = sqrt_mu * std::sqrt((1.0 - e) / (1.0 + e)) / sqrt_a;`,

    rust: `// Apsides: ${ASSUMPTIONS}
let rp = a * (1.0 - e);
let ra = a * (1.0 + e);
let sqrt_mu = mu.sqrt();
let sqrt_a = a.sqrt();
let vp = sqrt_mu * ((1.0 + e) / (1.0 - e)).sqrt() / sqrt_a;
let va = sqrt_mu * ((1.0 - e) / (1.0 + e)).sqrt() / sqrt_a;`,

    zig: `// Apsides: ${ASSUMPTIONS}
const rp = a * (1.0 - e);
const ra = a * (1.0 + e);
const sqrt_mu = @sqrt(mu);
const sqrt_a = @sqrt(a);
const vp = sqrt_mu * @sqrt((1.0 + e) / (1.0 - e)) / sqrt_a;
const va = sqrt_mu * @sqrt((1.0 - e) / (1.0 + e)) / sqrt_a;`,

    python: `# Apsides: ${ASSUMPTIONS}
import math
rp = a * (1 - e)
ra = a * (1 + e)
sqrt_mu = math.sqrt(mu)
sqrt_a = math.sqrt(a)
vp = sqrt_mu * math.sqrt((1 + e) / (1 - e)) / sqrt_a
va = sqrt_mu * math.sqrt((1 - e) / (1 + e)) / sqrt_a`,

    javascript: `// Apsides: ${ASSUMPTIONS}
const rp = a * (1 - e)
const ra = a * (1 + e)
const sqrtMu = Math.sqrt(mu)
const sqrtA = Math.sqrt(a)
const vp = (sqrtMu * Math.sqrt((1 + e) / (1 - e))) / sqrtA
const va = (sqrtMu * Math.sqrt((1 - e) / (1 + e))) / sqrtA`,

    typescript: `// Apsides: ${ASSUMPTIONS}
const rp: number = a * (1 - e)
const ra: number = a * (1 + e)
const sqrtMu: number = Math.sqrt(mu)
const sqrtA: number = Math.sqrt(a)
const vp: number = (sqrtMu * Math.sqrt((1 + e) / (1 - e))) / sqrtA
const va: number = (sqrtMu * Math.sqrt((1 - e) / (1 + e))) / sqrtA`,

    matlab: `% Apsides: ${ASSUMPTIONS}
rp = a * (1 - e);
ra = a * (1 + e);
sqrt_mu = sqrt(mu);
sqrt_a = sqrt(a);
vp = sqrt_mu * sqrt((1 + e) / (1 - e)) / sqrt_a;
va = sqrt_mu * sqrt((1 - e) / (1 + e)) / sqrt_a;`,

    julia: `# Apsides: ${ASSUMPTIONS}
rp = a * (1 - e)
ra = a * (1 + e)
sqrt_mu = sqrt(mu)
sqrt_a = sqrt(a)
vp = sqrt_mu * sqrt((1 + e) / (1 - e)) / sqrt_a
va = sqrt_mu * sqrt((1 - e) / (1 + e)) / sqrt_a`,

    fortran: `! Apsides: ${ASSUMPTIONS}
rp = a * (1.0d0 - e)
ra = a * (1.0d0 + e)
sqrt_mu = sqrt(mu)
sqrt_a = sqrt(a)
vp = sqrt_mu * sqrt((1.0d0 + e) / (1.0d0 - e)) / sqrt_a
va = sqrt_mu * sqrt((1.0d0 - e) / (1.0d0 + e)) / sqrt_a`,

    latex: `% Apsides
\\[
r_p = a(1-e),\\quad r_a = a(1+e),\\quad
v_p = \\sqrt{\\frac{\\mu}{a}}\\sqrt{\\frac{1+e}{1-e}},\\quad
v_a = \\sqrt{\\frac{\\mu}{a}}\\sqrt{\\frac{1-e}{1+e}}
\\]`,
  },
}
