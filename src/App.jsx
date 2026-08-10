import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchForecast, currentPosition } from './lib/api.js'
import { UNIT_PRESETS } from './lib/format.js'
import { skyTheme } from './lib/weatherCodes.js'
import {
  placeKey,
  normalisePlace,
  loadFavorites,
  saveFavorites,
  loadRecents,
  saveRecents,
  loadLastPlace,
  saveLastPlace,
  loadUnitId,
  saveUnitId,
  loadHasOnboarded,
  saveHasOnboarded,
  isPersistent,
  FAVORITES_LIMIT,
  RECENTS_LIMIT,
} from './lib/storage.js'
import LocationSearch from './components/LocationSearch.jsx'
import SavedPlaces from './components/SavedPlaces.jsx'
import CurrentCard from './components/CurrentCard.jsx'
import Forecast from './components/Forecast.jsx'

const DEFAULT_PLACE = normalisePlace({
  name: 'Chicago',
  label: 'Chicago, Illinois, United States',
  latitude: 41.8781,
  longitude: -87.6298,
  admin1: 'Illinois',
  country: 'United States',
})

const REFRESH_MS = 10 * 60 * 1000

export default function App() {
  // Lazy initialisers so storage is read once, not on every render.
  const [place, setPlace] = useState(() => loadLastPlace())
  const [favorites, setFavorites] = useState(loadFavorites)
  const [recents, setRecents] = useState(loadRecents)
  const [unitId, setUnitId] = useState(loadUnitId)

  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const units = UNIT_PRESETS[unitId]
  const abortRef = useRef(null)
  const activeKey = place ? place.key : null

  // --- first visit -------------------------------------------------------
  // Paint the default city immediately, then upgrade to the real position if
  // permission is granted. Awaiting geolocation before the first render means a
  // user who simply ignores the browser prompt stares at a spinner until the
  // request times out — the permission dialog does not reject, it just hangs.
  //
  // The onboarded flag keeps a declined prompt from being re-raised every visit.
  const bootstrapRef = useRef(false)
  const userChoseRef = useRef(false)

  useEffect(() => {
    if (bootstrapRef.current) return undefined
    bootstrapRef.current = true
    if (place) return undefined // a saved location was restored

    setPlace(DEFAULT_PLACE)
    if (loadHasOnboarded()) return undefined
    saveHasOnboarded()

    let cancelled = false
    currentPosition()
      .then((found) => {
        // Ignore a late result if the user already picked somewhere themselves.
        if (cancelled || userChoseRef.current) return
        setPlace(normalisePlace({ ...found, id: 'geo' }))
      })
      .catch(() => {
        /* declined, unavailable, or timed out — the default city stands */
      })

    return () => {
      cancelled = true
    }
    // Mount-only: `place` is read once to decide whether anything was restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- persistence -------------------------------------------------------
  useEffect(() => {
    if (place) saveLastPlace(place)
  }, [place])
  useEffect(() => saveFavorites(favorites), [favorites])
  useEffect(() => saveRecents(recents), [recents])
  useEffect(() => saveUnitId(unitId), [unitId])

  // --- data --------------------------------------------------------------
  const load = useCallback(async () => {
    if (!place) return
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
  }, [place, unitId])

  useEffect(() => {
    load()
    return () => abortRef.current?.abort()
  }, [load])

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

  // --- places ------------------------------------------------------------
  const isFavorite = useMemo(
    () => Boolean(activeKey) && favorites.some((f) => f.key === activeKey),
    [favorites, activeKey],
  )

  function selectPlace(next) {
    const normalised = normalisePlace(next)
    if (!normalised) return
    userChoseRef.current = true
    setPlace(normalised)

    // Viewing something adds it to recents — unless it's already saved, where
    // duplicating it across both lists is just noise.
    setRecents((prev) => {
      if (favorites.some((f) => f.key === normalised.key)) return prev
      return [normalised, ...prev.filter((p) => p.key !== normalised.key)].slice(0, RECENTS_LIMIT)
    })
  }

  function toggleFavorite() {
    if (!place) return
    if (isFavorite) {
      setFavorites((prev) => prev.filter((f) => f.key !== place.key))
      // Demote rather than lose it — it's still somewhere you just were.
      setRecents((prev) => [place, ...prev.filter((p) => p.key !== place.key)].slice(0, RECENTS_LIMIT))
      return
    }
    setFavorites((prev) => {
      if (prev.length >= FAVORITES_LIMIT) {
        setError(`You can save up to ${FAVORITES_LIMIT} locations. Remove one to add another.`)
        return prev
      }
      return [...prev, place]
    })
    setRecents((prev) => prev.filter((p) => p.key !== place.key))
  }

  const removeFavorite = (key) => setFavorites((prev) => prev.filter((f) => f.key !== key))
  const removeRecent = (key) => setRecents((prev) => prev.filter((p) => p.key !== key))

  async function useMyLocation() {
    try {
      selectPlace({ ...(await currentPosition()), id: 'geo' })
    } catch (err) {
      setError(err.message)
    }
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
        <LocationSearch onSelect={selectPlace} onUseMyLocation={useMyLocation} />

        <SavedPlaces
          activeKey={activeKey}
          favorites={favorites}
          recents={recents}
          onSelect={selectPlace}
          onRemoveFavorite={removeFavorite}
          onRemoveRecent={removeRecent}
        />

        {status === 'loading' && !data ? (
          <div className="state state--loading">
            <span className="state__spinner" aria-hidden="true" />
            <p>{place ? `Reading the sky over ${place.name}…` : 'Finding your location…'}</p>
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

        {data && place ? (
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
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
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
        {!isPersistent ? (
          <p className="footer__note">
            Storage is unavailable in this browser, so saved locations will only last for this
            session.
          </p>
        ) : null}
      </footer>
    </div>
  )
}
