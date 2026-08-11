/**
 * NOAA SPC Day-1 Outlook adapter.
 *
 * This is the only Severe Desk module that knows the ArcGIS/SPC property
 * names. Its output is the provider-agnostic LayerState consumed by the
 * registry and, later, Radar composition.
 */

const DAY_ONE_HAZARDS = Object.freeze({
  categorical: Object.freeze({ layer: 1, product: 'Day 1 categorical outlook', kind: 'categorical' }),
  tornado: Object.freeze({ layer: 3, product: 'Day 1 tornado probability outlook', kind: 'probability' }),
  hail: Object.freeze({ layer: 5, product: 'Day 1 hail probability outlook', kind: 'probability' }),
  wind: Object.freeze({ layer: 7, product: 'Day 1 wind probability outlook', kind: 'probability' }),
})

// The Day-1 SPC issuance cycle has no gap longer than seven hours. It is the
// source's freshness window; the proxy's five-minute cache is only a detection
// budget and must not replace the issued product time.
export const SPC_OUTLOOK_CADENCE_MS = 7 * 60 * 60 * 1000

export function dayOneHazard(hazard) {
  return DAY_ONE_HAZARDS[hazard] ?? null
}

function sourceFor(hazard) {
  const definition = dayOneHazard(hazard)
  return {
    name: 'NOAA Storm Prediction Center',
    attribution: 'NOAA Storm Prediction Center',
    authority: 'outlook',
    product: definition?.product ?? 'Day 1 severe outlook',
    isFallback: false,
  }
}

export function unavailableSpcOutlook(hazard = null, reason = 'upstream-error', lastKnownAt = null) {
  return {
    status: 'unavailable',
    layerId: 'spc-outlooks',
    source: sourceFor(hazard),
    reason,
    lastKnownAt,
  }
}

function parseSpcTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{12}$/.test(value)) return null

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const hour = Number(value.slice(8, 10))
  const minute = Number(value.slice(10, 12))
  const stamp = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (
    stamp.getUTCFullYear() !== year ||
    stamp.getUTCMonth() !== month - 1 ||
    stamp.getUTCDate() !== day ||
    stamp.getUTCHours() !== hour ||
    stamp.getUTCMinutes() !== minute
  ) {
    return null
  }
  return stamp.toISOString().replace('.000Z', 'Z')
}

function parseIsoTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().replace('.000Z', 'Z') : null
}

function validPosition(position) {
  return Array.isArray(position) && position.length >= 2 && Number.isFinite(position[0]) && Number.isFinite(position[1])
}

function validCoordinates(value) {
  if (!Array.isArray(value)) return false
  if (value.length === 0) return false
  if (typeof value[0] === 'number') return validPosition(value)
  return value.every(validCoordinates)
}

function validGeometry(geometry) {
  return geometry !== null &&
    typeof geometry === 'object' &&
    (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') &&
    validCoordinates(geometry.coordinates)
}

function freshness(issuedAt, receivedAt) {
  const ageMs = Date.parse(receivedAt) - Date.parse(issuedAt)
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 6 * SPC_OUTLOOK_CADENCE_MS) return null
  if (ageMs <= SPC_OUTLOOK_CADENCE_MS) return 'fresh'
  if (ageMs <= 3 * SPC_OUTLOOK_CADENCE_MS) return 'aging'
  return 'stale'
}

function normaliseFeature(feature, hazard) {
  if (feature === null || typeof feature !== 'object' || !validGeometry(feature.geometry)) return null
  const properties = feature.properties
  if (properties === null || typeof properties !== 'object') return null

  const issuedAt = parseSpcTimestamp(properties.issue)
  const validFrom = parseSpcTimestamp(properties.valid)
  const validTo = parseSpcTimestamp(properties.expire)
  const label = typeof properties.label2 === 'string' && properties.label2.trim() ? properties.label2.trim() : null
  const probability = typeof properties.label === 'string' && properties.label.trim() ? properties.label.trim() : null
  const definition = dayOneHazard(hazard)

  if (!issuedAt || !validFrom || !validTo || !label || !definition || (definition.kind === 'probability' && !probability)) return null
  if (Date.parse(validFrom) >= Date.parse(validTo)) return null

  return {
    type: 'Feature',
    id: feature.id ?? properties.objectid ?? null,
    geometry: feature.geometry,
    properties: {
      kind: definition.kind,
      hazard,
      probability,
      label,
      issuedAt,
      validFrom,
      validTo,
    },
  }
}

/**
 * Normalise one recorded/live NOAA SPC GeoJSON response into LayerState.
 * Invalid payloads become featureless unavailable state rather than a calm-day
 * result, since a provider failure must never draw plausible old geometry.
 */
export function normaliseSpcOutlook(payload, context) {
  const hazard = context?.hazard
  const receivedAt = parseIsoTimestamp(context?.receivedAt)
  const polledAt = parseIsoTimestamp(context?.polledAt)
  const selectedAt = parseIsoTimestamp(context?.selectedAt ?? context?.receivedAt)
  if (!dayOneHazard(hazard) || !receivedAt || !polledAt || !selectedAt) return unavailableSpcOutlook(hazard, 'upstream-error')
  if (payload === null || typeof payload !== 'object' || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    return unavailableSpcOutlook(hazard, 'upstream-error')
  }

  if (payload.features.length === 0) {
    return {
      status: 'ready',
      layerId: 'spc-outlooks',
      source: sourceFor(hazard),
      clock: {
        // A successful empty query has no product issuance to preserve. This
        // is the response observation time, not a substituted prior issuance.
        observedAt: receivedAt,
        receivedAt,
        polledAt,
        validFrom: null,
        validTo: null,
        cadenceMs: SPC_OUTLOOK_CADENCE_MS,
      },
      freshness: 'fresh',
      emptiness: 'no-data-in-window',
      features: [],
      truncated: null,
    }
  }

  const features = payload.features.map((feature) => normaliseFeature(feature, hazard))
  if (features.some((feature) => feature === null)) return unavailableSpcOutlook(hazard, 'upstream-error')

  const issuedAt = features[0].properties.issuedAt
  const validFrom = features[0].properties.validFrom
  const validTo = features[0].properties.validTo
  if (!features.every((feature) => feature.properties.issuedAt === issuedAt && feature.properties.validFrom === validFrom && feature.properties.validTo === validTo)) {
    return unavailableSpcOutlook(hazard, 'upstream-error')
  }

  const stateFreshness = freshness(issuedAt, receivedAt)
  if (!stateFreshness) return unavailableSpcOutlook(hazard, 'stale-expired', issuedAt)
  if (Date.parse(selectedAt) < Date.parse(validFrom) || Date.parse(selectedAt) > Date.parse(validTo)) {
    return unavailableSpcOutlook(hazard, 'out-of-window', issuedAt)
  }

  return {
    status: 'ready',
    layerId: 'spc-outlooks',
    source: sourceFor(hazard),
    clock: {
      observedAt: issuedAt,
      receivedAt,
      polledAt,
      validFrom,
      validTo,
      cadenceMs: SPC_OUTLOOK_CADENCE_MS,
    },
    freshness: stateFreshness,
    emptiness: 'populated',
    features,
    truncated: null,
  }
}
