import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { FieldPresets, PresetChip } from '@/components/shared/Field'
import { UiField } from '@/components/shared/UiField'
import { UiUnitField } from '@/components/shared/UiUnitField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import { fromSi, odcPowerThermalSizing, SOLAR_CONSTANT_1AU, TOOL_UNIT_SETS, toSi } from '@/lib/physics'
import { formatNumber } from '@/lib/physics/format'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const SCHEMA = {
  P: numParam(1, { min: 0.000001 }),
  Pu: strParam('MW', TOOL_UNIT_SETS.power),
  aoh: numParam(1, { min: 0.01 }),
  S: numParam(SOLAR_CONSTANT_1AU, { min: 1 }),
  eta: numParam(0.22, { min: 0.001, max: 1 }),
  fill: numParam(0.9, { min: 0.001, max: 1 }),
  cos: numParam(1, { min: 0.001, max: 1 }),
  qnet: numParam(585, { min: 0.001 }),
  mpv: numParam(0, { min: 0 }),
  mrad: numParam(0, { min: 0 }),
} as const

export function OdcPowerThermalSizingTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const pIt = toSi(p.P, p.Pu)
  const res = useMemo(
    () =>
      odcPowerThermalSizing({
        pIt,
        overhead: p.aoh,
        solarFlux: p.S,
        cellEff: p.eta,
        fillFactor: p.fill,
        cosTheta: p.cos,
        qNet: p.qnet,
        pvArealMass: p.mpv,
        radArealMass: p.mrad,
      }),
    [pIt, p.aoh, p.S, p.eta, p.fill, p.cos, p.qnet, p.mpv, p.mrad],
  )

  const applyWhitePaper = () =>
    setP({ P: fromSi(5e9, p.Pu), aoh: 1, S: 1366, eta: 0.22, fill: 0.9, cos: 1, qnet: 633.1 })
  const applyTuryshev = () =>
    setP({ P: fromSi(1e6, p.Pu), aoh: 1.25, S: 1361, eta: 0.22, fill: 0.9, cos: 1, qnet: 500.9, mrad: 5 })

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <FieldPresets label={t('common.presets')}>
            <PresetChip onClick={applyWhitePaper}>{t('fields.ots_preset_wp')}</PresetChip>
            <PresetChip onClick={applyTuryshev}>{t('fields.ots_preset_turyshev')}</PresetChip>
          </FieldPresets>
          <UiUnitField
            label={t('fields.ots_pit')}
            category="power"
            unitIds={TOOL_UNIT_SETS.power}
            unitId={p.Pu}
            value={p.P}
            min={0.000001}
            onValueChange={(P) => setP({ P })}
            onUnitChange={(Pu, P) => setP({ Pu, P })}
          />
          <UiField
            label={t('fields.ots_overhead')}
            type="number"
            min={0.01}
            step={0.05}
            value={p.aoh}
            onChange={(e) => setP({ aoh: Number(e.target.value) })}
            hint={t('fields.ots_overhead_hint')}
          />
          <UiField
            label={t('fields.ots_solar')}
            unit="W/m²"
            type="number"
            min={1}
            step="any"
            value={p.S}
            onChange={(e) => setP({ S: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.ots_eta')}
            type="number"
            min={0.001}
            max={1}
            step={0.01}
            value={p.eta}
            onChange={(e) => setP({ eta: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.ots_fill')}
            type="number"
            min={0.001}
            max={1}
            step={0.01}
            value={p.fill}
            onChange={(e) => setP({ fill: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.ots_cos')}
            type="number"
            min={0.001}
            max={1}
            step={0.01}
            value={p.cos}
            onChange={(e) => setP({ cos: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.ots_qnet')}
            unit="W/m²"
            type="number"
            min={0.001}
            step="any"
            value={p.qnet}
            onChange={(e) => setP({ qnet: Number(e.target.value) })}
            hint={t('fields.ots_qnet_hint')}
          />
          <UiField
            label={t('fields.ots_mpv')}
            unit="kg/m²"
            type="number"
            min={0}
            step="any"
            value={p.mpv}
            onChange={(e) => setP({ mpv: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.ots_mrad')}
            unit="kg/m²"
            type="number"
            min={0}
            step="any"
            value={p.mrad}
            onChange={(e) => setP({ mrad: Number(e.target.value) })}
          />
        </ParamsGrid>
      }
      results={
        !res ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard label={t('fields.ots_apv')} si={res.aPv} category="area" unitId="m2" unitIds={TOOL_UNIT_SETS.area} digits={4} accent />
            <ResultCard label={t('fields.ots_side')} si={res.pvSide} category="length" unitId="m" unitIds={TOOL_UNIT_SETS.length} digits={4} />
            <ResultCard label={t('fields.ots_arad')} si={res.aRad} category="area" unitId="m2" unitIds={TOOL_UNIT_SETS.area} digits={4} accent />
            <ResultCard label={t('fields.ots_ratio')} value={formatNumber(res.areaRatio, 3)} />
            <ResultCard label={t('fields.ots_ptot')} si={res.pTot} category="power" unitId="MW" unitIds={TOOL_UNIT_SETS.power} digits={4} />
            <ResultCard label={t('fields.ots_qpv')} si={res.pvPowerDensity} category="heatFlux" unitId="Wm2" unitIds={TOOL_UNIT_SETS.heatFlux} digits={2} />
            {res.mPv != null && res.kgPerKwPv != null ? (
              <>
                <ResultCard label={t('fields.ots_mpv_out')} si={res.mPv} category="mass" unitId="kg" unitIds={TOOL_UNIT_SETS.mass} digits={4} />
                <ResultCard label={t('fields.ots_kgkw_pv')} value={formatNumber(res.kgPerKwPv, 3)} unit="kg/kW" />
              </>
            ) : null}
            {res.mRad != null && res.kgPerKwRad != null ? (
              <>
                <ResultCard label={t('fields.ots_mrad_out')} si={res.mRad} category="mass" unitId="kg" unitIds={TOOL_UNIT_SETS.mass} digits={4} />
                <ResultCard label={t('fields.ots_kgkw_rad')} value={formatNumber(res.kgPerKwRad, 3)} unit="kg/kW" />
              </>
            ) : null}
            {res.kgPerKwTotal != null ? (
              <ResultCard label={t('fields.ots_kgkw_total')} value={formatNumber(res.kgPerKwTotal, 3)} unit="kg/kW" accent />
            ) : null}
          </div>
        )
      }
      code={
        <CodeExport
          formulaId="odc-power-thermal-sizing"
          values={{
            P_it: pIt,
            a_oh: p.aoh,
            S: p.S,
            eta_cell: p.eta,
            fill: p.fill,
            cos_th: p.cos,
            q_net: p.qnet,
            sigma_pv: p.mpv,
            sigma_rad: p.mrad,
          }}
        />
      }
    />
  )
}
