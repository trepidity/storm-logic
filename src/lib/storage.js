/**
 * Persistence layer.
 *
 * Everything lives in localStorage under a versioned namespace. Bump NS when the
 * stored shape changes and old entries are simply ignored rather than migrated —
 * this is preference data, not something worth a migration path.
 *
 * localStorage throws rather than no-ops in some environments (Safari private
 * browsing, storage disabled by policy, quota exceeded). Every access here is
 * guarded and falls back to an in-memory store, so the app degrades to
 * session-only memory instead of crashing on load.
 */

const NS = 'stormlogic:v1'
const memory = new Map()

const backend = (() => {
  try {
    const probe = `${NS}:__probe`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
})()

export const isPersistent = backend !== null

function read(key, fallback) {
  const full = `${NS}:${key}`
  try {
    const raw = backend ? backend.getItem(full) : memory.get(full)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

function write(key, value) {
  const full = `${NS}:${key}`
  const raw = JSON.stringify(value)
  try {
    if (backend) backend.setItem(full, raw)
    else memory.set(full, raw)
  } catch {
    // Quota exceeded or storage revoked mid-session — keep the value for this
    // session so the UI stays consistent, and stop trying to persist it.
    memory.set(full, raw)
  }
}

/**
 * Stable identity for a place. Geocoding results carry an `id`, but a
 * geolocated position has none, and the same city reached both ways should
 * dedupe — so coordinates are the key. Three decimals is ~110m, close enough
 * that re-locating in the same town doesn't create a duplicate entry.
 */
export function placeKey(place) {
  if (!place) return ''
  return `${Number(place.latitude).toFixed(3)},${Number(place.longitude).toFixed(3)}`
}

/** Strip a place down to what's worth persisting. */
export function normalisePlace(place) {
  if (!place || !Number.isFinite(Number(place.latitude)) || !Number.isFinite(Number(place.longitude))) {
    return null
  }
  return {
    key: placeKey(place),
    name: place.name ?? place.label ?? 'Unknown',
    label: place.label ?? place.name ?? 'Unknown',
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    admin1: place.admin1 ?? '',
    country: place.country ?? '',
    isGeo: place.id === 'geo',
  }
}

function sanitiseList(value, limit) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const out = []
  for (const entry of value) {
    const place = normalisePlace(entry)
    if (!place || seen.has(place.key)) continue
    seen.add(place.key)
    out.push(place)
    if (out.length >= limit) break
  }
  return out
}

export const FAVORITES_LIMIT = 12
export const RECENTS_LIMIT = 6

export const loadFavorites = () => sanitiseList(read('favorites', []), FAVORITES_LIMIT)
export const saveFavorites = (list) => write('favorites', list)

export const loadRecents = () => sanitiseList(read('recents', []), RECENTS_LIMIT)
export const saveRecents = (list) => write('recents', list)

export const loadLastPlace = () => normalisePlace(read('lastPlace', null))
export const saveLastPlace = (place) => write('lastPlace', place)

export function loadUnitId(fallback = 'imperial') {
  const value = read('unitId', fallback)
  return value === 'metric' || value === 'imperial' ? value : fallback
}
export const saveUnitId = (id) => write('unitId', id)

/** Set once we've attempted geolocation, so a denied prompt isn't re-raised every visit. */
export const loadHasOnboarded = () => read('onboarded', false) === true
export const saveHasOnboarded = () => write('onboarded', true)
