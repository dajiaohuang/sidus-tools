import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { FieldPresets, PresetChip } from '@/components/shared/Field'
import { UiField } from '@/components/shared/UiField'
import { UiSelect } from '@/components/shared/UiSelect'
import { UiUnitField } from '@/components/shared/UiUnitField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import { fromSi, radiatorHeatPump, TOOL_UNIT_SETS, toSi } from '@/lib/physics'
import { formatNumber } from '@/lib/physics/format'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const MODES = ['cop', 'carnot'] as const
const SIDES = ['1', '2'] as const
const TBASE = ['same', 'custom'] as const

const SCHEMA = {
  Q: numParam(5, { min: 0.001 }),
  Qu: strParam('kW', TOOL_UNIT_SETS.power),
  Tc: numParam(45),
  Tcu: strParam('C', TOOL_UNIT_SETS.temperature),
  Th: numParam(100),
  Thu: strParam('C', TOOL_UNIT_SETS.temperature),
  mode: strParam('cop', MODES),
  cop: numParam(2.3, { min: 0.01 }),
  eta: numParam(0.4, { min: 0.01, max: 1 }),
  eps: numParam(0.85, { min: 0.001, max: 1 }),
  sides: strParam('1', SIDES),
  qenv: numParam(150, { min: 0 }),
  tb: strParam('same', TBASE),
  Tb: numParam(45),
  Tbu: strParam('C', TOOL_UNIT_SETS.temperature),
  qpv: numParam(270.5, { min: 0 }),
} as const

