import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { FieldNote, FieldPresets, PresetChip } from '@/components/shared/Field'
import { UiField } from '@/components/shared/UiField'
import { UiSelect } from '@/components/shared/UiSelect'
import { UiUtcField } from '@/components/shared/UiUtcField'
import { UiUnitField } from '@/components/shared/UiUnitField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import { WorldMap } from '@/components/viz/WorldMap'
import {
  EARTH_MU,
  EARTH_RADIUS,
  eciSiToGeodetic,
  groundTrack,
  groundTrackShiftPerOrbit,
  keplerGroundTrack,
  meanMotionFromAltitude,
  parseTle,
  SAMPLE_ISS_TLE,
  sunEciSi,
  TOOL_UNIT_SETS,
  toSi,
} from '@/lib/physics'
import { resolveUtcParam } from '@/lib/utc-input'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const SCHEMA = {
  mode: strParam('tle', ['tle', 'kepler']),
  h: numParam(400, { min: 0 }),
  hu: strParam('km', TOOL_UNIT_SETS.altitude),
  i: numParam(51.6),
  iu: strParam('deg', TOOL_UNIT_SETS.angle),
  raan: numParam(0),
  raanu: strParam('deg', TOOL_UNIT_SETS.angle),
  at: strParam(''),
  minutes: numParam(93, { min: 1 }),
  minutesu: strParam('min', TOOL_UNIT_SETS.time),
  samples: numParam(96, { min: 16, max: 400 }),
} as const

