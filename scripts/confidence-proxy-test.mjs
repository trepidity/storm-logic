/**
 * L1 behavior proof for the production ensemble boundary. It drives the real
 * Netlify handler and observes the upstream request/caching contract instead
 * of asserting a helper's implementation details.
 */
import assert from 'node:assert/strict'
import handler from '../netlify/functions/confidence.mjs'

const originalFetch = globalThis.fetch

try {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options }
    return new Response(JSON.stringify({ hourly: { time: [] } }), { status: 200 })
  }

  const success = await handler(
    new Request('https://stormlogic.example/.netlify/functions/confidence?lat=41.8781&lon=-87.6298&units=imperial'),
  )
  assert.equal(success.status, 200)
  assert.deepEqual(await success.json(), { hourly: { time: [] } })
  assert.equal(
    captured.url,
    'https://ensemble-api.open-meteo.com/v1/ensemble?latitude=41.88&longitude=-87.63&hourly=temperature_2m%2Cprecipitation&models=ncep_gefs_seamless&forecast_days=2&timezone=auto&temperature_unit=fahrenheit&precipitation_unit=inch',
    'nearby places must share the confidence cache bucket and preserve the fixed ensemble contract',
  )
  assert.equal(captured.options.headers.Accept, 'application/json')
  assert.equal(
    success.headers.get('Netlify-CDN-Cache-Control'),
    'public, s-maxage=10800, stale-while-revalidate=10800',
  )

  let called = false
  globalThis.fetch = async () => {
    called = true
    throw new Error('should not fetch')
  }
  const invalid = await handler(
    new Request('https://stormlogic.example/.netlify/functions/confidence?lat=not-a-number&lon=-87.63'),
  )
  assert.equal(invalid.status, 400)
  assert.equal(called, false, 'invalid coordinates must be rejected before an upstream request')
} finally {
  globalThis.fetch = originalFetch
}

console.log('Ensemble confidence proxy behaviour: passed')
