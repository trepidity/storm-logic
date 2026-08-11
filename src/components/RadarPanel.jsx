import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchRadarFrames, tileUrlTemplate, frameClock, reconcileFrameSelection, TILE_SIZE } from '../lib/radar.js'
import { unavailableNwsWarnings } from '../lib/severeDesk/adapters/nwsWarnings.js'
import { unavailableSpcOutlook } from '../lib/severeDesk/adapters/spcOutlook.js'
import { unavailableIemLsr } from '../lib/severeDesk/adapters/iemLsr.js'
import { unavailableIemAttributes } from '../lib/severeDesk/adapters/iemAttributes.js'
import { fetchIemLsrLayer } from '../lib/severeDesk/clients/iemLsrClient.js'
import { fetchIemAttributesLayer } from '../lib/severeDesk/clients/iemAttributesClient.js'
import { projectRadarLayerStack } from '../lib/severeDesk/radarLayerStack.js'
import { layerDefinition } from '../lib/severeDesk/layerRegistry.js'
import { coordinateTrackingLayers, TRACKING_LAYER_SCOPE_NOTE } from '../lib/severeDesk/trackingTimeCoordinator.js'

/**
 * Animated radar over the selected location.
 *
 * Lazy-loaded (see App.jsx) so Leaflet's ~42KB and this chunk never reach
 * anyone who doesn't open the tab.
 */

const FRAME_MS = 500
// Half of RainViewer's ~10 minute index cadence, matching the detection budget
// §8.3 applies to every other cadenced source on this page.
const FRAME_INDEX_REFRESH_MS = 5 * 60 * 1000
const WARNING_COLOR = layerDefinition('warnings').color
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

// Every drawn colour is the projected layer's own registry colour. The cards
// and the map legend read the same field, so a legend swatch cannot drift from
// what is drawn — previously both sides hand-copied hexes and agreed only by
// coincidence, and the report marker's stroke had drifted onto the warning
// amber, giving two different authorities the same colour on the map.
function mapStyle(layer) {
  return layer.authority === 'outlook'
    ? { className: 'radar__official-polygon radar__official-polygon--outlook', color: layer.color, weight: 2, fillColor: layer.color, fillOpacity: 0.18, dashArray: '6 4' }
    : { className: 'radar__official-polygon radar__official-polygon--warning', color: layer.color, weight: 3, fillColor: layer.color, fillOpacity: 0.16 }
}

function layerTimeLabel(layer) {
  if (!layer.observedAt) return 'Source time unavailable.'
  if (layer.status === 'unavailable') return `Last known source time · ${layer.observedAt}`
  return `${layer.authority === 'outlook' ? 'Issued' : 'Source update'} · ${layer.observedAt}`
}

function layerHealthLabel(layer) {
  if (layer.health === 'unavailable') return 'Source unavailable'
  if (layer.health === 'stale') return 'Source stale'
  if (layer.health === 'aging') return 'Source aging'
  return 'Source healthy'
}

function layerFrameLabel(layer, selectedAt, trackingFrameAt, playing, future) {
  if (!layer.frameCoupled) return 'Timeline independent'
  if (future) return 'No tracking for forecast frame'
  if (playing) return trackingFrameAt ? `Showing paused frame · ${trackingFrameAt}` : 'Tracking paused while radar plays'
  if (!trackingFrameAt) return 'Loading selected frame'
  if (trackingFrameAt !== selectedAt) return 'Loading selected frame'
  if (layer.count === 0) return 'Selected frame · no data'
  return `Selected frame · ${trackingFrameAt}`
}

function markerCoordinates(feature) {
  const longitude = feature?.coordinates?.longitude
  const latitude = feature?.coordinates?.latitude
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null
}

