/**
 * Cached proxy for NOAA SPC Day-1 outlook GeoJSON.
 *
 * This handler deliberately returns provider-shaped GeoJSON. The source-aware
 * adapter owns SPC field names and turns it into LayerState; composition never
 * sees this payload.
 */
import { dayOneHazard } from '../../src/lib/severeDesk/adapters/spcOutlook.js'

const SPC_DAY_ONE = 'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer'

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

function parseBoundingBox(value) {
  if (typeof value !== 'string') return null
  const values = value.split(',').map(Number)
  if (values.length !== 4 || values.some((coordinate) => !Number.isFinite(coordinate))) return null
  const [west, south, east, north] = values
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null
  return { west, south, east, north }
}

export function buildSpcOutlookUrl(hazard, bbox) {
  const definition = dayOneHazard(hazard)
  if (!definition || !bbox) return null
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    f: 'geojson',
  })
  return `${SPC_DAY_ONE}/${definition.layer}/query?${params}`
}

export default async function handler(request) {
  const params = new URL(request.url).searchParams
  const day = params.get('day')
  const hazard = params.get('hazard')
  const bbox = parseBoundingBox(params.get('bbox'))
  if (day !== '1' || !dayOneHazard(hazard) || !bbox) {
    return json({ error: 'Only Day 1 categorical, tornado, hail, or wind outlooks are available.' }, 400)
  }

  const upstream = buildSpcOutlookUrl(hazard, bbox)
  try {
    const response = await fetch(upstream, {
      headers: {
        Accept: 'application/geo+json',
        'User-Agent': 'StormLogic severe desk',
      },
      signal: AbortSignal.timeout(9000),
    })
    if (!response.ok) return json({ error: 'NOAA SPC outlook service error.' }, 502)

    return json(await response.json(), 200, {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    })
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    return json({ error: timedOut ? 'NOAA SPC outlook service timed out.' : 'Could not reach NOAA SPC outlook service.' }, 504)
  }
}
