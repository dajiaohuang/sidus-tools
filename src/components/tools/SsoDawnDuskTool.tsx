import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { FieldPresets, PresetChip } from '@/components/shared/Field'
import { UiField } from '@/components/shared/UiField'
import { UiUnitField } from '@/components/shared/UiUnitField'
import { UiUtcField } from '@/components/shared/UiUtcField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import {
  dawnDuskBeta,
  dawnDuskSeason,
  EARTH_J2,
  EARTH_MU,
  EARTH_RADIUS,
  julianDay,
  OMEGA_SUN,
  TOOL_UNIT_SETS,
  toSi,
} from '@/lib/physics'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'
import { resolveUtcParam } from '@/lib/utc-input'

const SCHEMA = {
  h: numParam(550, { min: 0 }),
  hu: strParam('km', TOOL_UNIT_SETS.altitude),
  ltan: numParam(18, { min: 0, max: 23.99 }),
  at: strParam(''),
} as const

const LTAN_CHIPS = [
  { labelKey: 'fields.sdd_preset_dawn', ltan: 6 },
  { labelKey: 'fields.sdd_preset_dusk', ltan: 18 },
  { labelKey: 'fields.sdd_preset_atrain', ltan: 13.5 },
  { labelKey: 'fields.sdd_preset_ltdn1030', ltan: 22.5 },
] as const

export function SsoDawnDuskTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const h = toSi(p.h, p.hu)
  const date = useMemo(() => resolveUtcParam(p.at), [p.at])
  const res = useMemo(() => dawnDuskBeta({ altitudeM: h, ltanHours: p.ltan, date }), [h, p.ltan, date])
  const year = date.getUTCFullYear()
  const season = useMemo(() => dawnDuskSeason({ altitudeM: h, ltanHours: p.ltan, year }), [h, p.ltan, year])

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <UiUnitField
            label={t('fields.altitude')}
            category="length"
            unitIds={TOOL_UNIT_SETS.altitude}
            unitId={p.hu}
            value={p.h}
            min={0}
            onValueChange={(h) => setP({ h })}
            onUnitChange={(hu, h) => setP({ hu, h })}
          />
          <UiField
            label={t('fields.sdd_ltan')}
            unit="h"
            type="number"
            min={0}
            max={23.99}
            step={0.25}
            value={p.ltan}
            onChange={(e) => setP({ ltan: Number(e.target.value) })}
            hint={t('fields.sdd_ltan_hint')}
          />
          <FieldPresets label={t('common.presets')}>
            {LTAN_CHIPS.map((c) => (
              <PresetChip key={c.labelKey} active={p.ltan === c.ltan} onClick={() => setP({ ltan: c.ltan })}>
                {t(c.labelKey)}
              </PresetChip>
            ))}
          </FieldPresets>
          <UiUtcField label={t('fields.sdd_epoch')} value={p.at} onChange={(at) => setP({ at })} resolved={date} />
        </ParamsGrid>
      }
      results={
        !res ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard label={t('fields.sdd_beta_now')} si={res.betaRad} category="angle" unitId="deg" unitIds={TOOL_UNIT_SETS.angle} digits={3} accent />
            <ResultCard label={t('fields.sdd_beta_star')} si={res.betaStarRad} category="angle" unitId="deg" unitIds={TOOL_UNIT_SETS.angle} digits={3} />
            {res.eclipseS > 0 ? (
              <ResultCard label={t('fields.sdd_ecl_on_date')} si={res.eclipseS} category="time" unitId="pretty" unitIds={TOOL_UNIT_SETS.timePretty} digits={4} accent />
            ) : (
              <ResultCard label={t('fields.sdd_ecl_on_date')} value={t('fields.sdd_no_eclipse')} />
            )}
            <ResultCard label={t('fields.fraction')} value={(res.eclipseFraction * 100).toFixed(2)} unit="%" />
            <ResultCard label={t('fields.sdd_incl')} si={res.inclRad} category="angle" unitId="deg" unitIds={TOOL_UNIT_SETS.angle} digits={4} />
            <ResultCard label={t('fields.orbit_period')} si={res.periodS} category="time" unitId="pretty" unitIds={TOOL_UNIT_SETS.timePretty} digits={4} />
            <ResultCard label={t('fields.sdd_sun_decl')} si={res.sunDeclRad} category="angle" unitId="deg" unitIds={TOOL_UNIT_SETS.angle} digits={3} />
            {season ? (
              <>
                <p className="col-span-full font-mono text-[10px] uppercase tracking-wider text-subtle">
                  {t('fields.sdd_season_title')} {year}
                </p>
                <ResultCard label={t('fields.sdd_beta_min')} si={season.betaMinAbsRad} category="angle" unitId="deg" unitIds={TOOL_UNIT_SETS.angle} digits={2} />
                <ResultCard label={t('fields.sdd_beta_max')} si={season.betaMaxAbsRad} category="angle" unitId="deg" unitIds={TOOL_UNIT_SETS.angle} digits={2} />
                <ResultCard label={t('fields.sdd_ecl_days')} value={String(season.eclipseDays)} unit={t('fields.sdd_ecl_days_unit')} accent />
                {season.firstEclipseDoy != null && season.lastEclipseDoy != null ? (
                  <>
                    <ResultCard label={t('fields.sdd_first_doy')} value={String(season.firstEclipseDoy)} unit={t('fields.sdd_doy_unit')} />
                    <ResultCard label={t('fields.sdd_last_doy')} value={String(season.lastEclipseDoy)} unit={t('fields.sdd_doy_unit')} />
                    <ResultCard label={t('fields.sdd_max_ecl')} si={season.maxEclipseS} category="time" unitId="pretty" unitIds={TOOL_UNIT_SETS.timePretty} digits={4} />
                  </>
                ) : (
                  <ResultCard label={t('fields.sdd_max_ecl')} value={t('fields.sdd_no_eclipse')} />
                )}
              </>
            ) : null}
          </div>
        )
      }
      code={
        <CodeExport
          formulaId="sso-dawn-dusk"
          values={{
            h,
            ltan_h: p.ltan,
            jd: julianDay(date),
            mu: EARTH_MU,
            R: EARTH_RADIUS,
            J2: EARTH_J2,
            omega_sun: OMEGA_SUN,
          }}
        />
      }
    />
  )
}
