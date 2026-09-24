import type { FormulaSnippet } from './types'

const ASSUMPTIONS =
  'Ideal rocket per stage; constant ve within each burn; no gravity/drag losses; stages independent (no automatic payload stacking).'

export const multiStageSnippets: FormulaSnippet = {
  formulaId: 'multi-stage',
  assumptions: ASSUMPTIONS,
  code: {
    python: `# Multi-stage Δv: ${ASSUMPTIONS}
import math

G0 = 9.80665  # m/s²

def multi_stage_dv(stages):
    """Accept {isp_s,m0_kg,mf_kg}, {ve,m0,mf}, or legacy {isp,m0,mf}; SI units."""
    dvs = []
    for s in stages:
        if "ve" in s:
            ve, m0, mf = s["ve"], s["m0"], s["mf"]
        elif "isp_s" in s:
            ve, m0, mf = s["isp_s"] * G0, s["m0_kg"], s["mf_kg"]
        else:
            # Preserve the short-key form used by the JavaScript helper.
            ve, m0, mf = s["isp"] * G0, s["m0"], s["mf"]
        if not (ve > 0 and m0 > mf > 0):
            raise ValueError("need ve>0 and m0>mf>0")
        dvs.append(ve * math.log(m0 / mf))
    return dvs, sum(dvs)

dv1 = isp1 * G0 * math.log(m01 / mf1)
dv2 = isp2 * G0 * math.log(m02 / mf2) if stages >= 2 else 0.0
dv3 = isp3 * G0 * math.log(m03 / mf3) if stages >= 3 else 0.0
dv_total = dv1 + dv2 + dv3`,

    javascript: `// Multi-stage Δv: ${ASSUMPTIONS}
const G0 = 9.80665
function multiStageDv(stages) {
  // stages: [{ isp_s, m0_kg, mf_kg }], [{ isp, m0, mf }], or [{ ve, m0, mf }]
  const dvs = stages.map((s) => {
    const ve = s.ve ?? (s.isp_s ?? s.isp) * G0
    const m0 = s.m0_kg ?? s.m0
    const mf = s.mf_kg ?? s.mf
    if (!(ve > 0) || !(m0 > mf) || !(mf > 0)) throw new Error('bad stage')
    return ve * Math.log(m0 / mf)
  })
  return { dv: dvs, dvTotal: dvs.reduce((a, b) => a + b, 0) }
}

const dv1 = isp1 * G0 * Math.log(m01 / mf1)
const dv2 = stages >= 2 ? isp2 * G0 * Math.log(m02 / mf2) : 0
const dv3 = stages >= 3 ? isp3 * G0 * Math.log(m03 / mf3) : 0
const dv_total = dv1 + dv2 + dv3`,

    typescript: `// Multi-stage Δv: ${ASSUMPTIONS}
const G0 = 9.80665
type Stage = { isp?: number; ve?: number; m0: number; mf: number }
function multiStageDv(stages: Stage[]) {
  const dv = stages.map((s) => {
    const ve = s.ve ?? (s.isp as number) * G0
    return ve * Math.log(s.m0 / s.mf)
  })
  return { dv, dvTotal: dv.reduce((a, b) => a + b, 0) }
}

const dv1: number = isp1 * G0 * Math.log(m01 / mf1)
const dv2: number = stages >= 2 ? isp2 * G0 * Math.log(m02 / mf2) : 0
const dv3: number = stages >= 3 ? isp3 * G0 * Math.log(m03 / mf3) : 0
const dv_total: number = dv1 + dv2 + dv3`,

    c: `/* Multi-stage ideal rocket: ${ASSUMPTIONS} */
const double g0 = 9.80665;
const double dv1 = isp1 * g0 * log(m01 / mf1);
const double dv2 = stages >= 2.0 ? isp2 * g0 * log(m02 / mf2) : 0.0;
const double dv3 = stages >= 3.0 ? isp3 * g0 * log(m03 / mf3) : 0.0;
const double dv_total = dv1 + dv2 + dv3;`,

    cpp: `// Multi-stage ideal rocket: ${ASSUMPTIONS}
const double g0 = 9.80665;
const double dv1 = isp1 * g0 * std::log(m01 / mf1);
const double dv2 = stages >= 2.0 ? isp2 * g0 * std::log(m02 / mf2) : 0.0;
const double dv3 = stages >= 3.0 ? isp3 * g0 * std::log(m03 / mf3) : 0.0;
const double dv_total = dv1 + dv2 + dv3;`,

    rust: `// Multi-stage ideal rocket: ${ASSUMPTIONS}
let g0 = 9.80665_f64;
let dv1 = isp1 * g0 * (m01 / mf1).ln();
let dv2 = if stages >= 2.0 { isp2 * g0 * (m02 / mf2).ln() } else { 0.0 };
let dv3 = if stages >= 3.0 { isp3 * g0 * (m03 / mf3).ln() } else { 0.0 };
let dv_total = dv1 + dv2 + dv3;`,

    zig: `// Multi-stage ideal rocket: ${ASSUMPTIONS}
const g0: f64 = 9.80665;
const dv1 = isp1 * g0 * @log(m01 / mf1);
const dv2 = if (stages >= 2.0) isp2 * g0 * @log(m02 / mf2) else 0.0;
const dv3 = if (stages >= 3.0) isp3 * g0 * @log(m03 / mf3) else 0.0;
const dv_total = dv1 + dv2 + dv3;`,

    fortran: `! Multi-stage ideal rocket: ${ASSUMPTIONS}
g0 = 9.80665d0
dv1 = isp1 * g0 * log(m01 / mf1)
dv2 = 0.0d0
if (stages >= 2.0d0) dv2 = isp2 * g0 * log(m02 / mf2)
dv3 = 0.0d0
if (stages >= 3.0d0) dv3 = isp3 * g0 * log(m03 / mf3)
dv_total = dv1 + dv2 + dv3`,

    matlab: `% Multi-stage: ${ASSUMPTIONS}
g0 = 9.80665;
dv1 = isp1 * g0 * log(m01 / mf1);
if stages >= 2
  dv2 = isp2 * g0 * log(m02 / mf2);
else
  dv2 = 0;
end
if stages >= 3
  dv3 = isp3 * g0 * log(m03 / mf3);
else
  dv3 = 0;
end
dv_total = dv1 + dv2 + dv3;`,

    julia: `# Multi-stage: ${ASSUMPTIONS}
g0 = 9.80665
dv1 = isp1 * g0 * log(m01 / mf1)
dv2 = stages >= 2 ? isp2 * g0 * log(m02 / mf2) : 0.0
dv3 = stages >= 3 ? isp3 * g0 * log(m03 / mf3) : 0.0
dv_total = dv1 + dv2 + dv3`,

    latex: `% Multi-stage ideal rocket
\\[
\\Delta v = \\sum_{i=1}^{N} g_0 I_{\\mathrm{sp},i}\\ln\\frac{m_{0,i}}{m_{f,i}}
= \\sum_{i=1}^{N} v_{e,i}\\ln\\frac{m_{0,i}}{m_{f,i}}
\\]`,
  },
}
