/**
 * Shield mass per kW of a box-shaped compute container. Geometry only, no dose.
 * A_s = 2(LW + LH + WH); rho_A = rho t + extra; m = rho_A A_s; P = p_v V; kg/kW = m / (P/1000).
 * For a cube, kg/kW = 6 rho_A / (p_v L): shielding scales with surface, compute with volume.
 */

export type ShieldInput = {
  length: number
  width: number
  height: number
  thickness: number
  /** Shield material density [kg/m³]. Default 2700 (aluminium). */
  density?: number
  /** Areal mass already around the electronics (cold blocks, coolant) [kg/m²]. Default 0. */
  extraArealMass?: number
  /** Compute power per unit volume [W/m³]. */
  powerDensity: number
}

export type ShieldScaling = {
  surfaceArea: number
  volume: number
  arealDensity: number
  /** Same areal density in g/cm², the abscissa of SHIELDOSE-2 dose-depth curves. */
  arealDensityGcm2: number
  shieldMass: number
  power: number
  kgPerKw: number
}

export function shieldMassScaling(i: ShieldInput): ShieldScaling | null {
  const rho = i.density ?? 2700
  const extra = i.extraArealMass ?? 0
  if (!(i.length > 0) || !(i.width > 0) || !(i.height > 0) || !(i.thickness > 0)) return null
  if (!(rho > 0) || !(extra >= 0) || !(i.powerDensity > 0)) return null
  const surfaceArea = 2 * (i.length * i.width + i.length * i.height + i.width * i.height)
  const volume = i.length * i.width * i.height
  const arealDensity = rho * i.thickness + extra
  const shieldMass = arealDensity * surfaceArea
  const power = i.powerDensity * volume
  return {
    surfaceArea,
    volume,
    arealDensity,
    arealDensityGcm2: arealDensity / 10,
    shieldMass,
    power,
    kgPerKw: shieldMass / (power / 1000),
  }
}

/** kg/kW for cubes of side L with the same thickness, density, credit and power density. */
export function shieldKgPerKwVsSize(base: ShieldInput, sides: number[]): { side: number; kgPerKw: number }[] {
  const out: { side: number; kgPerKw: number }[] = []
  for (const side of sides) {
    const r = shieldMassScaling({ ...base, length: side, width: side, height: side })
    if (r) out.push({ side, kgPerKw: r.kgPerKw })
  }
  return out
}
