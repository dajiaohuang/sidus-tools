import type { FormulaSnippet } from '../types'

/**
 * Elevation / azimuth: ENU topocentric from LOS vector components.
 * Formula fragments only (wrapAsRunnable adds main / includes / live inputs).
 * Educational core of ElevationAzimuthTool + topocentricElAz (geometry.ts):
 * free vars east, north, up are ENU components of (r_tgt − r_site).
 */
const A =
  'Spherical ECEF to ENU teaching form; no refraction. Elevation is radians; slant range is metres; azimuth is clockwise from north from zero inclusive to 2*pi exclusive, in radians. Requires nonzero range and nonzero horizontal projection for a defined azimuth.'

export const elevationAzimuthSnippets: FormulaSnippet = {
  formulaId: 'elevation-azimuth',
  assumptions: A,
  code: {
    python: `# Elevation / azimuth: ${A}
import math
# r_site, r_tgt in ECEF; d = r_tgt - r_site
# east, north, up = ENU components of d
rho = math.hypot(east, north, up)
el = math.asin(up / rho)
az_raw = math.atan2(east, north)
az = az_raw % (2 * math.pi)`,

    javascript: `// Elevation / azimuth: ${A}
// r_site, r_tgt in ECEF; d = r_tgt - r_site
// east, north, up = ENU components of d
const rho = Math.hypot(east, north, up)
const el = Math.asin(up / rho)
const azRaw = Math.atan2(east, north)
const az = ((azRaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)`,

    typescript: `// Elevation / azimuth: ${A}
// r_site, r_tgt in ECEF; d = r_tgt - r_site
// east, north, up = ENU components of d
const rho: number = Math.hypot(east, north, up)
const el: number = Math.asin(up / rho)
const azRaw = Math.atan2(east, north)
const az = ((azRaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)`,

    c: `/* Elevation / azimuth: ${A} */
const double rho = sqrt(east * east + north * north + up * up);
const double el = asin(up / rho);
const double az_raw = atan2(east, north);
const double az = az_raw < 0.0 ? az_raw + 2.0 * acos(-1.0) : az_raw;`,

    cpp: `// Elevation / azimuth: ${A}
const double rho = std::sqrt(east * east + north * north + up * up);
const double el = std::asin(up / rho);
const double az_raw = std::atan2(east, north);
const double az = az_raw < 0.0 ? az_raw + 2.0 * std::acos(-1.0) : az_raw;`,

    rust: `// Elevation / azimuth: ${A}
let rho = east.hypot(north).hypot(up);
let el = (up / rho).asin();
let az_raw = east.atan2(north);
let az = if az_raw < 0.0 { az_raw + 2.0 * std::f64::consts::PI } else { az_raw };`,

    zig: `// Elevation / azimuth: ${A}
const rho = std.math.sqrt(east * east + north * north + up * up);
const el = std.math.asin(up / rho);
const az_raw = std.math.atan2(east, north);
const az = if (az_raw < 0.0) az_raw + 2.0 * std.math.pi else az_raw;`,

    fortran: `! Elevation / azimuth: ${A}
rho = sqrt(east * east + north * north + up * up)
el = asin(up / rho)
az = atan2(east, north)
if (az < 0.0d0) az = az + 2.0d0 * acos(-1.0d0)`,

    matlab: `% Elevation / azimuth: ${A}
rho = sqrt(east^2 + north^2 + up^2);
el = asin(up / rho);
az = mod(atan2(east, north), 2*pi);`,

    julia: `# Elevation / azimuth: ${A}
rho = hypot(east, north, up)
el = asin(up / rho)
az = mod(atan(east, north), 2*pi)`,

    latex: `% Elevation / azimuth: pure SI
\\[
  \\rho = |\\mathbf d|,\\quad
  \\sin el = u/\\rho,\\quad
  az = \\mathrm{mod}(\\mathrm{atan2}(e,n),2\\pi),\\quad
  az \\in [0,2\\pi)
\\]`,
  },
}
