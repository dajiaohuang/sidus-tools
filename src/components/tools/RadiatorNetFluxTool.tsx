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
import {
  fromSi,
  nadirPlateViewFactor,
  radiatorNetFlux,
  SOLAR_CONSTANT_1AU,
  TOOL_UNIT_SETS,
  toSi,
} from '@/lib/physics'
import { formatNumber } from '@/lib/physics/format'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const SIDES = ['2', '1'] as const
const IR_MODES = ['kirchhoff', 'custom'] as const

const SCHEMA = {
  T: numParam(20),
  Tu: strParam('C', TOOL_UNIT_SETS.temperature),
  eps: numParam(0.92, { min: 0.001, max: 1 }),
  alpha: numParam(0.09, { min: 0, max: 1 }),
  sides: strParam('2', SIDES),
  S: numParam(SOLAR_CONSTANT_1AU, { min: 1 }),
  fsun: numParam(1, { min: 0, max: 1 }),
  F: numParam(0.25, { min: 0, max: 1 }),
  alb: numParam(0.3, { min: 0, max: 1 }),
  Te: numParam(255, { min: 1 }),
  Teu: strParam('K', TOOL_UNIT_SETS.temperature),
  ir: strParam('kirchhoff', IR_MODES),
  air: numParam(0.09, { min: 0, max: 1 }),
  h: numParam(500, { min: 0 }),
  hu: strParam('km', TOOL_UNIT_SETS.altitude),
} as const

/** NASA RP-1121 (Henninger 1984) alpha / epsilon pairs. */
const COATINGS = [
  { labelKey: 'fields.rnf_preset_z93', alpha: 0.17, eps: 0.92 },
  { labelKey: 'fields.rnf_preset_teflon', alpha: 0.08, eps: 0.81 },
  { labelKey: 'fields.rnf_preset_z306', alpha: 0.96, eps: 0.91 },
] as const

