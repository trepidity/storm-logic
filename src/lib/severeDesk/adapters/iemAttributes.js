const ATTRIBUTE_CADENCE_MS = 300_000

const SOURCE = Object.freeze({
  name: 'Iowa Environmental Mesonet',
  attribution: 'Iowa Environmental Mesonet (IEM)',
  authority: 'signature',
  product: 'NEXRAD storm attributes',
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

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null
}

function freshnessFor(polledAt, now) {
  const age = now - polledAt
  if (age <= ATTRIBUTE_CADENCE_MS) return 'fresh'
  if (age <= ATTRIBUTE_CADENCE_MS * 3) return 'aging'
  if (age <= ATTRIBUTE_CADENCE_MS * 6) return 'stale'
  return null
}

function unavailable(lastKnownAt = null, reason = 'upstream-error') {
  return {
    status: 'unavailable',
    layerId: 'storm-attributes',
    source: SOURCE,
    reason,
    lastKnownAt,
  }
}

function normaliseAttribute(feature) {
  const properties = feature?.properties
  const coordinates = coordinatePair(feature?.geometry)
  const scanAt = properties && parseTime(properties.valid) !== null ? properties.valid : null
  const sourceVolume = typeof properties?.nexrad === 'string' && properties.nexrad.trim() ? properties.nexrad : null
  if (feature?.id === null || feature?.id === undefined || !coordinates || !scanAt || !sourceVolume) return null

  const directionDegrees = numberOrNull(properties.drct)
  const speedKnots = numberOrNull(properties.sknt)
  return {
    id: String(feature.id),
    sourceVolume,
    scanAt,
    coordinates,
    stormId: typeof properties.storm_id === 'string' && properties.storm_id.trim() ? properties.storm_id : null,
    attributes: {
      azimuthDegrees: numberOrNull(properties.azimuth),
      rangeNauticalMiles: numberOrNull(properties.range),
      tornadoVortexSignature: typeof properties.tvs === 'string' ? properties.tvs : null,
      mesocyclone: typeof properties.meso === 'string' ? properties.meso : null,
      probabilityOfSevereHail: numberOrNull(properties.posh),
      probabilityOfHail: numberOrNull(properties.poh),
      maxHailSizeInches: numberOrNull(properties.max_size),
      verticallyIntegratedLiquid: numberOrNull(properties.vil),
      maxReflectivityDbz: numberOrNull(properties.max_dbz),
      maxReflectivityHeightKft: numberOrNull(properties.max_dbz_height),
      echoTopKft: numberOrNull(properties.top),
    },
    // A vector is optional. A missing half is absence, not a trajectory we
    // infer from the remaining data; no persistent track is emitted here.
    motion: directionDegrees === null || speedKnots === null ? null : { directionDegrees, speedKnots },
  }
}

/** Convert IEM's scan-scoped GeoJSON into a signature LayerState. */
export function normaliseIemAttributes(payload, { receivedAt, polledAt, now = Date.now() } = {}) {
  const receivedMs = parseTime(receivedAt)
  const polledMs = parseTime(polledAt)
  const nowMs = typeof now === 'number' ? now : parseTime(now)
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features) || receivedMs === null || polledMs === null || nowMs === null) {
    return unavailable(polledAt ?? null)
  }

  const features = payload.features.map(normaliseAttribute)
  if (features.some((feature) => feature === null)) return unavailable(polledAt)

  const freshness = freshnessFor(polledMs, nowMs)
  if (!freshness) return unavailable(polledAt, 'stale-expired')

  const generatedAt = parseTime(payload.generated_at) === null ? polledAt : payload.generated_at
  return {
    status: 'ready',
    layerId: 'storm-attributes',
    source: SOURCE,
    clock: {
      observedAt: generatedAt,
      receivedAt,
      polledAt,
      validFrom: null,
      validTo: null,
      cadenceMs: ATTRIBUTE_CADENCE_MS,
    },
    freshness,
    emptiness: features.length ? 'populated' : 'no-data-in-window',
    features,
    truncated: null,
  }
}

export function unavailableIemAttributes(reason = 'upstream-error', lastKnownAt = null) {
  return unavailable(lastKnownAt, reason)
}

export function normaliseIemAttributesFailure({ lastKnownAt = null } = {}) {
  return unavailableIemAttributes('upstream-error', lastKnownAt)
}
