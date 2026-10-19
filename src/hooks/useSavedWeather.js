import { useEffect, useRef, useState } from 'react'
import { fetchSavedWeather, SAVED_WEATHER_REFRESH_MS } from '../lib/savedWeather.js'

// One mounted cache shared by all three views, in Celsius. Limit concurrency
// rather than issuing the favorites limit's worth of requests simultaneously.
export default function useSavedWeather(places) {
  const cache = useRef(new Map())
  const [weather, setWeather] = useState({})
  useEffect(() => {
    let cancelled = false
    let running = false
    const controllers = new Set()
    const keys = new Set(places.map(p => p.key))
    for (const key of cache.current.keys()) if (!keys.has(key)) cache.current.delete(key)
    async function refresh() {
      if (running || cancelled) return
      running = true
      // Repaint cached timestamps too: data can expire between fetches.
      setWeather(Object.fromEntries(cache.current))
      let cursor = 0
      async function worker() {
        while (!cancelled && cursor < places.length) {
          const place = places[cursor++]
          const cached = cache.current.get(place.key)
          if (cached && Date.now() - cached.fetched < SAVED_WEATHER_REFRESH_MS) continue
          const controller = new AbortController()
          controllers.add(controller)
          const timer = setTimeout(() => controller.abort(), 12_000)
          let entry
          try {
            entry = { status: 'ready', ...await fetchSavedWeather(place, controller.signal) }
          } catch {
            entry = { status: 'unavailable' }
          } finally {
            clearTimeout(timer)
            controllers.delete(controller)
          }
          if (cancelled) return
          cache.current.set(place.key, { ...entry, fetched: Date.now() })
          setWeather(Object.fromEntries(cache.current))
        }
      }
      await Promise.all([worker(), worker()])
      running = false
    }
    setWeather(Object.fromEntries(cache.current))
    refresh()
    const timer = setInterval(refresh, 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
      for (const controller of controllers) controller.abort()
    }
  }, [places])
  return weather
}
