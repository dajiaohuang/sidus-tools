import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { BodySelect } from '@/components/shared/BodySelect'
import { UiUnitField } from '@/components/shared/UiUnitField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import { BODIES, getBody, lowThrustEscapeSpiral, TOOL_UNIT_SETS, toSi } from '@/lib/physics'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const SCHEMA = {
  body: strParam('earth', BODIES.map((b) => b.id)),
  h: numParam(400, { min: 0 }),
  hu: strParam('km', TOOL_UNIT_SETS.length),
} as const

export function LowThrustEscapeTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const body = getBody(p.body)
  const h = toSi(p.h, p.hu)
  const res = useMemo(() => lowThrustEscapeSpiral(body.mu, body.radius + h), [body.mu, body.radius, h])

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <BodySelect value={p.body} onChange={(body) => setP({ body })} />
          <UiUnitField
            label={t('fields.altitude')}
            category="length"
            unitIds={TOOL_UNIT_SETS.length}
            unitId={p.hu}
            value={p.h}
            min={0}
            onValueChange={(h) => setP({ h })}
            onUnitChange={(hu, h) => setP({ hu, h })}
            hint={t('fields.hint_spiral_escape')}
          />
        </ParamsGrid>
      }
      results={
        !res ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard
              label={t('fields.v_circ_park')}
              si={res.vCirc}
              category="velocity"
              unitId="kmps"
              unitIds={TOOL_UNIT_SETS.velocity}
              digits={4}
            />
            <ResultCard
              label={t('fields.dv_spiral_escape')}
              si={res.dvSpiral}
              category="velocity"
              unitId="kmps"
              unitIds={TOOL_UNIT_SETS.velocity}
              digits={4}
              accent
            />
            <ResultCard
              label={t('fields.dv_impulsive_escape')}
              si={res.dvImpulsive}
              category="velocity"
              unitId="kmps"
              unitIds={TOOL_UNIT_SETS.velocity}
              digits={4}
            />
          </div>
        )
      }
      code={
        <CodeExport
          formulaId="low-thrust-escape"
          values={{ mu: body.mu, r: body.radius + h, body: p.body }}
        />
      }
    />
  )
}
