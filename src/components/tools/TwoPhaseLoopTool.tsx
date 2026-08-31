import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { UiField } from '@/components/shared/UiField'
import { UiSelect } from '@/components/shared/UiSelect'
import { UiUnitField } from '@/components/shared/UiUnitField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import {
  TOOL_UNIT_SETS,
  toSi,
  TWO_PHASE_FLUIDS,
  twoPhaseLoop,
  type TwoPhaseFluidId,
} from '@/lib/physics'
import { formatNumber } from '@/lib/physics/format'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const FLUIDS = [...(Object.keys(TWO_PHASE_FLUIDS) as TwoPhaseFluidId[]), 'custom'] as const

const SCHEMA = {
  Q: numParam(100, { min: 0.001 }),
  Qu: strParam('kW', TOOL_UNIT_SETS.power),
  fluid: strParam('ammonia', FLUIDS),
  hfg: numParam(1186.28, { min: 0.001 }),
  dx: numParam(1, { min: 0.001, max: 1 }),
  cp: numParam(4738.9, { min: 1 }),
  dT: numParam(10, { min: 0.01 }),
  rho: numParam(610.39, { min: 0.1 }),
  dp: numParam(100, { min: 0 }),
  dpu: strParam('kPa', TOOL_UNIT_SETS.pressure),
  eta: numParam(0.5, { min: 0.01, max: 1 }),
} as const

export function TwoPhaseLoopTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const preset = p.fluid === 'custom' ? null : TWO_PHASE_FLUIDS[p.fluid as TwoPhaseFluidId]
  const hfg = preset ? preset.hfg : p.hfg * 1000
  const cp = preset ? preset.cpL : p.cp
  const rhoL = preset ? preset.rhoL : p.rho
  const Q = toSi(p.Q, p.Qu)
  const dp = toSi(p.dp, p.dpu)

  const res = useMemo(
    () => twoPhaseLoop({ q: Q, hfg, qualityChange: p.dx, cp, deltaT: p.dT, rhoL, pressureDrop: dp, pumpEff: p.eta }),
    [Q, hfg, p.dx, cp, p.dT, rhoL, dp, p.eta],
  )

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <UiUnitField
            label={t('fields.heat_to_reject_q')}
            category="power"
            unitIds={TOOL_UNIT_SETS.power}
            unitId={p.Qu}
            value={p.Q}
            min={0.001}
            onValueChange={(Q) => setP({ Q })}
            onUnitChange={(Qu, Q) => setP({ Qu, Q })}
          />
          <UiSelect
            label={t('fields.tpl_fluid')}
            value={p.fluid}
            onChange={(e) => setP({ fluid: e.target.value })}
            options={FLUIDS.map((id) => ({
              value: id,
              label: id === 'custom' ? t('fields.tpl_fluid_custom') : t(TWO_PHASE_FLUIDS[id].labelKey),
            }))}
          />
          <UiField
            label={t('fields.tpl_hfg')}
            unit="kJ/kg"
            type="number"
            min={0.001}
            step="any"
            value={preset ? preset.hfg / 1000 : p.hfg}
            disabled={preset != null}
            onChange={(e) => setP({ hfg: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.tpl_dx')}
            type="number"
            min={0.001}
            max={1}
            step={0.05}
            value={p.dx}
            onChange={(e) => setP({ dx: Number(e.target.value) })}
            hint={t('fields.tpl_dx_hint')}
          />
          <UiField
            label={t('fields.tpl_cp')}
            unit="J/(kg·K)"
            type="number"
            min={1}
            step="any"
            value={preset ? preset.cpL : p.cp}
            disabled={preset != null}
            onChange={(e) => setP({ cp: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.tpl_dt')}
            unit="K"
            type="number"
            min={0.01}
            step="any"
            value={p.dT}
            onChange={(e) => setP({ dT: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.tpl_rho')}
            unit="kg/m³"
            type="number"
            min={0.1}
            step="any"
            value={preset ? preset.rhoL : p.rho}
            disabled={preset != null}
            onChange={(e) => setP({ rho: Number(e.target.value) })}
          />
          <UiUnitField
            label={t('fields.tpl_dp')}
            category="pressure"
            unitIds={TOOL_UNIT_SETS.pressure}
            unitId={p.dpu}
            value={p.dp}
            min={0}
            onValueChange={(dp) => setP({ dp })}
            onUnitChange={(dpu, dp) => setP({ dpu, dp })}
          />
          <UiField
            label={t('fields.tpl_eta')}
            type="number"
            min={0.01}
            max={1}
            step={0.05}
            value={p.eta}
            onChange={(e) => setP({ eta: Number(e.target.value) })}
          />
        </ParamsGrid>
      }
      results={
        !res ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard label={t('fields.tpl_mdot_2ph')} si={res.mdotTwoPhase} category="massFlow" unitId="kgps" unitIds={TOOL_UNIT_SETS.massFlow} digits={4} accent />
            <ResultCard label={t('fields.tpl_mdot_1ph')} si={res.mdotSinglePhase} category="massFlow" unitId="kgps" unitIds={TOOL_UNIT_SETS.massFlow} digits={4} />
            <ResultCard label={t('fields.tpl_ratio')} value={formatNumber(res.flowRatio, 3)} accent />
            <ResultCard label={t('fields.tpl_vol_2ph')} value={formatNumber(res.volFlowTwoPhase * 60_000, 3)} unit="L/min" />
            <ResultCard label={t('fields.tpl_pump_2ph')} si={res.pumpPowerTwoPhase} category="power" unitId="W" unitIds={TOOL_UNIT_SETS.power} digits={2} />
            <ResultCard label={t('fields.tpl_pump_1ph')} si={res.pumpPowerSinglePhase} category="power" unitId="W" unitIds={TOOL_UNIT_SETS.power} digits={2} />
            {preset ? (
              <>
                <ResultCard label={t('fields.tpl_psat')} si={preset.pSat} category="pressure" unitId="kPa" unitIds={TOOL_UNIT_SETS.pressure} digits={2} />
                <ResultCard label={t('fields.tpl_tref')} si={preset.tRefK} category="temperature" unitId="C" unitIds={TOOL_UNIT_SETS.temperature} digits={1} />
              </>
            ) : null}
          </div>
        )
      }
      code={
        <CodeExport
          formulaId="two-phase-loop"
          values={{ Q, h_fg: hfg, dx: p.dx, cp, dT: p.dT, rho_l: rhoL, dp, eta_p: p.eta }}
        />
      }
    />
  )
}
