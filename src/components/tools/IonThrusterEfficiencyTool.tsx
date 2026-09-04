import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { UiField } from '@/components/shared/UiField'
import { UiUnitField } from '@/components/shared/UiUnitField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import { TOOL_UNIT_SETS, ionThrusterBudget, toSi } from '@/lib/physics'
import { formatNumber } from '@/lib/physics/format'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const SCHEMA = {
  T: numParam(0.05, { min: 1e-9 }),
  mdot: numParam(0.000001, { min: 1e-12 }),
  P: numParam(1500, { min: 0.000001 }),
  mDry: numParam(0, { min: 0 }),
  mu: strParam('kg', TOOL_UNIT_SETS.mass),
} as const

export function IonThrusterEfficiencyTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const res = useMemo(() => {
    const mDry = toSi(p.mDry, p.mu)
    return ionThrusterBudget(p.T, p.mdot, p.P, mDry > 0 ? mDry : undefined)
  }, [p])

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <UiField
            label={t('fields.disc_t')}
            type="number"
            min={1e-9}
            step="any"
            value={p.T}
            onChange={(e) => setP({ T: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.mdot')}
            type="number"
            min={1e-12}
            step="any"
            value={p.mdot}
            onChange={(e) => setP({ mdot: Number(e.target.value) })}
          />
          <UiField
            label={t('fields.disc_p')}
            type="number"
            min={0.000001}
            step="any"
            value={p.P}
            onChange={(e) => setP({ P: Number(e.target.value) })}
          />
          <UiUnitField
            label={t('fields.dry_mass')}
            category="mass"
            unitIds={TOOL_UNIT_SETS.mass}
            unitId={p.mu}
            value={p.mDry}
            min={0}
            onValueChange={(mDry) => setP({ mDry })}
            onUnitChange={(mu, mDry) => setP({ mu, mDry })}
            hint={t('fields.hint_dry_mass_alpha')}
          />
        </ParamsGrid>
      }
      results={
        !res ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard label={t('fields.eta')} value={formatNumber(res.eta, 6)} accent />
            <ResultCard
              label={t('fields.disc_ve')}
              si={res.ve}
              category="velocity"
              unitId="kmps"
              unitIds={TOOL_UNIT_SETS.velocity}
              digits={4}
            />
            <ResultCard label={t('fields.isp')} value={formatNumber(res.isp, 4)} unit="s" />
            {res.alpha != null ? (
              <ResultCard label={t('fields.vehicle_alpha')} value={formatNumber(res.alpha, 4)} unit="W/kg" />
            ) : null}
          </div>
        )
      }
      code={<CodeExport formulaId="ion-thruster-efficiency" values={{ T: p.T, mdot: p.mdot, P: p.P }} />}
    />
  )
}
