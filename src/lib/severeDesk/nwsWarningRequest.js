/** The ratified NWS desk request model: at most four land state/territory codes.
 * `region` is deliberately absent because NWS reserves it for marine regions. */
const LAND_AREA_CODES = new Set([
  'AL', 'AK', 'AS', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'GU', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY',
  'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MP', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK',
  'OR', 'PA', 'PR', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VI', 'VT', 'WA', 'WI', 'WV', 'WY',
])

function areaParts(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split(',')
  return []
}

/** Returns canonical NWS `area` codes or null for an unconfigured desk region. */
export function normaliseNwsAreaCodes(value) {
  const codes = areaParts(value).map((code) => String(code).trim().toUpperCase())
  if (!codes.length || codes.length > 4 || codes.some((code) => !LAND_AREA_CODES.has(code))) return null
  return [...new Set(codes)]
}

export function buildNwsWarningsPath(areaCodes, event = null) {
  const codes = normaliseNwsAreaCodes(areaCodes)
  if (!codes) return null

  const params = new URLSearchParams({ area: codes.join(',') })
  if (typeof event === 'string' && event.trim()) params.set('event', event.trim())
  return `/api/nws-warnings?${params}`
}

export function buildNwsActiveAlertsUrl(areaCodes, event = null) {
  const path = buildNwsWarningsPath(areaCodes, event)
  if (!path) return null
  return `https://api.weather.gov/alerts/active?${path.split('?')[1]}`
}
