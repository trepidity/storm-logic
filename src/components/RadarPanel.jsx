import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchRadarFrames, tileUrlTemplate, frameClock, TILE_SIZE } from '../lib/radar.js'

/**
 * Animated radar over the selected location.
 *
 * Lazy-loaded (see App.jsx) so Leaflet's ~42KB and this chunk never reach
 * anyone who doesn't open the tab.
 */

const FRAME_MS = 500
const RADAR_OPACITY = 0.72
const START_ZOOM = 7

export default function RadarPanel({ place }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(new Map())
  const timerRef = useRef(null)

  const [frames, setFrames] = useState([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  // --- map lifecycle -----------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      // The page scrolls; grabbing the wheel over the map fights the user.
      scrollWheelZoom: false,
    }).setView([place.latitude, place.longitude], START_ZOOM)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap, &copy; CARTO',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layersRef.current.clear()
    }
    // Created once; recentring on place change is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-centre and re-pin when the user switches location.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined

    map.setView([place.latitude, place.longitude], map.getZoom() ?? START_ZOOM)
    const marker = L.marker([place.latitude, place.longitude], {
      icon: L.divIcon({ className: '', html: '<div class="radar__pin"></div>', iconSize: [14, 14] }),
    }).addTo(map)

    return () => marker.remove()
  }, [place.latitude, place.longitude])

  // --- frames ------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController()

    fetchRadarFrames(controller.signal)
      .then(({ host, frames: list, nowIndex }) => {
        const map = mapRef.current
        if (!map) return

        // Every frame becomes a layer up front and animation is opacity-only.
        // Adding and removing layers per tick makes the loop flicker while the
        // incoming frame's tiles are still downloading.
        list.forEach((frame) => {
          const layer = L.tileLayer(tileUrlTemplate(host, frame.path), {
            opacity: 0,
            zIndex: 10,
            tileSize: TILE_SIZE,
          })
          layer.addTo(map)
          layersRef.current.set(frame.path, layer)
        })

        setFrames(list)
        setIndex(nowIndex)
        setStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err.message || 'Could not load radar.')
        setStatus('error')
      })

    return () => controller.abort()
  }, [])

  // --- animation ---------------------------------------------------------
  useEffect(() => {
    clearInterval(timerRef.current)
    if (!playing || frames.length < 2) return undefined
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % frames.length), FRAME_MS)
    return () => clearInterval(timerRef.current)
  }, [playing, frames.length])

  useEffect(() => {
    frames.forEach((frame, i) => {
      layersRef.current.get(frame.path)?.setOpacity(i === index ? RADAR_OPACITY : 0)
    })
  }, [index, frames])

  const active = frames[index]

  return (
    <section className="radar" aria-label="Weather radar">
      <div className="radar__head">
        <span className="metric__label">Radar · {place.name}</span>
        <span className={`radar__stamp ${active?.future ? 'radar__stamp--future' : ''}`}>
          {status === 'ready' && active
            ? `${active.future ? 'Forecast · ' : ''}${frameClock(active.time)}`
            : status === 'error'
              ? 'Unavailable'
              : 'Loading…'}
        </span>
      </div>

      <div className="radar__map" ref={containerRef} />

      {status === 'error' ? (
        <p className="inline-error" role="status">
          {error}
        </p>
      ) : null}

      {frames.length > 1 ? (
        <div className="radar__controls">
          <button
            type="button"
            className="radar__play"
            onClick={() => setPlaying((p) => !p)}
            aria-pressed={playing}
          >
            <span aria-hidden="true">{playing ? '⏸' : '▶'}</span>
            <span className="visually-hidden">{playing ? 'Pause the radar loop' : 'Play the radar loop'}</span>
          </button>

          <div className="radar__timeline">
            <ol className="radar__ticks">
              {frames.map((frame, i) => (
                <li key={frame.path}>
                  <button
                    type="button"
                    className={`radar__tick ${frame.future ? 'radar__tick--future' : ''} ${
                      i === index ? 'radar__tick--on' : ''
                    }`}
                    title={`${frameClock(frame.time)}${frame.future ? ' (forecast)' : ''}`}
                    aria-label={`Show ${frameClock(frame.time)}${frame.future ? ', forecast' : ''}`}
                    onClick={() => {
                      setPlaying(false)
                      setIndex(i)
                    }}
                  />
                </li>
              ))}
            </ol>
            <div className="radar__scale">
              <span>{frameClock(frames[0].time)}</span>
              <span>now</span>
              <span>{frameClock(frames[frames.length - 1].time)}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="radar__legend">
        <span>Light</span>
        <div className="radar__ramp" />
        <span>Heavy</span>
      </div>

      <p className="radar__credit">
        Radar by{' '}
        <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer noopener">
          RainViewer
        </a>{' '}
        · basemap ©{' '}
        <a href="https://carto.com/" target="_blank" rel="noreferrer noopener">
          CARTO
        </a>
      </p>
    </section>
  )
}
