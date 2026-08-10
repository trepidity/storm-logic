/**
 * US AQI (EPA-style) helpers for the Air tab.
 *
 * StormLogic uses the United States AQI scale globally — not European AQI or
 * local national indices. Open-Meteo exposes this as `current.us_aqi`.
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
