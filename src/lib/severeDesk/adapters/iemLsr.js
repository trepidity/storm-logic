const LSR_CADENCE_MS = 60_000
const LSR_CAP = 500

const SOURCE = Object.freeze({
  name: 'Iowa Environmental Mesonet',
  attribution: 'Iowa Environmental Mesonet (IEM)',
  authority: 'report',
  product: 'Local Storm Reports',
  isFallback: false,
})

function parseTime(value) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : null
}

function coordinatePair(geometry) {
  const coordinates = geometry?.type === 'Point' ? geometry.coordinates : null
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const [longitude, latitude] = coordinates
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    return null
  }
  return { longitude, latitude }
}

function freshnessFor(polledAt, now) {
  const age = now - polledAt
  if (age <= LSR_CADENCE_MS) return 'fresh'
  if (age <= LSR_CADENCE_MS * 3) return 'aging'
  if (age <= LSR_CADENCE_MS * 6) return 'stale'
  return null
}

function unavailable(lastKnownAt = null, reason = 'upstream-error') {
  return {
    status: 'unavailable',
    layerId: 'storm-reports',
    source: SOURCE,
    reason,
    lastKnownAt,
  }
}

function normaliseReport(feature) {
  const properties = feature?.properties
  const coordinates = coordinatePair(feature?.geometry)
  const reportAt = properties && parseTime(properties.valid) !== null ? properties.valid : null
  const phenomenon = typeof properties?.typetext === 'string' && properties.typetext.trim() ? properties.typetext : null
  if (feature?.id === null || feature?.id === undefined || !coordinates || !reportAt || !phenomenon) return null

  return {
    id: String(feature.id),
    phenomenon,
    qualifier: typeof properties.qualifier === 'string' && properties.qualifier.trim() ? properties.qualifier : null,
    reportAt,
    coordinates,
  }
}

/**
 * Convert an IEM LSR GeoJSON response to the provider-agnostic LayerState.
 * Report timestamps remain on each feature; feed freshness is calculated only
 * from the successful poll.  T-SD-22 owns selected-time windowing.
 */
export function normaliseIemLsr(payload, { receivedAt, polledAt, now = Date.now() } = {}) {
  const receivedMs = parseTime(receivedAt)
  const polledMs = parseTime(polledAt)
  const nowMs = typeof now === 'number' ? now : parseTime(now)
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features) || receivedMs === null || polledMs === null || nowMs === null) {
    return unavailable(polledAt ?? null)
  }

  const normalised = payload.features.map(normaliseReport)
  if (normalised.some((feature) => feature === null)) return unavailable(polledAt)

  const freshness = freshnessFor(polledMs, nowMs)
  if (!freshness) return unavailable(polledAt, 'stale-expired')

  const features = normalised
    .sort((left, right) => Date.parse(right.reportAt) - Date.parse(left.reportAt))
    .slice(0, LSR_CAP)

  return {
    status: 'ready',
    layerId: 'storm-reports',
    source: SOURCE,
    // IEM provides no collection timestamp. The feed clock is therefore the
    // only collection-level observation time; each report keeps `reportAt`.
    clock: {
      observedAt: polledAt,
      receivedAt,
      polledAt,
      validFrom: null,
      validTo: null,
      cadenceMs: LSR_CADENCE_MS,
    },
    freshness,
    emptiness: features.length ? 'populated' : 'no-data-in-window',
    features,
    truncated: features.length < normalised.length
      ? { shown: features.length, total: normalised.length, exact: true, upstreamTruncated: false }
      : null,
  }
}

export function unavailableIemLsr(reason = 'upstream-error', lastKnownAt = null) {
  return unavailable(lastKnownAt, reason)
}

export function normaliseIemLsrFailure({ lastKnownAt = null } = {}) {
  return unavailableIemLsr('upstream-error', lastKnownAt)
}