export function GroundTrackTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const [tle, setTle] = useState(SAMPLE_ISS_TLE)
  const durationS = toSi(p.minutes, p.minutesu)
  const h = toSi(p.h, p.hu)
  const iRad = toSi(p.i, p.iu)
  const raanRad = toSi(p.raan, p.raanu)
  const atDate = useMemo(() => resolveUtcParam(p.at), [p.at])
  const nSamples = Math.min(400, Math.max(16, Math.floor(p.samples)))
  const tleMode = p.mode === 'tle'

  const parsed = useMemo(() => parseTle(tle), [tle])

  const keplerMotion = useMemo(
    () => meanMotionFromAltitude(h, EARTH_MU, EARTH_RADIUS),
    [h],
  )

  const track = useMemo(() => {
    if (tleMode) {
      if (!parsed.ok) return []
      return groundTrack(parsed.satrec, atDate, durationS, nSamples)
    }
    if (!keplerMotion) return []
    return keplerGroundTrack({
      altitudeM: h,
      inclinationRad: iRad,
      raanRad,
      epoch: atDate,
      durationS,
      samples: nSamples,
    })
  }, [atDate, durationS, h, iRad, keplerMotion, nSamples, parsed, raanRad, tleMode])

  const dL = useMemo(() => {
    if (tleMode && parsed.ok) {
      const nRadMin = parsed.satrec.no
      if (!(nRadMin > 0)) return null
      return groundTrackShiftPerOrbit((2 * Math.PI) / (nRadMin / 60))
    }
    return keplerMotion ? groundTrackShiftPerOrbit(keplerMotion.period) : null
  }, [keplerMotion, parsed, tleMode])

  const subsolar = useMemo(() => {
    const g = eciSiToGeodetic(sunEciSi(atDate), atDate)
    return g ?? { latDeg: 0, lonDeg: 0 }
  }, [atDate])

  const error = tleMode
    ? !parsed.ok
      ? parsed.error
      : track.length < 2
        ? t('fields.propagation_failed')
        : null
    : !keplerMotion
      ? t('fields.invalid_altitude')
      : track.length < 2
        ? t('fields.invalid_params')
        : null

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <UiSelect
            label={t('fields.mode')}
            value={p.mode}
            onChange={(e) => setP({ mode: e.target.value })}
            options={[
              { value: 'tle', label: t('fields.mode_tle') },
              { value: 'kepler', label: t('fields.mode_kepler') },
            ]}
          />
          {tleMode ? (
            <>
              <label className="col-span-full block min-w-0 space-y-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  {t('fields.tle')}
                </span>
                <textarea
                  value={tle}
                  onChange={(e) => setTle(e.target.value)}
                  spellCheck={false}
                  rows={4}
                  className="w-full resize-y border border-border bg-bg px-3 py-2 font-mono text-xs leading-relaxed text-fg outline-none focus:border-border-strong"
                />
              </label>
              <FieldPresets label={t('common.presets')}>
                <PresetChip onClick={() => setTle(SAMPLE_ISS_TLE)}>{t('fields.load_sample_iss')}</PresetChip>
              </FieldPresets>
            </>
          ) : (
            <>
              <UiUnitField
                label={t('fields.altitude')}
                category="length"
                unitIds={TOOL_UNIT_SETS.altitude}
                unitId={p.hu}
                value={p.h}
                min={0}
                onValueChange={(h) => setP({ h })}
                onUnitChange={(hu, h) => setP({ hu, h })}
                hint={t('fields.hint_ground_track')}
              />
              <UiUnitField
                label={t('fields.inclination_i')}
                category="angle"
                unitIds={TOOL_UNIT_SETS.angle}
                unitId={p.iu}
                value={p.i}
                onValueChange={(i) => setP({ i })}
                onUnitChange={(iu, i) => setP({ iu, i })}
              />
              <UiUnitField
                label={t('fields.raan_2')}
                category="angle"
                unitIds={TOOL_UNIT_SETS.angle}
                unitId={p.raanu}
                value={p.raan}
                onValueChange={(raan) => setP({ raan })}
                onUnitChange={(raanu, raan) => setP({ raanu, raan })}
              />
            </>
          )}
          <UiUtcField
            label={t('fields.propagate_at_utc_iso')}
            value={p.at}
            onChange={(at) => setP({ at })}
            resolved={atDate}
          />
          <UiUnitField
            label={t('fields.duration')}
            category="time"
            unitIds={TOOL_UNIT_SETS.time}
            unitId={p.minutesu}
            value={p.minutes}
            min={1}
            onValueChange={(minutes) => setP({ minutes })}
            onUnitChange={(minutesu, minutes) => setP({ minutesu, minutes })}
          />
          <UiField
            label={t('fields.samples')}
            type="number"
            min={16}
            max={400}
            value={p.samples}
            onChange={(e) => setP({ samples: Number(e.target.value) })}
          />
          <FieldNote>
            {tleMode ? t('fields.propagator_sgp4') : t('fields.propagator_kepler')}
          </FieldNote>
        </ParamsGrid>
      }
      results={
        error ? (
          <p className="font-mono text-sm text-muted">{error}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard label={t('fields.track_samples')} value={String(track.length)} accent />
            <ResultCard
              label={t('fields.duration')}
              si={durationS}
              category="time"
              unitId="min"
              unitIds={TOOL_UNIT_SETS.time}
              digits={3}
            />
            {dL != null ? (
              <ResultCard
                label={t('fields.lon_rev_earth_rot')}
                si={dL}
                category="angle"
                unitId="deg"
                unitIds={TOOL_UNIT_SETS.angle}
                digits={4}
              />
            ) : null}
            <p className="col-span-full font-mono text-[11px] leading-relaxed text-muted">
              {t('fields.note_ground_track_dl')}{' '}
              <Link
                to="/tools/ground-track-shift"
                className="text-signal underline-offset-2 hover:underline"
              >
                {t('fields.ground_track_shift_link')}
              </Link>
            </p>
          </div>
        )
      }
      preview={
        track.length > 1 ? (
          <WorldMap
            tracks={[{ points: track }]}
            markers={[{ lat: track[0]!.lat, lon: track[0]!.lon, label: t('fields.marker_now') }]}
            subsolarLat={subsolar.latDeg}
            subsolarLon={subsolar.lonDeg}
            title={t('fields.title_ground_track_map')}
            subtitle={tleMode ? t('fields.subtitle_ground_track_tle') : t('fields.subtitle_ground_track_kepler')}
          />
        ) : null
      }
      code={
        <CodeExport
          formulaId="ground-track"
          values={{ h, mu: EARTH_MU, R: EARTH_RADIUS, i: iRad, raan: raanRad }}
        />
      }
    />
  )
}
