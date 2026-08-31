import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { FieldPresets, PresetChip } from '@/components/shared/Field'
import { UiField } from '@/components/shared/UiField'
import { UiUnitField } from '@/components/shared/UiUnitField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import { fromSi, shieldKgPerKwVsSize, shieldMassScaling, TOOL_UNIT_SETS, toSi } from '@/lib/physics'
import { formatNumber } from '@/lib/physics/format'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const SCHEMA = {
  L: numParam(12.2, { min: 0.001 }),
  W: numParam(2.44, { min: 0.001 }),
  H: numParam(2.6, { min: 0.001 }),
  Lu: strParam('m', TOOL_UNIT_SETS.length),
  t: numParam(2, { min: 0.001 }),
  tu: strParam('mm', TOOL_UNIT_SETS.lengthSmall),
  rho: numParam(2700, { min: 1 }),
  extra: numParam(0, { min: 0 }),
  pv: numParam(50, { min: 0.001 }),
} as const

const SWEEP_SIDES = [1, 2, 4, 8, 12]

export function ShieldMassScalingTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const L = toSi(p.L, p.Lu)
  const W = toSi(p.W, p.Lu)
  const H = toSi(p.H, p.Lu)
  const thickness = toSi(p.t, p.tu)
  const powerDensity = p.pv * 1000

  const input = useMemo(
    () => ({ length: L, width: W, height: H, thickness, density: p.rho, extraArealMass: p.extra, powerDensity }),
    [L, W, H, thickness, p.rho, p.extra, powerDensity],
  )
  const res = useMemo(() => shieldMassScaling(input), [input])
  const sweep = useMemo(() => shieldKgPerKwVsSize(input, SWEEP_SIDES), [input])

  const setBox = (l: number, w: number, h: number) =>
    setP({ L: fromSi(l, p.Lu), W: fromSi(w, p.Lu), H: fromSi(h, p.Lu) })

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <FieldPresets label={t('common.presets')}>
            <PresetChip onClick={() => setBox(12.2, 2.44, 2.6)}>{t('fields.sms_preset_iso')}</PresetChip>
            <PresetChip onClick={() => setBox(2, 2, 2)}>{t('fields.sms_preset_cube2')}</PresetChip>
            <PresetChip onClick={() => setBox(8, 8, 8)}>{t('fields.sms_preset_cube8')}</PresetChip>
          </FieldPresets>
          <UiUnitField label={t('fields.sms_length')} category="length" unitIds={TOOL_UNIT_SETS.length} unitId={p.Lu} value={p.L} min={0.001} onValueChange={(L) => setP({ L })} onUnitChange={(Lu, L) => setP({ Lu, L, W: fromSi(W, Lu), H: fromSi(H, Lu) })} />
          <UiUnitField label={t('fields.sms_width')} category="length" unitIds={TOOL_UNIT_SETS.length} unitId={p.Lu} value={p.W} min={0.001} onValueChange={(W) => setP({ W })} onUnitChange={(Lu, W) => setP({ Lu, W, L: fromSi(L, Lu), H: fromSi(H, Lu) })} />
          <UiUnitField label={t('fields.sms_height')} category="length" unitIds={TOOL_UNIT_SETS.length} unitId={p.Lu} value={p.H} min={0.001} onValueChange={(H) => setP({ H })} onUnitChange={(Lu, H) => setP({ Lu, H, L: fromSi(L, Lu), W: fromSi(W, Lu) })} />
          <UiUnitField label={t('fields.sms_thickness')} category="length" unitIds={TOOL_UNIT_SETS.lengthSmall} unitId={p.tu} value={p.t} min={0.001} onValueChange={(t) => setP({ t })} onUnitChange={(tu, t) => setP({ tu, t })} />
          <UiField label={t('fields.sms_density')} unit="kg/m³" type="number" min={1} step="any" value={p.rho} onChange={(e) => setP({ rho: Number(e.target.value) })} />
          <UiField label={t('fields.sms_extra')} unit="kg/m²" type="number" min={0} step="any" value={p.extra} onChange={(e) => setP({ extra: Number(e.target.value) })} hint={t('fields.sms_extra_hint')} />
          <UiField label={t('fields.sms_pv')} unit={t('fields.sms_pv_unit')} type="number" min={0.001} step="any" value={p.pv} onChange={(e) => setP({ pv: Number(e.target.value) })} />
        </ParamsGrid>
      }
      results={
        !res ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard label={t('fields.sms_kgkw')} value={formatNumber(res.kgPerKw, 4)} unit="kg/kW" accent />
            <ResultCard label={t('fields.sms_mass')} si={res.shieldMass} category="mass" unitId="kg" unitIds={TOOL_UNIT_SETS.mass} digits={4} />
            <ResultCard label={t('fields.sms_power')} si={res.power} category="power" unitId="kW" unitIds={TOOL_UNIT_SETS.power} digits={4} />
            <ResultCard label={t('fields.sms_area')} si={res.surfaceArea} category="area" unitId="m2" unitIds={TOOL_UNIT_SETS.area} digits={4} />
            <ResultCard label={t('fields.sms_volume')} si={res.volume} category="volume" unitId="m3" unitIds={TOOL_UNIT_SETS.volume} digits={4} />
            <ResultCard label={t('fields.sms_areal')} value={formatNumber(res.arealDensity, 3)} unit="kg/m²" />
            <ResultCard label={t('fields.sms_areal_gcm2')} value={formatNumber(res.arealDensityGcm2, 4)} unit="g/cm²" tip={t('fields.sms_areal_gcm2_hint')} accent />
            <p className="col-span-full font-mono text-[10px] uppercase tracking-wider text-subtle">{t('fields.sms_scaling')}</p>
            {sweep.map((row) => (
              <ResultCard key={row.side} label={`L = ${formatNumber(row.side, 0)} m`} value={formatNumber(row.kgPerKw, 4)} unit="kg/kW" />
            ))}
          </div>
        )
      }
      code={
        <CodeExport
          formulaId="shield-mass-scaling"
          values={{ L, W, H, t: thickness, rho: p.rho, m_extra: p.extra, p_v: powerDensity }}
        />
      }
    />
  )
}
