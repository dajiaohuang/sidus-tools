import type { FormulaSnippet } from '../types'

const A = "B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI."

export const planckRadianceSnippets: FormulaSnippet = {
  formulaId: 'planck-radiance',
  assumptions: A,
  code: {
    python:
      "# B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI.\nimport math\nh = 6.62607015e-34\nkB = 1.380649e-23\nc = 299792458.0\nx = h * c / (lam * kB * T)\nif x > 50.0:\n    B = math.exp(math.log(2.0 * h * c**2) - 5.0 * math.log(lam) - x)\nelse:\n    B = (2.0 * h * c**2 / lam**5) / math.expm1(x)",
    javascript:
      "// B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI.\nconst h = 6.62607015e-34\nconst kB = 1.380649e-23\nconst c = 299792458.0\nconst x = h * c / (lam * kB * T)\nconst logB = Math.log(2.0 * h * c**2) - 5.0 * Math.log(lam) - x\nconst B = x > 50.0 ? Math.exp(logB) : (2.0 * h * c**2 / lam**5) / Math.expm1(x)",
    typescript:
      "// B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI.\nconst h = 6.62607015e-34\nconst kB = 1.380649e-23\nconst c = 299792458.0\nconst x = h * c / (lam * kB * T)\nconst logB = Math.log(2.0 * h * c**2) - 5.0 * Math.log(lam) - x\nconst B = x > 50.0 ? Math.exp(logB) : (2.0 * h * c**2 / lam**5) / Math.expm1(x)",
    c: "/* B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI. */\nconst double h = 6.62607015e-34;\nconst double kB = 1.380649e-23;\nconst double c = 299792458.0;\nconst double x = h * c / (lam * kB * T);\nconst double B = x > 50.0 ? exp(log(2.0 * h * c * c) - 5.0 * log(lam) - x) : (2.0 * h * c * c / pow(lam, 5)) / expm1(x);",
    cpp: "// B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI.\nconst double h = 6.62607015e-34;\nconst double kB = 1.380649e-23;\nconst double c = 299792458.0;\nconst double x = h * c / (lam * kB * T);\nconst double B = x > 50.0 ? exp(log(2.0 * h * c * c) - 5.0 * log(lam) - x) : (2.0 * h * c * c / pow(lam, 5)) / expm1(x);",
    rust: "// B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI.\nlet h = 6.62607015e-34_f64;\nlet kB = 1.380649e-23_f64;\nlet c = 299792458.0_f64;\nlet x = h * c / (lam * kB * T);\nlet log_b = (2.0_f64 * h * c.powi(2)).ln() - 5.0_f64 * lam.ln() - x;\nlet B = if x > 50.0 { log_b.exp() } else { (2.0_f64 * h * c.powi(2) / lam.powf(5.0_f64)) / x.exp_m1() };",
    zig: "// B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI.\nconst h = @as(f64, 6.62607015e-34);\nconst kB = @as(f64, 1.380649e-23);\nconst c = @as(f64, 299792458.0);\nconst x = h * c / (lam * kB * T);\nconst logB = @log(@as(f64, 2.0) * h * c * c) - @as(f64, 5.0) * @log(lam) - x;\nconst denom = if (x > @as(f64, 50.0)) @as(f64, 1.0) else if (x < @as(f64, 1e-4)) x * (@as(f64, 1.0) + x * (@as(f64, 0.5) + x * (@as(f64, 1.0 / 6.0) + x * (@as(f64, 1.0 / 24.0) + x / @as(f64, 120.0))))) else @exp(x) - @as(f64, 1.0);\nconst B = if (x > @as(f64, 50.0)) @exp(logB) else (@as(f64, 2.0) * h * c * c / std.math.pow(f64, lam, @as(f64, 5.0))) / denom;",
    fortran:
      "! B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI.\n  h = 6.62607015d-34\n  kB = 1.380649d-23\n  c = 299792458.0d0\n  x = h * c / (lam * kB * T)\n  if (x .gt. 50.0d0) then\n    B = exp(log(2.0d0 * h * c**2.0d0) - 5.0d0 * log(lam) - x)\n  else if (x .lt. 1.0d-4) then\n    B = (2.0d0 * h * c**2.0d0 / lam**5.0d0) / (x * (1.0d0 + x * (0.5d0 + x * (1.0d0 / 6.0d0 + x * (1.0d0 / 24.0d0 + x / 120.0d0)))) )\n  else\n    B = (2.0d0 * h * c**2.0d0 / lam**5.0d0) / (exp(x) - 1.0d0)\n  end if",
    matlab:
      "% B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI.\nh = 6.62607015e-34\nkB = 1.380649e-23\nc = 299792458.0\nx = h * c / (lam * kB * T)\nif x > 50.0\n    B = exp(log(2.0 * h * c^2) - 5.0 * log(lam) - x);\nelseif x < 1.0e-4\n    B = (2.0 * h * c^2 / lam^5) / (x * (1.0 + x * (0.5 + x * (1.0/6.0 + x * (1.0/24.0 + x/120.0)))));\nelse\n    B = (2.0 * h * c^2 / lam^5) / expm1(x);\nend",
    julia:
      "# B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI.\nh = 6.62607015e-34\nkB = 1.380649e-23\nc = 299792458.0\nx = h * c / (lam * kB * T)\nif x > 50.0\n    B = exp(log(2.0 * h * c^2) - 5.0 * log(lam) - x)\nelse\n    B = (2.0 * h * c^2 / lam^5) / expm1(x)\nend",
    latex:
      "% B_lam = 2 h c^2 / lam^5 / (exp(h c / (lam k T)) - 1); SI.\n\\[B_\\lambda=\\frac{2hc^{2}}{\\lambda^{5}}\\frac{1}{e^{hc/(\\lambda kT)}-1}\\]",
  },
}
