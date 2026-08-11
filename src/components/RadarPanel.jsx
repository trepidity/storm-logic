import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchRadarFrames, tileUrlTemplate, frameClock, TILE_SIZE } from '../lib/radar.js'
import { unavailableNwsWarnings } from '../lib/severeDesk/adapters/nwsWarnings.js'
import { unavailableSpcOutlook } from '../lib/severeDesk/adapters/spcOutlook.js'
import { unavailableIemLsr } from '../lib/severeDesk/adapters/iemLsr.js'
import { unavailableIemAttributes } from '../lib/severeDesk/adapters/iemAttributes.js'
import { fetchIemLsrLayer } from '../lib/severeDesk/clients/iemLsrClient.js'
import { fetchIemAttributesLayer } from '../lib/severeDesk/clients/iemAttributesClient.js'
import { projectRadarLayerStack } from '../lib/severeDesk/radarLayerStack.js'
import { coordinateTrackingLayers, TRACKING_LAYER_SCOPE_NOTE } from '../lib/severeDesk/trackingTimeCoordinator.js'

/**
 * Animated radar over the selected location.
 *
 * Lazy-loaded (see App.jsx) so Leaflet's ~42KB and this chunk never reach
 * anyone who doesn't open the tab.
 */

const FRAME_MS = 500
const RADAR_OPACITY = 0.72
const START_ZOOM = 7
const OFFICIAL_LAYER_IDS = Object.freeze(['spc-outlooks', 'warnings'])
const TRACKING_LAYER_IDS = Object.freeze(['storm-attributes', 'storm-reports'])
const NOT_CONFIGURED_OFFICIAL_LAYERS = Object.freeze([
  unavailableSpcOutlook(null, 'not-configured'),
  unavailableNwsWarnings('not-configured'),
])
const NOT_CONFIGURED_TRACKING_LAYERS = Object.freeze([
  unavailableIemAttributes('not-configured'),
  unavailableIemLsr('not-configured'),
])

function officialLayerCandidates(layerStates) {
  const candidates = new Map(NOT_CONFIGURED_OFFICIAL_LAYERS.map((state) => [state.layerId, state]))
  if (Array.isArray(layerStates)) {
    for (const candidate of layerStates) {
      if (OFFICIAL_LAYER_IDS.includes(candidate?.layerId)) candidates.set(candidate.layerId, candidate)
    }
  }
  return [...candidates.values()]
}

function trackingLayerCandidates(layerStates) {
  const candidates = new Map(NOT_CONFIGURED_TRACKING_LAYERS.map((state) => [state.layerId, state]))
  if (Array.isArray(layerStates)) {
    for (const candidate of layerStates) {
      if (TRACKING_LAYER_IDS.includes(candidate?.layerId)) candidates.set(candidate.layerId, candidate)
    }
  }
  return [...candidates.values()]
}

function paneName(layerId) {
  return `radar-official-${layerId}`
}

function trackingPaneName(layerId) {
  return `radar-tracking-${layerId}`
}

function mapStyle(authority) {
  return authority === 'outlook'
    ? { className: 'radar__official-polygon radar__official-polygon--outlook', color: '#ae90ff', weight: 2, fillColor: '#7557d8', fillOpacity: 0.18, dashArray: '6 4' }
    : { className: 'radar__official-polygon radar__official-polygon--warning', color: '#ffcf6b', weight: 3, fillColor: '#ffb347', fillOpacity: 0.16 }
}

function layerTimeLabel(layer) {
  if (!layer.observedAt) return 'Source time unavailable.'
  if (layer.status === 'unavailable') return `Last known source time · ${layer.observedAt}`
  return `${layer.authority === 'outlook' ? 'Issued' : 'Source update'} · ${layer.observedAt}`
}

function markerCoordinates(feature) {
  const longitude = feature?.coordinates?.longitude
  const latitude = feature?.coordinates?.latitude
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null
}

function trackingMarkerOptions(layer) {
  return layer.authority === 'report'
    ? { className: 'radar__tracking-marker radar__tracking-marker--report', color: '#ffcf6b', fillColor: '#ff8f3d', radius: 7 }
    : { className: 'radar__tracking-marker radar__tracking-marker--signature', color: '#c3b1ff', fillColor: '#7557d8', radius: 6 }
}

function trackingMarkerLabel(layer, feature) {
  return layer.authority === 'report'
    ? `${feature.phenomenon} · reported ${feature.reportAt}`
    : `${feature.sourceVolume} · scan ${feature.scanAt}`
}

