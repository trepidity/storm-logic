import { useEffect, useMemo, useState } from 'react'
import { fetchHourlyAirQuality } from '../lib/api.js'
import { deriveRunWindows } from '../lib/runWindows.js'
import { formatClock } from '../lib/format.js'

const RUN_DURATION_MINUTES = 120
const TIER_LABELS = ['Least constrained', 'Noted', 'Marked', 'Severe constraint']

/** Current-day, evidence-first running windows; never a safety recommendation. */
export default function RunWindows({ day, currentTime, place, units }) {
  const [air, setAir] = useState({ status: 'loading', byTime: null })

  useEffect(() => {
    const controller = new AbortController()
    setAir({ status: 'loading', byTime: null })
    fetchHourlyAirQuality({ latitude: place.latitude, longitude: place.longitude }, controller.signal)
      .then((byTime) => setAir(byTime ? { status: 'ready', byTime } : { status: 'partial', byTime: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setAir({ status: error.code === 'coverage' ? 'partial' : 'unavailable', byTime: null })
      })
    return () => controller.abort()
  }, [place.latitude, place.longitude])

  const result = useMemo(() => {
    if (air.status !== 'ready') return { status: air.status, windows: [] }
    return deriveRunWindows({
      hours: day?.hours,
      aqiByTime: air.byTime,
      currentTime,
      durationMinutes: RUN_DURATION_MINUTES,
      unitId: units.id,
    })
  }, [air, currentTime, day?.hours, units.id])

  return (
    <section className="run-windows" aria-label="Run windows">
      <div className="run-windows__head">
        <span className="metric__label">Run window</span>
        <span className="run-windows__duration">2 hours</span>
      </div>

      {result.status === 'loading' ? <p className="run-windows__status">Loading hourly air quality…</p> : null}
      {result.status === 'partial' ? <p className="run-windows__status">Hourly US AQI is unavailable for this location; run windows are not ranked.</p> : null}
      {result.status === 'unavailable' ? <p className="run-windows__status">Run-window evidence is unavailable; no ranking is shown.</p> : null}
      {result.status === 'ready' && !result.windows.length ? <p className="run-windows__status">No complete remaining-day windows are available.</p> : null}
      {result.status === 'ready' && result.windows.length ? (
        <>
          <ol className="run-windows__list">
            <WindowItem window={result.windows[0]} />
          </ol>
          {result.windows.length > 1 ? (
            <details className="run-windows__more">
              <summary>{Math.min(result.windows.length - 1, 3)} later starts</summary>
              <ol className="run-windows__list">
                {result.windows.slice(1, 4).map((window) => <WindowItem key={window.startsAt} window={window} />)}
              </ol>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

function WindowItem({ window }) {
  return (
    <li className={`run-windows__item run-windows__item--tier-${window.tier}`}>
      <strong>{formatClock(window.startsAt)}–{formatClock(window.endsAt)}</strong>
      <span>{window.constraints.map((constraint) => constraint.label).join(' · ')}</span>
      <small>{window.daylight ? 'Daylight' : 'After dark'} · {TIER_LABELS[window.tier]}</small>
    </li>
  )
}