export function RadiatorHeatPumpTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const Q = toSi(p.Q, p.Qu)
  const tcK = toSi(p.Tc, p.Tcu)
  const thK = toSi(p.Th, p.Thu)
  const tBaseK = p.tb === 'custom' ? toSi(p.Tb, p.Tbu) : tcK
  const sides = p.sides === '2' ? 2 : 1

  const res = useMemo(
    () =>
      radiatorHeatPump({
        q: Q,
        tColdK: tcK,
        tHotK: thK,
        cop: p.mode === 'cop' ? p.cop : undefined,
        carnotFraction: p.mode === 'carnot' ? p.eta : undefined,
        emissivity: p.eps,
        sides,
        qEnv: p.qenv,
        tBaseK,
        pvPowerDensity: p.qpv,
      }),
    [Q, tcK, thK, p.mode, p.cop, p.eta, p.eps, sides, p.qenv, tBaseK, p.qpv],
  )

  const applyIces = () =>
    setP({
      Q: fromSi(5000, p.Qu),
      Tc: fromSi(318.15, p.Tcu),
      Th: fromSi(373.15, p.Thu),
      mode: 'cop',
      cop: 2.3,
      eps: 0.85,
      sides: '1',
      qenv: 150,
      tb: 'same',
    })

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <FieldPresets label={t('common.presets')}>
            <PresetChip onClick={applyIces}>{t('fields.rhp_preset_ices')}</PresetChip>
          </FieldPresets>
          <UiUnitField
            label={t('fields.rhp_q')}
            category="power"
            unitIds={TOOL_UNIT_SETS.power}
            unitId={p.Qu}
            value={p.Q}
            min={0.001}
            onValueChange={(Q) => setP({ Q })}
            onUnitChange={(Qu, Q) => setP({ Qu, Q })}
          />
          <UiUnitField
            label={t('fields.rhp_tc')}
            category="temperature"
            unitIds={TOOL_UNIT_SETS.temperature}
            unitId={p.Tcu}
            value={p.Tc}
            onValueChange={(Tc) => setP({ Tc })}
            onUnitChange={(Tcu, Tc) => setP({ Tcu, Tc })}
          />
          <UiUnitField
            label={t('fields.rhp_th')}
            category="temperature"
            unitIds={TOOL_UNIT_SETS.temperature}
            unitId={p.Thu}
            value={p.Th}
            onValueChange={(Th) => setP({ Th })}
            onUnitChange={(Thu, Th) => setP({ Thu, Th })}
          />
          <UiSelect
            label={t('fields.rhp_mode')}
            value={p.mode}
            onChange={(e) => setP({ mode: e.target.value })}
            options={[
              { value: 'cop', label: t('fields.rhp_mode_cop') },
              { value: 'carnot', label: t('fields.rhp_mode_carnot') },
            ]}
          />
          {p.mode === 'cop' ? (
            <UiField
              label={t('fields.rhp_cop')}
              type="number"
              min={0.01}
              step={0.05}
              value={p.cop}
              onChange={(e) => setP({ cop: Number(e.target.value) })}
            />
          ) : (
            <UiField
              label={t('fields.rhp_eta_ii')}
              type="number"
              min={0.01}
              max={1}
              step={0.05}
              value={p.eta}
              onChange={(e) => setP({ eta: Number(e.target.value) })}
            />
          )}
          <UiField
            label={t('fields.emissivity')}
            type="number"
            min={0.001}
            max={1}
            step={0.01}
            value={p.eps}
            onChange={(e) => setP({ eps: Number(e.target.value) })}
          />
          <UiSelect
            label={t('fields.rhp_sides')}
            value={p.sides}
            onChange={(e) => setP({ sides: e.target.value })}
            options={[
              { value: '1', label: t('fields.rnf_sides_1') },
              { value: '2', label: t('fields.rnf_sides_2') },
            ]}
          />
          <UiField
            label={t('fields.rhp_qenv')}
            unit="W/m²"
            type="number"
            min={0}
            step="any"
            value={p.qenv}
            onChange={(e) => setP({ qenv: Number(e.target.value) })}
          />
          <UiSelect
            label={t('fields.rhp_tbase_mode')}
            value={p.tb}
            onChange={(e) => setP({ tb: e.target.value })}
            options={[
              { value: 'same', label: t('fields.rhp_tbase_same') },
              { value: 'custom', label: t('fields.rhp_tbase_custom') },
            ]}
          />
          {p.tb === 'custom' ? (
            <UiUnitField
              label={t('fields.rhp_tbase')}
              category="temperature"
              unitIds={TOOL_UNIT_SETS.temperature}
              unitId={p.Tbu}
              value={p.Tb}
              onValueChange={(Tb) => setP({ Tb })}
              onUnitChange={(Tbu, Tb) => setP({ Tbu, Tb })}
            />
          ) : null}
          <UiField
            label={t('fields.rhp_qpv')}
            unit="W/m²"
            type="number"
            min={0}
            step="any"
            value={p.qpv}
            onChange={(e) => setP({ qpv: Number(e.target.value) })}
            hint={t('fields.rhp_qpv_hint')}
          />
        </ParamsGrid>
      }
      results={
        !res ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard label={t('fields.rhp_qrej')} si={res.qRej} category="power" unitId="kW" unitIds={TOOL_UNIT_SETS.power} digits={3} accent />
            <ResultCard label={t('fields.rhp_work')} si={res.work} category="power" unitId="kW" unitIds={TOOL_UNIT_SETS.power} digits={3} />
            <ResultCard label={t('fields.rhp_cop')} value={formatNumber(res.cop, 3)} />
            <ResultCard label={t('fields.rhp_cop_carnot')} value={formatNumber(res.copCarnot, 3)} />
            <ResultCard label={t('fields.rhp_eta_ii')} value={formatNumber(res.carnotFraction, 3)} />
            <ResultCard label={t('fields.rhp_overhead')} value={(res.overhead * 100).toFixed(1)} unit="%" />
            <ResultCard label={t('fields.rhp_qnet_base')} si={res.qNetBase} category="heatFlux" unitId="Wm2" unitIds={TOOL_UNIT_SETS.heatFlux} digits={1} />
            <ResultCard label={t('fields.rhp_qnet_hp')} si={res.qNetHp} category="heatFlux" unitId="Wm2" unitIds={TOOL_UNIT_SETS.heatFlux} digits={1} />
            {res.aBase != null && res.aHp != null && res.areaSaved != null && res.areaReduction != null ? (
              <>
                <ResultCard label={t('fields.rhp_abase')} si={res.aBase} category="area" unitId="m2" unitIds={TOOL_UNIT_SETS.area} digits={3} />
                <ResultCard label={t('fields.rhp_ahp')} si={res.aHp} category="area" unitId="m2" unitIds={TOOL_UNIT_SETS.area} digits={3} accent />
                <ResultCard label={t('fields.rhp_saved')} si={res.areaSaved} category="area" unitId="m2" unitIds={TOOL_UNIT_SETS.area} digits={3} />
                <ResultCard label={t('fields.rhp_reduction')} value={(res.areaReduction * 100).toFixed(1)} unit="%" />
                {res.extraPvArea != null && res.netAreaSaved != null ? (
                  <>
                    <ResultCard label={t('fields.rhp_extra_pv')} si={res.extraPvArea} category="area" unitId="m2" unitIds={TOOL_UNIT_SETS.area} digits={3} />
                    <ResultCard label={t('fields.rhp_net_saved')} si={res.netAreaSaved} category="area" unitId="m2" unitIds={TOOL_UNIT_SETS.area} digits={3} accent />
                  </>
                ) : null}
              </>
            ) : (
              <ResultCard label={t('fields.rhp_abase')} value={t('fields.rhp_no_area')} />
            )}
          </div>
        )
      }
      code={
        res ? (
          <CodeExport
            formulaId="radiator-heat-pump"
            values={{
              Q,
              T_c: tcK,
              T_h: thK,
              eta_II: res.carnotFraction,
              eps: p.eps,
              n_sides: sides,
              q_env: p.qenv,
              T_base: tBaseK,
              q_pv: p.qpv,
            }}
          />
        ) : null
      }
    />
  )
}
