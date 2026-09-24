import type { FormulaSnippet } from '../types'

const A = 'Far-field optical Friis; SI. 0 < etaT, etaR <= 1; L >= 1. Gt/Gr are linear gains, separate from the optics efficiencies; L is a passive loss factor.'

export const laserLinkBudgetSnippets: FormulaSnippet = {
  formulaId: 'laser-link-budget',
  assumptions: A,
  code: {
    python: `# ${A}\nimport math\nfspl = (lam / (4 * math.pi * R)) ** 2\nPr = pt * etaT * etaR * gt * gr * fspl / L`,
    javascript: `// ${A}\nconst fspl = (lam / (4 * Math.PI * R)) ** 2\nconst Pr = pt * etaT * etaR * gt * gr * fspl / L`,
    typescript: `// ${A}\nconst fspl = (lam / (4 * Math.PI * R)) ** 2\nconst Pr = pt * etaT * etaR * gt * gr * fspl / L`,
    c: `/* ${A} */\nconst double fspl = pow((lam / (4 * M_PI * R)), 2);\nconst double Pr = pt * etaT * etaR * gt * gr * fspl / L;`,
    cpp: `// ${A}\nconst double fspl = pow((lam / (4 * M_PI * R)), 2);\nconst double Pr = pt * etaT * etaR * gt * gr * fspl / L;`,
    rust: `// ${A}\nlet fspl = ((lam / (4.0_f64 * std::f64::consts::PI * R))).powi(2);\nlet Pr = pt * etaT * etaR * gt * gr * fspl / L;`,
    zig: `// ${A}\nconst fspl = std.math.pow(f64, (lam / (@as(f64, 4.0) * std.math.pi * R)), @as(f64, 2.0));\nconst Pr = pt * etaT * etaR * gt * gr * fspl / L;`,
    fortran: `! ${A}\n  fspl = (lam / (4.0d0 * 3.141592653589793d0 * R)) ** 2.0d0\n  Pr = pt * etaT * etaR * gt * gr * fspl / L`,
    matlab: `% ${A}\nfspl = (lam / (4 * pi * R)) ^ 2\nPr = pt * etaT * etaR * gt * gr * fspl / L`,
    julia: `# ${A}\nfspl = (lam / (4 * π * R)) ^ 2\nPr = pt * etaT * etaR * gt * gr * fspl / L`,
    latex: `% ${A}\n\\[P_r=P_t\\eta_T\\eta_R G_t G_r\\left(\\frac{\\lambda}{4\\pi R}\\right)^2/L,\\quad 0<\\eta_T,\\eta_R\\le1,\\quad L\\ge1\\]`,
  },
}
