import type { FormulaSnippet } from '../types'

const A = 'Spiral-to-escape Δv = v_circ = sqrt(mu/r). Impulsive from circular is (sqrt(2)-1) v_circ. SI.'

export const lowThrustEscapeSnippets: FormulaSnippet = {
  formulaId: 'low-thrust-escape',
  assumptions: A,
  code: {
    python: `# ${A}
import math
v_circ = math.sqrt(mu / r)
dv_spiral = v_circ
dv_imp = (math.sqrt(2.0) - 1.0) * v_circ`,
    javascript: `// ${A}
const v_circ = Math.sqrt(mu / r)
const dv_spiral = v_circ
const dv_imp = (Math.sqrt(2.0) - 1.0) * v_circ`,
    typescript: `// ${A}
const v_circ: number = Math.sqrt(mu / r)
const dv_spiral: number = v_circ
const dv_imp: number = (Math.sqrt(2.0) - 1.0) * v_circ`,
    c: `/* ${A} */
const double v_circ = sqrt(mu / r);
const double dv_spiral = v_circ;
const double dv_imp = (sqrt(2.0) - 1.0) * v_circ;`,
    cpp: `// ${A}
const double v_circ = sqrt(mu / r);
const double dv_spiral = v_circ;
const double dv_imp = (sqrt(2.0) - 1.0) * v_circ;`,
    rust: `// ${A}
let v_circ = (mu / r).sqrt();
let dv_spiral = v_circ;
let dv_imp = (2.0_f64.sqrt() - 1.0) * v_circ;`,
    zig: `// ${A}
const v_circ = @sqrt(mu / r);
const dv_spiral = v_circ;
const dv_imp = (@sqrt(@as(f64, 2.0)) - @as(f64, 1.0)) * v_circ;`,
    fortran: `! ${A}
  v_circ = sqrt(mu / r)
  dv_spiral = v_circ
  dv_imp = (sqrt(2.0d0) - 1.0d0) * v_circ`,
    matlab: `% ${A}
v_circ = sqrt(mu / r)
dv_spiral = v_circ
dv_imp = (sqrt(2.0) - 1.0) * v_circ`,
    julia: `# ${A}
v_circ = sqrt(mu / r)
dv_spiral = v_circ
dv_imp = (sqrt(2.0) - 1.0) * v_circ`,
    latex: `% ${A}
\\[v_c=\\sqrt{\\mu/r},\\quad \\Delta v_{\\mathrm{spiral}}=v_c,\\quad \\Delta v_{\\mathrm{imp}}=(\\sqrt{2}-1)v_c\\]`,
  },
}
