/**
 * US AQI (EPA-style) helpers for the Air tab.
 *
 * Product scope is **U.S. locations only** (CONUS, Alaska, Hawaii, PR/USVI).
 * Open-Meteo can return `us_aqi` worldwide, but StormLogic does not surface Air
 * outside U.S. coverage — same honesty pattern as the NWS Alerts tab.
 *
 * Bands (EPA):
 *   0–50   Good
 *   51–100 Moderate
 *   101–150 Unhealthy for Sensitive Groups
 *   151–200 Unhealthy
 *   201–300 Very Unhealthy
 *   301+   Hazardous
 */

/** Primary UI label for the scale — keep exact. */
export const US_AQI_LABEL = 'US AQI'

/**
 * Approximate U.S. air-coverage footprint (product gate, not a legal boundary).
 * Open-Meteo will still answer elsewhere; we choose not to ask or show it.
 */
export function isUsAqiCoverage(latitude, longitude) {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false

  // Contiguous United States (incl. light border margin).
  if (lat >= 24.5 && lat <= 49.5 && lon >= -125 && lon <= -66.5) return true
  // Alaska
  if (lat >= 51 && lat <= 72 && lon >= -180 && lon <= -129) return true
  // Hawaii
  if (lat >= 18.5 && lat <= 22.5 && lon >= -161 && lon <= -154) return true
  // Puerto Rico / U.S. Virgin Islands
  if (lat >= 17.5 && lat <= 18.6 && lon >= -68 && lon <= -64.5) return true

  return false
}

/**
 * Map a numeric US AQI value to its EPA category band.
 * @param {number} value
 * @returns {{ key: string, label: string } | null}
 */
export function usAqiCategory(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null

  if (value <= 50) return { key: 'good', label: 'Good' }
  if (value <= 100) return { key: 'moderate', label: 'Moderate' }
  if (value <= 150) return { key: 'usg', label: 'Unhealthy for Sensitive Groups' }
  if (value <= 200) return { key: 'unhealthy', label: 'Unhealthy' }
  if (value <= 300) return { key: 'very-unhealthy', label: 'Very Unhealthy' }
  return { key: 'hazardous', label: 'Hazardous' }
}

/**
 * Normalise an Open-Meteo air-quality current payload into a panel-ready shape.
 *
 * @param {unknown} payload
 * @returns {{ usAqi: number, time: string | null, category: { key: string, label: string } } | null}
 */
export function normaliseCurrentAirQuality(payload) {
  const current = payload && typeof payload === 'object' ? payload.current : null
  if (!current || typeof current !== 'object') return null

  const raw = current.us_aqi
  // Open-Meteo may return null when the model has no value for the cell.
  if (raw == null || raw === '') return null

  const usAqi = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(usAqi)) return null

  const category = usAqiCategory(usAqi)
  if (!category) return null

  const time = typeof current.time === 'string' && current.time ? current.time : null
  return { usAqi, time, category }
}
