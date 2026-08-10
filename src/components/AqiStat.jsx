import { useEffect, useState } from 'react'
import { fetchAirQuality } from '../lib/api.js'
import { US_AQI_LABEL } from '../lib/usAqi.js'

/** Compact, current-card presentation of the U.S.-scoped AQI provider. */
export default function AqiStat({ place }) {
  const [state, setState] = useState({ status: 'loading', reading: null, errorCode: null })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading', reading: null, errorCode: null })

    fetchAirQuality({ latitude: place.latitude, longitude: place.longitude }, controller.signal)
      .then((reading) => {
        if (reading == null) setState({ status: 'no-data', reading: null, errorCode: null })
        else setState({ status: 'ready', reading, errorCode: null })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ status: 'error', reading: null, errorCode: error.code ?? null })
      })

    return () => controller.abort()
  }, [place.latitude, place.longitude])

  const reading = state.reading
  const value = state.status === 'loading' ? '…' : reading ? String(Math.round(reading.usAqi)) : '—'
  const note =
    reading?.category.label ??
    (state.status === 'loading'
      ? 'Loading'
      : state.status === 'no-data'
        ? 'No data'
        : state.errorCode === 'coverage'
          ? 'U.S. only'
          : 'Unavailable')

  return (
    <div className="stat stat--aqi" aria-live="polite">
      <dt>{US_AQI_LABEL}</dt>
      <dd className="stat__value" title={reading ? `${US_AQI_LABEL}: ${reading.category.label}` : note}>
        {value}
      </dd>
      <span className="stat__note">{note}</span>
    </div>
  )
}
