import type { FormulaSnippet } from '../types'

const A = 'White-FM range-rate sigma: sigma_v = sqrt(2) * c * sigma_y. c = 299792458 m/s. SI.'

export const allanRangeRateSnippets: FormulaSnippet = {
  formulaId: 'allan-range-rate',
  assumptions: A,
  code: {
    python: `# ${A}
import math
c = 299792458.0
sigma_v = math.sqrt(2.0) * c * sy`,
    javascript: `// ${A}
const c = 299792458.0
const sigma_v = Math.sqrt(2.0) * c * sy`,
    typescript: `// ${A}
const c: number = 299792458.0
const sigma_v: number = Math.sqrt(2.0) * c * sy`,
    c: `/* ${A} */
const double c = 299792458.0;
const double sigma_v = sqrt(2.0) * c * sy;`,
    cpp: `// ${A}
const double c = 299792458.0;
const double sigma_v = sqrt(2.0) * c * sy;`,
    rust: `// ${A}
let c = 299792458.0_f64;
let sigma_v = 2.0_f64.sqrt() * c * sy;`,
    zig: `// ${A}
const c = @as(f64, 299792458.0);
const sigma_v = @sqrt(@as(f64, 2.0)) * c * sy;`,
    fortran: `! ${A}
  c = 299792458.0d0
  sigma_v = sqrt(2.0d0) * c * sy`,
    matlab: `% ${A}
c = 299792458.0
sigma_v = sqrt(2.0) * c * sy`,
    julia: `# ${A}
c = 299792458.0
sigma_v = sqrt(2.0) * c * sy`,
    latex: `% ${A}
\\[\\sigma_v=\\sqrt{2}\\,c\\,\\sigma_y\\]`,
  },
}
