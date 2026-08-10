import { useEffect, useState } from 'react'
import { fetchForecastConfidence } from '../lib/api.js'
import { formatPrecipTotal, formatTemp } from '../lib/format.js'

export default function TomorrowConfidence({ place, date, units }) {
  const [state, setState] = useState({ status: 'loading', reading: null })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading', reading: null })

    fetchForecastConfidence(
      { latitude: place.latitude, longitude: place.longitude, unitId: units.id, date },
      controller.signal,
    )
      .then((reading) => setState({ status: reading ? 'ready' : 'unavailable', reading }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ status: 'unavailable', reading: null })
      })

    return () => controller.abort()
  }, [place.latitude, place.longitude, units.id, date])

  if (state.status === 'loading') {
    return (
      <section className="confidence confidence--loading" aria-label="Ensemble spread" role="status">
        Checking ensemble spread…
      </section>
    )
  }

  if (state.status !== 'ready' || !state.reading) {
    return (
      <section className="confidence confidence--unavailable" aria-label="Ensemble spread" role="status">
        Ensemble spread is unavailable for tomorrow.
      </section>
    )
  }

  const { temperature, precipitation, memberCount } = state.reading
  return (
    <section className="confidence confidence--ready" aria-labelledby="confidence-title">
      <h3 className="confidence__title" id="confidence-title">Ensemble spread</h3>
      <p className="confidence__temperature">
        High {formatTemp(temperature.low, units)}–{formatTemp(temperature.high, units)}
      </p>
      <p className="confidence__precipitation">
        Rain {precipitation.low.toFixed(units.precipDigits)}–{formatPrecipTotal(precipitation.high, units)}
      </p>
      <p className="confidence__note">Middle 80% of {memberCount} NCEP GEFS members</p>
    </section>
  )
}