export function RadiatorNetFluxTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const tK = toSi(p.T, p.Tu)
  const teK = toSi(p.Te, p.Teu)
  const h = toSi(p.h, p.hu)
  const sides = p.sides === '1' ? 1 : 2
  const alphaIr = p.ir === 'custom' ? p.air : p.eps

  const res = useMemo(
    () =>
      radiatorNetFlux({
        tempK: tK,
        emissivity: p.eps,
        absorptivity: p.alpha,
        sides,
        solarFlux: p.S,
        sunExposure: p.fsun,
        viewFactor: p.F,
        albedo: p.alb,
        earthTempK: teK,
        irAbsorptivity: alphaIr,
      }),
    [tK, p.eps, p.alpha, sides, p.S, p.fsun, p.F, p.alb, teK, alphaIr],
  )
  const fNadir = useMemo(() => nadirPlateViewFactor(h), [h])

  const applyWhitePaper = () =>
    setP({
      T: fromSi(293.15, p.Tu),
      eps: 0.92,
      alpha: 0.09,
      sides: '2',
      S: 1366,
      fsun: 1,
      F: 0.25,
      alb: 0.3,
      Te: fromSi(253.15, p.Teu),
      ir: 'custom',
      air: 0.09,
    })

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <FieldPresets label={t('common.presets')}>
            {COATINGS.map((c) => (
              <PresetChip key={c.labelKey} onClick={() => setP({ alpha: c.alpha, eps: c.eps })}>
                {t(c.labelKey)}
              </PresetChip>
            ))}
            <PresetChip onClick={applyWhitePaper}>{t('fields.rnf_preset_wp')}</PresetChip>
          </FieldPresets>
          <UiUnitField
            label={t('fields.rnf_temp')}
            category="temperature"
            unitIds={TOOL_UNIT_SETS.temperature}
            unitId={p.Tu}
            value={p.T}
            onValueChange={(T) => setP({ T })}
            onUnitChange={(Tu, T) => setP({ Tu, T })}
          />
          <UiField
            label={t('fields.emissivity')}
            type="number"
            min={0.001}
            max={1}
            step={0.01}
            value={p.eps}
            onChange={(e) => setP({ eps: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.rnf_alpha')}
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={p.alpha}
            onChange={(e) => setP({ alpha: Number(e.target.value) })}
          />
          <UiSelect
            label={t('fields.rnf_sides')}
            value={p.sides}
            onChange={(e) => setP({ sides: e.target.value })}
            options={[
              { value: '2', label: t('fields.rnf_sides_2') },
              { value: '1', label: t('fields.rnf_sides_1') },
            ]}
          />
          <UiField
            label={t('fields.rnf_solar_flux')}
            unit="W/m²"
            type="number"
            min={1}
            step="any"
            value={p.S}
            onChange={(e) => setP({ S: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.rnf_sun_exposure')}
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={p.fsun}
            onChange={(e) => setP({ fsun: Number(e.target.value) })}
            hint={t('fields.rnf_sun_exposure_hint')}
          />
          <UiField
            label={t('fields.rnf_view_factor')}
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={p.F}
            onChange={(e) => setP({ F: Number(e.target.value) })}
            hint={t('fields.rnf_view_factor_hint')}
          />
          <UiField
            label={t('fields.rnf_albedo')}
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={p.alb}
            onChange={(e) => setP({ alb: Number(e.target.value) })}
          />
          <UiUnitField
            label={t('fields.rnf_earth_temp')}
            category="temperature"
            unitIds={TOOL_UNIT_SETS.temperature}
            unitId={p.Teu}
            value={p.Te}
            onValueChange={(Te) => setP({ Te })}
            onUnitChange={(Teu, Te) => setP({ Teu, Te })}
          />
          <UiSelect
            label={t('fields.rnf_ir_mode')}
            value={p.ir}
            onChange={(e) => setP({ ir: e.target.value })}
            options={[
              { value: 'kirchhoff', label: t('fields.rnf_ir_kirchhoff') },
              { value: 'custom', label: t('fields.rnf_ir_custom') },
            ]}
            hint={t('fields.rnf_ir_custom_hint')}
          />
          {p.ir === 'custom' ? (
            <UiField
              label={t('fields.rnf_ir_custom')}
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={p.air}
              onChange={(e) => setP({ air: Number(e.target.value) })}
            />
          ) : null}
          <UiUnitField
            label={t('fields.rnf_ref_altitude')}
            category="length"
            unitIds={TOOL_UNIT_SETS.altitude}
            unitId={p.hu}
            value={p.h}
            min={0}
            onValueChange={(h) => setP({ h })}
            onUnitChange={(hu, h) => setP({ hu, h })}
          />
        </ParamsGrid>
      }
      results={
        !res ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard
              label={t('fields.rnf_q_net')}
              si={res.qNet}
              category="heatFlux"
              unitId="Wm2"
              unitIds={TOOL_UNIT_SETS.heatFlux}
              digits={2}
              accent
            />
            {res.areaPerKw != null ? (
              <ResultCard label={t('fields.rnf_area_per_kw')} value={formatNumber(res.areaPerKw, 3)} unit={t('fields.rnf_area_per_kw_unit')} accent />
            ) : (
              <ResultCard label={t('fields.rnf_area_per_kw')} value={t('fields.rnf_no_net')} />
            )}
            <ResultCard label={t('fields.rnf_q_emit')} si={res.qEmit} category="heatFlux" unitId="Wm2" unitIds={TOOL_UNIT_SETS.heatFlux} digits={2} />
            <ResultCard label={t('fields.rnf_q_sun')} si={res.qSun} category="heatFlux" unitId="Wm2" unitIds={TOOL_UNIT_SETS.heatFlux} digits={2} />
            <ResultCard label={t('fields.rnf_q_albedo')} si={res.qAlbedo} category="heatFlux" unitId="Wm2" unitIds={TOOL_UNIT_SETS.heatFlux} digits={2} />
            <ResultCard label={t('fields.rnf_q_ir')} si={res.qIr} category="heatFlux" unitId="Wm2" unitIds={TOOL_UNIT_SETS.heatFlux} digits={2} />
            <ResultCard label={t('fields.rnf_t_floor')} si={res.tFloorK} category="temperature" unitId="K" unitIds={TOOL_UNIT_SETS.temperature} digits={1} />
            {fNadir != null ? (
              <ResultCard label={t('fields.rnf_f_nadir')} value={formatNumber(fNadir, 4)} />
            ) : null}
          </div>
        )
      }
      code={
        <CodeExport
          formulaId="radiator-net-flux"
          values={{
            T: tK,
            eps: p.eps,
            alpha: p.alpha,
            n_sides: sides,
            S: p.S,
            f_sun: p.fsun,
            F: p.F,
            albedo: p.alb,
            Te: teK,
            alpha_ir: alphaIr,
          }}
        />
      }
    />
  )
}
