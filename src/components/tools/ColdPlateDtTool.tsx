// src/components/tools/ColdPlateDtTool.tsx
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { FieldPresets, PresetChip } from '@/components/shared/Field'
import { UiField } from '@/components/shared/UiField'
import { UiUnitField } from '@/components/shared/UiUnitField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import { coldPlateChain, fromSi, TOOL_UNIT_SETS, toSi } from '@/lib/physics'
import { formatNumber } from '@/lib/physics/format'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const SCHEMA = {
  Q: numParam(700, { min: 0.001 }),
  Qu: strParam('W', TOOL_UNIT_SETS.power),
  Adie: numParam(814, { min: 0.001 }),
  Au: strParam('mm2', TOOL_UNIT_SETS.area),
  Rjc: numParam(0.05, { min: 0 }),
  ttim: numParam(50, { min: 0.001 }),
  tu: strParam('um', TOOL_UNIT_SETS.lengthSmall),
  ktim: numParam(5, { min: 0.001 }),
  Atim: numParam(814, { min: 0.001 }),
  Atu: strParam('mm2', TOOL_UNIT_SETS.area),
  h: numParam(30000, { min: 0.001 }),
  Awet: numParam(814, { min: 0.001 }),
  Awu: strParam('mm2', TOOL_UNIT_SETS.area),
  mdot: numParam(0.05, { min: 0.000001 }),
  mdu: strParam('kgps', TOOL_UNIT_SETS.massFlow),
  cp: numParam(4184, { min: 1 }),
  Tin: numParam(20),
  Tiu: strParam('C', TOOL_UNIT_SETS.temperature),
} as const

