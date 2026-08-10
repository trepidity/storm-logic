import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchForecast } from './lib/api.js'
import { UNIT_PRESETS } from './lib/format.js'
import { skyTheme } from './lib/weatherCodes.js'
import LocationSearch from './components/LocationSearch.jsx'
import CurrentCard from './components/CurrentCard.jsx'
import Forecast from './components/Forecast.jsx'

const DEFAULT_PLACE = {
  id: 'default-chicago',
  name: 'Chicago',
  label: 'Chicago, Illinois, United States',
  latitude: 41.8781,
  longitude: -87.6298,
}

const REFRESH_MS = 10 * 60 * 1000

export default function App() {
  const [place, setPlace] = useState(DEFAULT_PLACE)
  const [favorites, setFavorites] = useState([DEFAULT_PLACE])
  const [unitId, setUnitId] = useState('imperial')
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  const units = UNIT_PRESETS[unitId]
  const abortRef = useRef(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'))
    setError(null)

    try {
      const next = await fetchForecast(
        { latitude: place.latitude, longitude: place.longitude, unitId },
        controller.signal,
      )
      setData(next)
      setStatus('ready')
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message || 'Could not load the forecast.')
      setStatus('error')
    }
  }, [place.latitude, place.longitude, unitId])

  useEffect(() => {
    load()
    return () => abortRef.current?.abort()
  }, [load])

  // Keep the reading fresh without hammering the API.
  useEffect(() => {
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const theme = useMemo(() => {
    if (!data?.current) return 'clear'
    return skyTheme(data.current.weatherCode, data.current.isDay)
  }, [data])

  useEffect(() => {
    document.body.dataset.sky = theme
  }, [theme])

  function selectPlace(next) {
    setPlace(next)
    setFavorites((prev) => {
      if (prev.some((p) => p.id === next.id)) return prev
      return [next, ...prev].slice(0, 5)
    })
  }

  return (
    <div className="app">
      <div className="app__sky" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ⛈️
          </span>
          <span className="brand__name">StormLogic</span>
        </div>

        <div className="topbar__controls">
          <div className="unit-toggle" role="group" aria-label="Temperature units">
            {Object.values(UNIT_PRESETS).map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={preset.id === unitId ? 'is-active' : ''}
                aria-pressed={preset.id === unitId}
                onClick={() => setUnitId(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button type="button" className="refresh" onClick={load} title="Refresh">
            <span aria-hidden="true">↻</span>
            <span className="visually-hidden">Refresh forecast</span>
          </button>
        </div>
      </header>

      <main className="layout">
        <LocationSearch
          place={place}
          favorites={favorites}
          onSelect={selectPlace}
          onGeoError={(message) => setError(message)}
        />

        {status === 'loading' && !data ? (
          <div className="state state--loading">
            <span className="state__spinner" aria-hidden="true" />
            <p>Reading the sky over {place.name ?? place.label}…</p>
          </div>
        ) : null}

        {status === 'error' && !data ? (
          <div className="state state--error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={load}>
              Try again
            </button>
          </div>
        ) : null}

        {data ? (
          <>
            {error ? (
              <p className="inline-error" role="status">
                {error}
              </p>
            ) : null}

            <CurrentCard
              place={place}
              current={data.current}
              today={data.days[0]}
              units={units}
              timezone={data.timezone}
            />

            <Forecast days={data.days} units={units} />
          </>
        ) : null}
      </main>

      <footer className="footer">
        <p>
          Weather data by{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer noopener">
            Open-Meteo
          </a>{' '}
          · CC BY 4.0
        </p>
        <p className="footer__note">
          Hail is reported only via WMO codes 96 and 99 (thunderstorm with hail) — Open-Meteo has no
          measured hail variable.
        </p>
      </footer>
    </div>
  )
}