function trackingMarkerOptions(layer) {
  return layer.authority === 'report'
    ? { className: 'radar__tracking-marker radar__tracking-marker--report', color: layer.color, fillColor: layer.color, fillOpacity: 0.85, weight: 2, radius: 7 }
    : { className: 'radar__tracking-marker radar__tracking-marker--signature', color: layer.color, fillColor: layer.color, fillOpacity: 0.85, weight: 2, radius: 6 }
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
  const trackingCacheRef = useRef(new Map())
  const timerRef = useRef(null)
  // The index refresh reconciles against what is already on the map, so it
  // needs the current frame list and selection without re-subscribing on every
  // animation tick.
  const framesRef = useRef([])
  const selectedPathRef = useRef(null)
  const hostRef = useRef(null)

  const [frames, setFrames] = useState([])
  const [index, setIndex] = useState(0)
  // Tracking products are frame-addressed evidence, not animated imagery. Start
  // paused on the latest observation so opening Radar resolves one exact set;
  // play advances reflectivity only and never creates 2 Hz provider traffic.
  const [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [trackingLayerStates, setTrackingLayerStates] = useState(null)
  const [trackingFrameAt, setTrackingFrameAt] = useState(null)
  const [trackingPoll, setTrackingPoll] = useState(0)
  const [visibleOfficialLayers, setVisibleOfficialLayers] = useState(() => new Set([...OFFICIAL_LAYER_IDS, ...TRACKING_LAYER_IDS]))
  const [viewportRevision, setViewportRevision] = useState(0)
  // One detail panel open at a time, pinned by an explicit control rather than
  // by hover, so touch users reach the same provenance without toggling a layer.
  const [openDetailLayerId, setOpenDetailLayerId] = useState(null)
  const active = frames[index]
  const selectedAt = Number.isFinite(active?.time) ? new Date(active.time * 1000).toISOString() : null
  const officialStack = useMemo(
    () => projectRadarLayerStack(officialLayerCandidates(officialLayerStates)).filter((layer) => OFFICIAL_LAYER_IDS.includes(layer.layerId)),
    [officialLayerStates],
  )
  // Tracking layers are deliberately held at the last resolved paused frame.
  // A play tick must not recreate hundreds of Leaflet markers; while playing,
  // the card tells the user which paused frame is being shown instead.
  const trackingStack = useMemo(
    () => projectRadarLayerStack(coordinateTrackingLayers(trackingLayerCandidates(trackingLayerStates), trackingFrameAt))
      .filter((layer) => TRACKING_LAYER_IDS.includes(layer.layerId)),
    [trackingLayerStates, trackingFrameAt],
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
        // A handed-off alert is warning-authority geometry, so it takes the
        // warning colour from the registry rather than repeating the hex. This
        // is the last drawn colour on the map; none is hand-copied now.
        color: WARNING_COLOR,
        weight: 3,
        fillColor: WARNING_COLOR,
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
        style: mapStyle(entry),
      }).addTo(map)
      officialLayersRef.current.set(entry.layerId, layer)
    }

    return () => {
      officialLayersRef.current.forEach((layer) => layer.remove())
      officialLayersRef.current.clear()
    }
  }, [officialStack, visibleOfficialLayers])

  // Tracking evidence is requested for one distinct paused frame at a time.
  // Attributes are addressed by IEM's valid= snapshot; LSR's query uses the
  // same frame as its six-hour ending boundary. This prevents both the old
  // partial LSR window and a play loop emitting a provider request every 500ms.
  useEffect(() => {
    // During animation keep the last explicitly resolved paused frame under
    // its declared source-health poll.  The selected image frame never turns
    // into a tracking query, but a real IEM outage can still surface.
    const requestedAt = playing ? trackingFrameAt : selectedAt
    if (!requestedAt || (!playing && active?.future)) return undefined

    const end = new Date(requestedAt)
    if (!Number.isFinite(end.getTime())) return undefined
    const cached = trackingCacheRef.current.get(requestedAt)
    const polledAt = Date.now()
    // Historical `valid=` snapshots are immutable. LSR is not: late reports
    // may enter its exact six-hour window, so only its half of the pair is
    // re-polled at the declared one-minute cadence.
    //
    // The cached attribute LayerState is reused verbatim, freshness included,
    // and that is deliberate — see the archival-query rule in the provider
    // contract §7.1. Re-normalising it against the current clock would age a
    // finished past scan into `stale-expired` and report correct historical
    // evidence as a dead source. Do not "fix" this into a re-poll.
    // Only a *completed* archival response is immutable. A fetch failure is
    // recoverable, so it must never enter the cache: caching it pinned the
    // frame's attributes to "unavailable" for the component's lifetime while
    // LSR kept polling beside it, turning one transient IEM hiccup into a
    // permanent dead source on a frame whose evidence was fine.
    const cachedAttributes = cached?.attributes?.status === 'ready' ? cached.attributes : null

    if (cachedAttributes && cached?.reports && polledAt - cached.reportPolledAt < 60_000) {
      setTrackingLayerStates([cached.reports, cachedAttributes])
      setTrackingFrameAt(requestedAt)
      return undefined
    }

    const controller = new AbortController()
    const ets = end.toISOString()
    const sts = new Date(end.getTime() - 6 * 60 * 60 * 1000).toISOString()

    const attributes = cachedAttributes
      ? Promise.resolve(cachedAttributes)
      : fetchIemAttributesLayer({ valid: requestedAt, signal: controller.signal })
    Promise.all([
      fetchIemLsrLayer({ sts, ets }, controller.signal),
      attributes,
    ]).then(([reports, nextAttributes]) => {
      if (!controller.signal.aborted) {
        trackingCacheRef.current.set(requestedAt, {
          reports,
          attributes: nextAttributes?.status === 'ready' ? nextAttributes : null,
          reportPolledAt: polledAt,
        })
        setTrackingLayerStates([reports, nextAttributes])
        setTrackingFrameAt(requestedAt)
      }
    })

    return () => controller.abort()
  }, [selectedAt, playing, active?.future, trackingFrameAt, trackingPoll])

  // Re-evaluate the active LSR window on the product's declared poll cadence.
  // This never runs while the imagery animation is advancing frames.
  useEffect(() => {
    if (!selectedAt && !trackingFrameAt) return undefined
    const id = setInterval(() => setTrackingPoll((value) => value + 1), 60_000)
    return () => clearInterval(id)
  }, [selectedAt, trackingFrameAt])

  // Attribute markers are client-side visual scope only. The IEM endpoint's
  // recorded contract has no spatial parameter, so a pan changes no request;
  // it merely redraws the already-normalised data within the visible map.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined

    trackingLayersRef.current.forEach((layer) => layer.remove())
    trackingLayersRef.current.clear()

    const bounds = map.getBounds()
    const drawTrackingFrame = !playing && !active?.future && trackingFrameAt === selectedAt
    for (const entry of trackingStack) {
      if (!drawTrackingFrame || entry.status !== 'ready' || !visibleOfficialLayers.has(entry.layerId) || entry.features.length === 0) continue
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
  }, [trackingStack, visibleOfficialLayers, viewportRevision, playing, active?.future, trackingFrameAt === selectedAt])

  // --- frames ------------------------------------------------------------
  // Keep the reconciler's view of the current selection current without
  // putting `frames`/`index` in the refresh effect's dependencies.
  useEffect(() => {
    framesRef.current = frames
    selectedPathRef.current = frames[index]?.path ?? null
  }, [frames, index])

  // The RainViewer index is a moving window: it publishes a new frame about
  // every ten minutes and drops the oldest. Fetching it once per mount froze
  // the timeline, so a Radar tab left open kept presenting its mount-time
  // newest frame as the live edge while every layer card underneath reported
  // healthy. The index is therefore re-fetched on its own half-cadence, and on
  // return to a hidden tab so coming back is correct immediately rather than
  // up to five minutes later.
  useEffect(() => {
    const controller = new AbortController()

    const loadFrames = () => fetchRadarFrames(controller.signal)
      .then(({ host, frames: list, nowIndex }) => {
        const map = mapRef.current
        if (!map || controller.signal.aborted || list.length === 0) return

        const previous = framesRef.current
        const previousPath = selectedPathRef.current

        // A host change invalidates every cached tile URL; rebuild rather than
        // leave earlier frames pointing at the old origin.
        if (hostRef.current !== null && hostRef.current !== host) {
          layersRef.current.forEach((layer) => layer.remove())
          layersRef.current.clear()
        }
        hostRef.current = host

        // Every frame becomes a layer up front and animation is opacity-only.
        // Adding and removing layers per tick makes the loop flicker while the
        // incoming frame's tiles are still downloading.
        const nextPaths = new Set(list.map((frame) => frame.path))
        for (const [path, layer] of layersRef.current) {
          if (nextPaths.has(path)) continue
          layer.remove()
          layersRef.current.delete(path)
        }
        for (const frame of list) {
          if (layersRef.current.has(frame.path)) continue
          const layer = L.tileLayer(tileUrlTemplate(host, frame.path), {
            opacity: 0,
            zIndex: 10,
            tileSize: TILE_SIZE,
          })
          layer.addTo(map)
          layersRef.current.set(frame.path, layer)
        }

        // Tracking evidence is cached per frame, so it must age out with the
        // window it belongs to. Without this a tab left open all day retains a
        // full attribute set for every frame that ever scrolled past.
        const liveInstants = new Set(list.map((frame) => new Date(frame.time * 1000).toISOString()))
        for (const instant of trackingCacheRef.current.keys()) {
          if (!liveInstants.has(instant)) trackingCacheRef.current.delete(instant)
        }

        setFrames(list)
        setIndex(reconcileFrameSelection({ previous, previousPath, next: list }))
        setStatus('ready')
        setError(null)
      })
      .catch((err) => {
        if (err.name === 'AbortError' || controller.signal.aborted) return
        // A failed refresh must not discard a radar that is already drawn.
        // Only a cold failure, with nothing on screen, is an error state.
        if (framesRef.current.length > 0) return
        setError(err.message || 'Could not load radar.')
        setStatus('error')
      })

    loadFrames()
    const refresh = setInterval(loadFrames, FRAME_INDEX_REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadFrames()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(refresh)
      document.removeEventListener('visibilitychange', onVisible)
      controller.abort()
    }
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

  // A pinned panel has to be dismissible without hunting down the same small
  // control again — Escape, or a press anywhere outside the layer list.
  useEffect(() => {
    if (!openDetailLayerId) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpenDetailLayerId(null)
    }
    // pointerdown, not click: it fires for touch and mouse alike, and lands
    // before the info button's own click so switching panels still works.
    const onPointerDown = (event) => {
      if (!event.target?.closest?.('.radar__layer')) setOpenDetailLayerId(null)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [openDetailLayerId])

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
            <p>Toggle a layer on or off. Use its <span aria-hidden="true">i</span><span className="visually-hidden">info</span> control for source, timing, and scope.</p>
          </div>
        </div>
        <ul className="radar__layer-list">
          {deskStack.map((layer) => {
            const visible = visibleOfficialLayers.has(layer.layerId)
            const frameLabel = layerFrameLabel(layer, selectedAt, trackingFrameAt, playing, Boolean(active?.future))
            const countLabel = `${layer.count} ${layer.authority === 'signature' ? 'cells' : layer.authority === 'report' ? 'reports' : 'areas'}`
            const tooltipId = `radar-layer-tooltip-${layer.layerId}`
            const detailOpen = openDetailLayerId === layer.layerId
            return (
              <li
                className={`radar__layer radar__layer--${layer.status} ${visible ? '' : 'radar__layer--hidden'} ${detailOpen ? 'radar__layer--detail-open' : ''}`}
                data-layer-id={layer.layerId}
                key={layer.layerId}
                style={{ '--layer-color': layer.color }}
              >
                <button
                  type="button"
                  className="radar__layer-toggle radar__layer-toggle--pill"
                  aria-pressed={visible}
                  aria-describedby={tooltipId}
                  aria-label={`${layer.label}: ${visible ? 'enabled' : 'disabled'}, ${layerHealthLabel(layer)}, ${countLabel}. Focus for source and timeline details.`}
                  onClick={() => toggleOfficialLayer(layer.layerId)}
                >
                  <span aria-hidden="true" className="radar__layer-indicator" />
                  <span className="radar__layer-pill-label">{layer.label}</span>
                  <span aria-hidden="true" className="radar__layer-pill-state">{visible ? 'On' : 'Off'}</span>
                  <span aria-hidden="true" className={`radar__layer-pill-count radar__layer-pill-count--${layer.health}`}>
                    {layer.status === 'unavailable' ? 'Unavailable' : countLabel}
                  </span>
                </button>
                {/* Touch has no hover, and the toggle was the only focusable
                    element in the pill — so the one gesture that revealed
                    provenance also switched the layer off. This gives reading
                    the details its own control, on every input device. */}
                <button
                  type="button"
                  className="radar__layer-info"
                  aria-expanded={detailOpen}
                  aria-controls={tooltipId}
                  aria-label={`${detailOpen ? 'Hide' : 'Show'} source, timing, and scope details for ${layer.label}`}
                  onClick={() => setOpenDetailLayerId((current) => (current === layer.layerId ? null : layer.layerId))}
                >
                  <span aria-hidden="true">i</span>
                </button>
                <div className="radar__layer-detail" id={tooltipId}>
                  <p className="radar__layer-source">{layer.sourceLine ?? 'Source unavailable.'}</p>
                  <time className="radar__layer-time" dateTime={layer.observedAt ?? undefined}>
                    {layerTimeLabel(layer)}
                  </time>
                  <div className="radar__layer-meta">
                    <span className={`radar__layer-health radar__layer-health--${layer.health}`}>{layerHealthLabel(layer)}</span>
                    <span className="radar__layer-frame">{frameLabel}</span>
                    <span className="radar__layer-count">{countLabel}</span>
                  </div>
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
              <span>{active ? `${active.future ? 'Forecast' : 'Observed'} · ${frameClock(active.time)}` : 'Select a frame'}</span>
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

      <div className="radar__map-legend" aria-label="Severe desk map legend">
        {deskStack.map((layer) => (
          <span key={layer.layerId} style={{ '--layer-color': layer.color }}><i aria-hidden="true" />{layer.label}</span>
        ))}
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