export function ColdPlateDtTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const Q = toSi(p.Q, p.Qu)
  const aDie = toSi(p.Adie, p.Au)
  const tTim = toSi(p.ttim, p.tu)
  const aTim = toSi(p.Atim, p.Atu)
  const aWet = toSi(p.Awet, p.Awu)
  const mdot = toSi(p.mdot, p.mdu)
  const tIn = toSi(p.Tin, p.Tiu)

  const res = useMemo(
    () =>
      coldPlateChain({
        q: Q,
        dieArea: aDie,
        rJc: p.Rjc,
        timThickness: tTim,
        timK: p.ktim,
        timArea: aTim,
        hCoolant: p.h,
        wettedArea: aWet,
        mdot,
        cp: p.cp,
        tInK: tIn,
      }),
    [Q, aDie, p.Rjc, tTim, p.ktim, aTim, p.h, aWet, mdot, p.cp, tIn],
  )

  const applyH100 = () =>
    setP({
      Q: fromSi(700, p.Qu),
      Adie: fromSi(814e-6, p.Au),
      Atim: fromSi(814e-6, p.Atu),
      Awet: fromSi(814e-6, p.Awu),
    })

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <FieldPresets label={t('common.presets')}>
            <PresetChip onClick={applyH100}>{t('fields.cpd_preset_h100')}</PresetChip>
          </FieldPresets>
          <UiUnitField label={t('fields.cpd_q')} category="power" unitIds={TOOL_UNIT_SETS.power} unitId={p.Qu} value={p.Q} min={0.001} onValueChange={(Q) => setP({ Q })} onUnitChange={(Qu, Q) => setP({ Qu, Q })} />
          <UiUnitField label={t('fields.cpd_die')} category="area" unitIds={TOOL_UNIT_SETS.area} unitId={p.Au} value={p.Adie} min={0.001} onValueChange={(Adie) => setP({ Adie })} onUnitChange={(Au, Adie) => setP({ Au, Adie })} />
          <UiField label={t('fields.cpd_rjc')} unit={t('fields.cpd_kw_unit')} type="number" min={0} step="any" value={p.Rjc} onChange={(e) => setP({ Rjc: Number(e.target.value) })} hint={t('fields.cpd_rjc_hint')} />
          <UiUnitField label={t('fields.cpd_ttim')} category="length" unitIds={TOOL_UNIT_SETS.lengthSmall} unitId={p.tu} value={p.ttim} min={0.001} onValueChange={(ttim) => setP({ ttim })} onUnitChange={(tu, ttim) => setP({ tu, ttim })} />
          <UiField label={t('fields.cpd_ktim')} unit="W/(m·K)" type="number" min={0.001} step="any" value={p.ktim} onChange={(e) => setP({ ktim: Number(e.target.value) })} />
          <UiUnitField label={t('fields.cpd_atim')} category="area" unitIds={TOOL_UNIT_SETS.area} unitId={p.Atu} value={p.Atim} min={0.001} onValueChange={(Atim) => setP({ Atim })} onUnitChange={(Atu, Atim) => setP({ Atu, Atim })} />
          <UiField label={t('fields.cpd_h')} unit="W/(m²·K)" type="number" min={0.001} step="any" value={p.h} onChange={(e) => setP({ h: Number(e.target.value) })} />
          <UiUnitField label={t('fields.cpd_awet')} category="area" unitIds={TOOL_UNIT_SETS.area} unitId={p.Awu} value={p.Awet} min={0.001} onValueChange={(Awet) => setP({ Awet })} onUnitChange={(Awu, Awet) => setP({ Awu, Awet })} />
          <UiUnitField label={t('fields.cpd_mdot')} category="massFlow" unitIds={TOOL_UNIT_SETS.massFlow} unitId={p.mdu} value={p.mdot} min={0.000001} onValueChange={(mdot) => setP({ mdot })} onUnitChange={(mdu, mdot) => setP({ mdu, mdot })} />
          <UiField label={t('fields.cpd_cp')} unit="J/(kg·K)" type="number" min={1} step="any" value={p.cp} onChange={(e) => setP({ cp: Number(e.target.value) })} />
          <UiUnitField label={t('fields.cpd_tin')} category="temperature" unitIds={TOOL_UNIT_SETS.temperature} unitId={p.Tiu} value={p.Tin} onValueChange={(Tin) => setP({ Tin })} onUnitChange={(Tiu, Tin) => setP({ Tiu, Tin })} />
        </ParamsGrid>
      }
      results={
        !res ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard label={t('fields.cpd_tj')} si={res.tJunctionK} category="temperature" unitId="C" unitIds={TOOL_UNIT_SETS.temperature} digits={2} accent />
            <ResultCard label={t('fields.cpd_flux')} si={res.heatFluxDie} category="heatFlux" unitId="Wcm2" unitIds={TOOL_UNIT_SETS.heatFlux} digits={2} accent />
            <ResultCard label={t('fields.cpd_tcase')} si={res.tCaseK} category="temperature" unitId="C" unitIds={TOOL_UNIT_SETS.temperature} digits={2} />
            <ResultCard label={t('fields.cpd_twall')} si={res.tWallK} category="temperature" unitId="C" unitIds={TOOL_UNIT_SETS.temperature} digits={2} />
            <ResultCard label={t('fields.cpd_dtf')} value={formatNumber(res.dTFluid, 3)} unit="K" />
            <ResultCard label={t('fields.cpd_rtim')} value={formatNumber(res.rTim, 5)} unit={t('fields.cpd_kw_unit')} />
            <ResultCard label={t('fields.cpd_rconv')} value={formatNumber(res.rConv, 5)} unit={t('fields.cpd_kw_unit')} />
            <ResultCard label={t('fields.cpd_rtot')} value={formatNumber(res.rTotal, 5)} unit={t('fields.cpd_kw_unit')} />
          </div>
        )
      }
      code={
        <CodeExport
          formulaId="cold-plate-dt"
          values={{ Q, A_die: aDie, R_jc: p.Rjc, t_tim: tTim, k_tim: p.ktim, A_tim: aTim, h: p.h, A_wet: aWet, mdot, cp: p.cp, T_in: tIn }}
        />
      }
    />
  )
}
