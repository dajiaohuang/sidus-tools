import type { FormulaSnippet } from '../types'

const A = 'Identical coherent array: SNR gain = N (linear), 10 log10(N) dB. SI.'

export const dsnArrayGainSnippets: FormulaSnippet = {
  formulaId: 'dsn-array-gain',
  assumptions: A,
  code: {
    python: `# ${A}
import math
gain_lin = n
gain_db = 10.0 * math.log10(n)`,
    javascript: `// ${A}
const gain_lin = n
const gain_db = 10.0 * Math.log10(n)`,
    typescript: `// ${A}
const gain_lin: number = n
const gain_db: number = 10.0 * Math.log10(n)`,
    c: `/* ${A} */
const double gain_lin = n;
const double gain_db = 10.0 * log10(n);`,
    cpp: `// ${A}
const double gain_lin = n;
const double gain_db = 10.0 * log10(n);`,
    rust: `// ${A}
let gain_lin = n;
let gain_db = 10.0_f64 * n.log10();`,
    zig: `// ${A}
const gain_lin = n;
const gain_db = @as(f64, 10.0) * std.math.log10(n);`,
    fortran: `! ${A}
  gain_lin = n
  gain_db = 10.0d0 * log10(n)`,
    matlab: `% ${A}
gain_lin = n
gain_db = 10.0 * log10(n)`,
    julia: `# ${A}
gain_lin = n
gain_db = 10.0 * log10(n)`,
    latex: `% ${A}
\\[G_{\\mathrm{lin}}=N,\\quad G_{\\mathrm{dB}}=10\\log_{10}N\\]`,
  },
}
