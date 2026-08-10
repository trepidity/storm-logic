import { useEffect, useState } from 'react'
import { fetchAirQuality } from '../lib/api.js'
import { US_AQI_LABEL } from '../lib/usAqi.js'

function formatModelTime(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!match) return null

  const [, year, month, day, hour, minute] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  const dateLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
  const hourNumber = Number(hour)
  const clock = `${hourNumber % 12 || 12}:${minute}${hourNumber >= 12 ? 'pm' : 'am'}`
  return `${dateLabel}, ${clock}`
}

export default function AirPanel({ place }) {
  const [state, setState] = useState({ status: 'loading', reading: null, errorCode: null })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading', reading: null, errorCode: null })

    fetchAirQuality({ latitude: place.latitude, longitude: place.longitude }, controller.signal)
      .then((reading) => {
        if (reading == null) {
          setState({ status: 'no-data', reading: null, errorCode: null })
          return
        }
        setState({ status: 'ready', reading, errorCode: null })
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setState({ status: 'error', reading: null, errorCode: error.code ?? null })
      })

    return () => controller.abort()
  }, [place.latitude, place.longitude])

  const modelTime = state.reading ? formatModelTime(state.reading.time) : null

  return (
    <section className="air" aria-labelledby="air-title">
      <header className="air__head">
        <div>
          <p className="air__eyebrow">{US_AQI_LABEL}</p>
          <h1 id="air-title">Air quality for {place.name}</h1>
        </div>
        <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer noopener">
          Open-Meteo
        </a>
      </header>

      {state.status === 'loading' ? (
        <div className="air__state" role="status">
          <span className="state__spinner" aria-hidden="true" />
          <p>Loading air quality…</p>
        </div>
      ) : null}

      {state.status === 'ready' && state.reading ? (
        <div
          className={`air__reading air__reading--${state.reading.category.key}`}
          role="status"
          aria-live="polite"
        >
          <p className="air__scale">{US_AQI_LABEL}</p>
          <p className="air__value">{Math.round(state.reading.usAqi)}</p>
          <p className="air__category">{state.reading.category.label}</p>
          {modelTime ? (
            <p className="air__time">
              <span className="air__time-label">Valid at</span> {modelTime}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.status === 'no-data' ? (
        <div className="air__empty" role="status">
          <p>No {US_AQI_LABEL} reading is available for this location right now.</p>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className="air__unavailable" role="status">
          <p>
            {state.errorCode === 'coverage'
              ? `${US_AQI_LABEL} is available only for locations in U.S. coverage.`
              : `${US_AQI_LABEL} is temporarily unavailable. Try again in a moment, or check an official air quality source for urgent conditions.`}
          </p>
        </div>
      ) : null}

      <p className="air__note">
        {US_AQI_LABEL} for U.S. locations only. CAMS ENSEMBLE forecast data via Open-Meteo. CC BY
        4.0.
      </p>
    </section>
  )
}
