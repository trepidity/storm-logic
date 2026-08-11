import { buildNwsWarningsPath, normaliseNwsAreaCodes } from '../nwsWarningRequest.js'

const LAYER_ID = 'warnings'
const CAP = 250
const CADENCE_MS = 30_000

export const NWS_WARNING_SOURCE = Object.freeze({
  name: 'NWS API',
  attribution: 'National Weather Service',
  authority: 'warning',
  product: 'watches-warnings-advisories',
  isFallback: false,
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function validPosition(position) {
  return Array.isArray(position) && position.length >= 2 && Number.isFinite(position[0]) && Number.isFinite(position[1])
}

function validRing(ring) {
  return Array.isArray(ring) && ring.length >= 4 && ring.every(validPosition)
}

function validPolygon(polygon) {
  return Array.isArray(polygon) && polygon.length > 0 && polygon.every(validRing)
}

function normaliseGeometry(geometry) {
  if (!isRecord(geometry)) return null
  if (geometry.type === 'Polygon' && validPolygon(geometry.coordinates)) return geometry
  if (
    geometry.type === 'MultiPolygon' &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length > 0 &&
    geometry.coordinates.every(validPolygon)
  ) {
    return geometry
  }
  return null
}

export function unavailableNwsWarnings(reason = 'upstream-error', lastKnownAt = null) {
  return {
    status: 'unavailable',
    layerId: LAYER_ID,
    source: NWS_WARNING_SOURCE,
    reason,
    lastKnownAt: validTimestamp(lastKnownAt) ? lastKnownAt : null,
  }
}

function normaliseFeature(feature, selectedAt, event) {
  if (!isRecord(feature) || !isRecord(feature.properties)) return null
  const properties = feature.properties
  const id = typeof feature.id === 'string' ? feature.id : typeof properties['@id'] === 'string' ? properties['@id'] : null
  const effectiveAt = properties.effective
  const expiresAt = properties.expires
  const issuedAt = properties.sent
  const eventName = properties.event
  const headline = properties.headline
  const geometry = normaliseGeometry(feature.geometry)
  const effectiveMs = Date.parse(effectiveAt)
  const expiresMs = Date.parse(expiresAt)

  if (
    !id ||
    typeof eventName !== 'string' ||
    !eventName.trim() ||
    typeof headline !== 'string' ||
    !headline.trim() ||
    !validTimestamp(issuedAt) ||
    !validTimestamp(effectiveAt) ||
    !validTimestamp(expiresAt) ||
    !geometry ||
    String(properties.status ?? '').toLowerCase() !== 'actual' ||
    String(properties.messageType ?? '').toLowerCase() === 'cancel' ||
    effectiveMs > selectedAt ||
    expiresMs <= selectedAt ||
    (event !== null && eventName !== event)
  ) {
    return null
  }

  return {
    id,
    event: eventName,
    headline,
    severity: typeof properties.severity === 'string' ? properties.severity : 'Unknown',
    issuedAt,
    effectiveAt,
    expiresAt,
    geometry,
  }
}

/**
 * Parses one NWS GeoJSON response into the provider-agnostic warning layer.
 * This boundary intentionally drops every feature that cannot prove both its
 * official active status and its original Polygon/MultiPolygon geometry.
 */
export function normaliseNwsWarningFeed(payload, { receivedAt, polledAt, selectedAt = polledAt, event = null } = {}) {
  if (!isRecord(payload) || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features) || !validTimestamp(payload.updated)) {
    return unavailableNwsWarnings()
  }

  const received = validTimestamp(receivedAt) ? receivedAt : new Date().toISOString()
  const polled = validTimestamp(polledAt) ? polledAt : received
  const selected = validTimestamp(selectedAt) ? Date.parse(selectedAt) : Date.parse(polled)
  if (!Number.isFinite(selected)) return unavailableNwsWarnings()

  const selectedFeatures = payload.features
    .map((feature) => normaliseFeature(feature, selected, event))
    .filter((feature) => feature !== null)
  const features = selectedFeatures.slice(0, CAP)
  const total = selectedFeatures.length

  return {
    status: 'ready',
    layerId: LAYER_ID,
    source: NWS_WARNING_SOURCE,
    clock: {
      observedAt: payload.updated,
      receivedAt: received,
      polledAt: polled,
      validFrom: features.length ? features.reduce((earliest, feature) => (feature.effectiveAt < earliest ? feature.effectiveAt : earliest), features[0].effectiveAt) : null,
      validTo: features.length ? features.reduce((latest, feature) => (feature.expiresAt > latest ? feature.expiresAt : latest), features[0].expiresAt) : null,
      cadenceMs: CADENCE_MS,
    },
    freshness: 'fresh',
    emptiness: features.length ? 'populated' : 'no-data-in-window',
    features,
    truncated:
      total > CAP
        ? { shown: features.length, total, exact: true, upstreamTruncated: false }
        : null,
  }
}

/** Fetches the desk-only regional warning feed through the production proxy. */
export async function fetchNwsWarnings({ areaCodes, event = null, signal, now = null, selectedAt = null } = {}) {
  if (!normaliseNwsAreaCodes(areaCodes)) return unavailableNwsWarnings('not-configured')
  const path = buildNwsWarningsPath(areaCodes, event)
  const polledAt = validTimestamp(now) ? now : new Date().toISOString()

  try {
    const response = await fetch(path, { signal, headers: { Accept: 'application/json' } })
    if (!response.ok) return unavailableNwsWarnings()
    const payload = await response.json()
    const receivedAt = validTimestamp(now) ? now : new Date().toISOString()
    return normaliseNwsWarningFeed(payload, {
      receivedAt,
      polledAt,
      selectedAt: validTimestamp(selectedAt) ? selectedAt : polledAt,
      event,
    })
  } catch {
    return unavailableNwsWarnings()
  }
}
