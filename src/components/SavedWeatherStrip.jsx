import useSavedWeather from '../hooks/useSavedWeather.js'
import { SAVED_WEATHER_MAX_AGE_MS } from '../lib/savedWeather.js'

export default function SavedWeatherStrip({ favorites, activeKey, unitId, onSelect }) {
  const weather = useSavedWeather(favorites)
  if (!favorites.length) return null
  return (
    <section className="saved-weather" aria-label="Saved locations — current model weather">
      {favorites.map(place => {
        const entry = weather[place.key]
        const ready = entry?.status === 'ready' && Date.now() - entry.time <= SAVED_WEATHER_MAX_AGE_MS
        const temperature = ready && Number.isFinite(entry.temperature)
          ? `${Math.round(unitId === 'metric' ? entry.temperature : entry.temperature * 9 / 5 + 32)}°${unitId === 'metric' ? 'C' : 'F'}`
          : '—'
        const condition = ready ? entry.condition : entry ? 'Unavailable' : 'Loading…'
        const detail = ready
          ? `Open-Meteo model conditions · ${new Date(entry.time).toLocaleString()}. Refreshes every 10 minutes.`
          : entry ? 'Weather unavailable. Retrying automatically every 10 minutes.' : 'Loading current weather.'
        return (
          <button type="button" key={place.key} className="saved-weather__pill"
            aria-pressed={activeKey === place.key}
            aria-label={`${place.label || place.name}, ${temperature}, ${condition}. ${detail}`}
            title={`${place.label || place.name} · ${detail}`} onClick={() => onSelect(place)}>
            <span className="saved-weather__name">{place.name}</span>
            <strong>{temperature}</strong>
            <span className="saved-weather__condition">{condition}</span>
          </button>
        )
      })}
    </section>
  )
}
