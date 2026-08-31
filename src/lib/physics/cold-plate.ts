/**
 * Single-phase cold-plate resistance chain (Lienhard, A Heat Transfer Textbook,
 * thermal resistance networks). Pure SI.
 * T_j = T_in + dT_fluid/2 + Q (R_jc + R_tim + R_conv),
 * R_tim = t/(k A_tim), R_conv = 1/(h A_wet), dT_fluid = Q/(mdot c_p).
 * No spreading resistance, no boiling, no critical-heat-flux check.
 */

export type ColdPlateInput = {
  q: number
  dieArea: number
  /** Junction-to-case resistance [K/W] from the vendor datasheet. */
  rJc: number
  timThickness: number
  timK: number
  /** Default: dieArea. */
  timArea?: number
  hCoolant: number
  /** Default: dieArea. */
  wettedArea?: number
  mdot: number
  cp: number
  tInK: number
}

export type ColdPlate = {
  heatFluxDie: number
  rTim: number
  rConv: number
  rTotal: number
  dTFluid: number
  tFluidMeanK: number
  tWallK: number
  tCaseK: number
  tJunctionK: number
}

export function coldPlateChain(i: ColdPlateInput): ColdPlate | null {
  const aTim = i.timArea ?? i.dieArea
  const aWet = i.wettedArea ?? i.dieArea
  if (!(i.q > 0) || !(i.dieArea > 0) || !(i.rJc >= 0)) return null
  if (!(i.timThickness > 0) || !(i.timK > 0) || !(aTim > 0)) return null
  if (!(i.hCoolant > 0) || !(aWet > 0) || !(i.mdot > 0) || !(i.cp > 0) || !(i.tInK > 0)) return null
  const rTim = i.timThickness / (i.timK * aTim)
  const rConv = 1 / (i.hCoolant * aWet)
  const rTotal = i.rJc + rTim + rConv
  const dTFluid = i.q / (i.mdot * i.cp)
  const tFluidMeanK = i.tInK + dTFluid / 2
  const tWallK = tFluidMeanK + i.q * rConv
  const tCaseK = tWallK + i.q * rTim
  const tJunctionK = tCaseK + i.q * i.rJc
  return { heatFluxDie: i.q / i.dieArea, rTim, rConv, rTotal, dTFluid, tFluidMeanK, tWallK, tCaseK, tJunctionK }
}
