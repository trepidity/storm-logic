/** Cached NCEP GEFS ensemble proxy for tomorrow's numeric spread. */

import { UNIT_PRESETS } from '../../src/lib/format.js'

const OPEN_METEO_ENSEMBLE = 'https://ensemble-api.open-meteo.com/v1/ensemble'

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

export function buildUpstreamConfidenceUrl({ latitude, longitude, unitId = 'imperial', coordDecimals = 2 }) {
  const units = UNIT_PRESETS[unitId] ?? UNIT_PRESETS.imperial
  const params = new URLSearchParams({
    latitude: Number(latitude).toFixed(coordDecimals),
    longitude: Number(longitude).toFixed(coordDecimals),
    hourly: 'temperature_2m,precipitation',
    models: 'ncep_gefs_seamless',
    forecast_days: '2',
    timezone: 'auto',
    temperature_unit: units.temperature_unit,
    precipitation_unit: units.precipitation_unit,
  })
  return `${OPEN_METEO_ENSEMBLE}?${params}`
}

export default async function handler(request) {
  const params = new URL(request.url).searchParams
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return json({ error: 'Invalid or missing lat/lon.' }, 400)
  }

  const upstream = buildUpstreamConfidenceUrl({
    latitude: lat,
    longitude: lon,
    unitId: params.get('units') ?? 'imperial',
    coordDecimals: 2,
  })

  try {
    const res = await fetch(upstream, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json(
        { error: 'Ensemble weather service error.', status: res.status, detail: detail.slice(0, 300) },
        502,
      )
    }

    return json(await res.json(), 200, {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      // NCEP GEFS seamless updates every 12 hours. Three hours keeps a shared
      // cache useful without letting a new run remain stale for a full cycle.
      'Netlify-CDN-Cache-Control': 'public, s-maxage=10800, stale-while-revalidate=10800',
    })
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    return json(
      { error: timedOut ? 'Ensemble weather service timed out.' : 'Could not reach ensemble weather service.' },
      504,
    )
  }
}
