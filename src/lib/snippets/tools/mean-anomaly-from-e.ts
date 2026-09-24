import type { FormulaSnippet } from '../types'

const A = "Elliptic Kepler orbit only: 0 <= e < 1; E and M in radians."

export const meanAnomalyFromESnippets: FormulaSnippet = {
  formulaId: 'mean-anomaly-from-e',
  assumptions: A,
  code: {
    python: "# Elliptic Kepler orbit only: 0 <= e < 1; E and M in radians.\nimport math\nM = E - e * math.sin(E)",
    javascript: "// Elliptic Kepler orbit only: 0 <= e < 1; E and M in radians.\nconst M = E - e * Math.sin(E)",
    typescript: "// Elliptic Kepler orbit only: 0 <= e < 1; E and M in radians.\nconst M = E - e * Math.sin(E)",
    c: "/* Elliptic Kepler orbit only: 0 <= e < 1; E and M in radians. */\nconst double M = E - e * sin(E);",
    cpp: "// Elliptic Kepler orbit only: 0 <= e < 1; E and M in radians.\nconst double M = E - e * sin(E);",
    rust: "// Elliptic Kepler orbit only: 0 <= e < 1; E and M in radians.\nlet M = E - e * (E).sin();",
    zig: "// Elliptic Kepler orbit only: 0 <= e < 1; E and M in radians.\nconst M = E - e * std.math.sin(E);",
    fortran: "! Elliptic Kepler orbit only: 0 <= e < 1; E and M in radians.\n  M = E - e * sin(E)",
    matlab: "% Elliptic Kepler orbit only: 0 <= e < 1; E and M in radians.\nM = E - e * sin(E)",
    julia: "# Elliptic Kepler orbit only: 0 <= e < 1; E and M in radians.\nM = E - e * sin(E)",
    latex: "\\[M=E-e\\sin E,\\quad 0\\le e<1\\]",
  },
}