export default function RadarPanel({ place, alert = null, officialLayerStates = null }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(new Map())
  const alertLayerRef = useRef(null)
  const officialLayersRef = useRef(new Map())
  const trackingLayersRef = useRef(new Map())
  const timerRef = useRef(null)

  const [frames, setFrames] = useState([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [trackingLayerStates, setTrackingLayerStates] = useState(null)
  const [visibleOfficialLayers, setVisibleOfficialLayers] = useState(() => new Set([...OFFICIAL_LAYER_IDS, ...TRACKING_LAYER_IDS]))
  const [viewportRevision, setViewportRevision] = useState(0)
  const active = frames[index]
  const selectedAt = Number.isFinite(active?.time) ? new Date(active.time * 1000).toISOString() : null
  const officialStack = useMemo(
    () => projectRadarLayerStack(officialLayerCandidates(officialLayerStates)).filter((layer) => OFFICIAL_LAYER_IDS.includes(layer.layerId)),
    [officialLayerStates],
  )
  const trackingStack = useMemo(
    () => projectRadarLayerStack(coordinateTrackingLayers(trackingLayerCandidates(trackingLayerStates), selectedAt))
      .filter((layer) => TRACKING_LAYER_IDS.includes(layer.layerId)),
    [trackingLayerStates, selectedAt],
  )
  const deskStack = useMemo(
    () => [...officialStack, ...trackingStack].sort((left, right) => left.zIndex - right.zIndex),
    [officialStack, trackingStack],
  )

  // --- map lifecycle -----------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      // The page scrolls; grabbing the wheel over the map fights the user.
      scrollWheelZoom: false,
      // The keyed map is rebuilt for a selected-place change. Disabling Leaflet
      // zoom transitions prevents a completion callback from addressing the
      // detached prior map pane during that rebuild.
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).setView([place.latitude, place.longitude], START_ZOOM)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap, &copy; CARTO',
    }).addTo(map)

    mapRef.current = map
    const onMoveEnd = () => setViewportRevision((revision) => revision + 1)
    map.on('moveend', onMoveEnd)

    return () => {
      map.off('moveend', onMoveEnd)
      // A place switch can unmount a map while Leaflet still has a pan/zoom
      // animation queued. Stop it before detaching panes so an old map never
      // touches the newly keyed container.
      map.stop()
      map.remove()
      mapRef.current = null
      layersRef.current.clear()
      alertLayerRef.current = null
      officialLayersRef.current.clear()
      trackingLayersRef.current.clear()
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

  // The selected alert geometry is the exact active NWS GeoJSON retained by
  // the alert client. Never derive a boundary from its area text or the place:
  // absent geometry is an honest "centered on place" Radar view.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !alert?.geometry) return undefined

    const layer = L.geoJSON(alert.geometry, {
      interactive: false,
      style: {
        className: 'radar__alert-polygon',
        color: '#ffcf6b',
        weight: 3,
        fillColor: '#ffcf6b',
        fillOpacity: 0.14,
      },
    }).addTo(map)
    alertLayerRef.current = layer

    const bounds = layer.getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 10 })

    return () => {
      layer.remove()
      if (alertLayerRef.current === layer) alertLayerRef.current = null
    }
  }, [alert])

  // Official geometry enters Radar only as the provider-agnostic projection
  // from SC-SD-LAYER. This component knows a layer's authority/z-order, never
  // an upstream field name or source payload shape.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined

    officialLayersRef.current.forEach((layer) => layer.remove())
    officialLayersRef.current.clear()

    for (const entry of officialStack) {
      if (entry.status !== 'ready' || !visibleOfficialLayers.has(entry.layerId) || entry.features.length === 0) continue
      const name = paneName(entry.layerId)
      const pane = map.getPane(name) ?? map.createPane(name)
      // Leaflet prefixes its generated pane class differently by version;
      // retain an app-owned class so the visual stack has a stable, inspectable
      // contract independent of that internal naming detail.
      pane.classList.add(`${name}-pane`)
      pane.style.zIndex = String(400 + entry.zIndex)
      const features = entry.features
        .filter((feature) => feature?.geometry)
        .map((feature) => ({ type: 'Feature', id: feature.id ?? null, geometry: feature.geometry, properties: {} }))
      if (features.length === 0) continue

      const layer = L.geoJSON({ type: 'FeatureCollection', features }, {
        pane: name,
        interactive: false,
        style: mapStyle(entry.authority),
      }).addTo(map)
      officialLayersRef.current.set(entry.layerId, layer)
    }

    return () => {
      officialLayersRef.current.forEach((layer) => layer.remove())
      officialLayersRef.current.clear()
    }
  }, [officialStack, visibleOfficialLayers])

  // Tracking source calls occur once per Radar mount, using the latest
  // observed frame to define the LSR fetch window. Timeline scrubbing only
  // selects already normalised content; it never turns into one IEM request
  // per animation tick or map gesture.
  useEffect(() => {
    const latestObservation = [...frames].reverse().find((frame) => !frame.future)
    if (!latestObservation) return undefined

    const end = new Date(latestObservation.time * 1000)
    if (!Number.isFinite(end.getTime())) return undefined
    const controller = new AbortController()
    const ets = end.toISOString()
    const sts = new Date(end.getTime() - 6 * 60 * 60 * 1000).toISOString()

    Promise.all([
      fetchIemLsrLayer({ sts, ets }, controller.signal),
      fetchIemAttributesLayer(controller.signal),
    ]).then((states) => {
      if (!controller.signal.aborted) setTrackingLayerStates(states)
    })

    return () => controller.abort()
  }, [frames])

  // Attribute markers are client-side visual scope only. The IEM endpoint's
  // recorded contract has no spatial parameter, so a pan changes no request;
  // it merely redraws the already-normalised data within the visible map.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined

    trackingLayersRef.current.forEach((layer) => layer.remove())
    trackingLayersRef.current.clear()

    const bounds = map.getBounds()
    for (const entry of trackingStack) {
      if (entry.status !== 'ready' || !visibleOfficialLayers.has(entry.layerId) || entry.features.length === 0) continue
      const name = trackingPaneName(entry.layerId)
      const pane = map.getPane(name) ?? map.createPane(name)
      pane.style.zIndex = String(400 + entry.zIndex)
      const group = L.layerGroup()
      for (const feature of entry.features) {
        const coordinates = markerCoordinates(feature)
        if (!coordinates || !bounds.contains(coordinates)) continue
        const marker = L.circleMarker(coordinates, { pane: name, interactive: true, ...trackingMarkerOptions(entry) })
        marker.bindTooltip(trackingMarkerLabel(entry, feature), { direction: 'top' })
        group.addLayer(marker)
      }
      group.addTo(map)
      trackingLayersRef.current.set(entry.layerId, group)
    }

    return () => {
      trackingLayersRef.current.forEach((layer) => layer.remove())
      trackingLayersRef.current.clear()
    }
  }, [trackingStack, visibleOfficialLayers, viewportRevision])

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

  function toggleOfficialLayer(layerId) {
    setVisibleOfficialLayers((current) => {
      const next = new Set(current)
      if (next.has(layerId)) next.delete(layerId)
      else next.add(layerId)
      return next
    })
  }

  return (
    <section className="radar" aria-label={alert?.geometry ? 'Weather radar with official NWS alert area' : 'Weather radar'}>
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

      {alert ? (
        <p className="radar__alert-note" role="status">
          {alert.geometry
            ? `Official NWS alert area · ${alert.event}`
            : `NWS did not provide a mappable boundary for this alert. Radar is centered on ${place.name}.`}
        </p>
      ) : null}

      <div className="radar__map" ref={containerRef} />

      <section className="radar__official-layers" aria-label="Severe desk layers">
        <div className="radar__official-layers-head">
          <div>
            <span className="metric__label">Severe desk layers</span>
            <p>Official warnings, outlooks, reports, and radar signatures remain separate.</p>
          </div>
        </div>
        <ul className="radar__layer-list">
          {deskStack.map((layer) => {
            const visible = visibleOfficialLayers.has(layer.layerId)
            return (
              <li className={`radar__layer radar__layer--${layer.status}`} data-layer-id={layer.layerId} key={layer.layerId}>
                <button
                  type="button"
                  className="radar__layer-toggle"
                  aria-pressed={visible}
                  onClick={() => toggleOfficialLayer(layer.layerId)}
                >
                  <span aria-hidden="true" className="radar__layer-indicator" />
                  {layer.label}
                </button>
                <div className="radar__layer-detail">
                  <p className="radar__layer-source">{layer.sourceLine ?? 'Source unavailable.'}</p>
                  <time className="radar__layer-time" dateTime={layer.observedAt ?? undefined}>
                    {layerTimeLabel(layer)}
                  </time>
                  {TRACKING_LAYER_IDS.includes(layer.layerId) ? <p className="radar__layer-scope">{TRACKING_LAYER_SCOPE_NOTE}</p> : null}
                  {layer.message ? <p className="radar__layer-status" role="status">{layer.message}</p> : null}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

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

      <p className="radar__provenance">
        RainViewer composite reflectivity · radar observation, not an official warning or a hail/tornado report.
      </p>

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
