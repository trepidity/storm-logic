/** Behaviour proof for the air-quality proxy: point rounding, cache lifetime
 * and invalid-coordinate rejection all come from the actual handler. */
import assert from 'node:assert/strict'
import handler, { buildUpstreamAirQualityUrl } from '../netlify/functions/air.mjs'

const originalFetch = globalThis.fetch
const samplePayload = {
  latitude: 41.88,
  longitude: -87.63,
  current: { time: '2026-08-10T12:00', interval: 3600, us_aqi: 53 },
}

try {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options }
    return new Response(JSON.stringify(samplePayload), { status: 200 })
  }

  const success = await handler(
    new Request('https://stormlogic.example/.netlify/functions/air?lat=41.8781&lon=-87.6298'),
  )
  assert.equal(success.status, 200)
  assert.deepEqual(await success.json(), samplePayload)
  assert.equal(
    captured.url,
    'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=41.88&longitude=-87.63&current=us_aqi&timezone=auto',
    'nearby places must share the two-decimal cache bucket',
  )
  assert.equal(captured.options.headers.Accept, 'application/json')
  assert.equal(
    success.headers.get('Netlify-CDN-Cache-Control'),
    'public, s-maxage=900, stale-while-revalidate=3600',
  )

  // Helper used by the handler must match the captured URL shape.
  assert.equal(
    buildUpstreamAirQualityUrl({ latitude: 41.8781, longitude: -87.6298, coordDecimals: 2 }),
    captured.url,
  )

  globalThis.fetch = async () => new Response('upstream broken', { status: 500 })
  const upstreamError = await handler(
    new Request('https://stormlogic.example/.netlify/functions/air?lat=41.88&lon=-87.63'),
  )
  assert.equal(upstreamError.status, 502)
  assert.equal((await upstreamError.json()).error, 'Upstream air quality service error.')

  let called = false
  globalThis.fetch = async () => {
    called = true
    throw new Error('should not fetch')
  }
  const invalid = await handler(
    new Request('https://stormlogic.example/.netlify/functions/air?lat=not-a-number&lon=-87.63'),
  )
  assert.equal(invalid.status, 400)
  assert.equal(called, false, 'invalid coordinates must be rejected before an upstream request')

  const outOfRange = await handler(
    new Request('https://stormlogic.example/.netlify/functions/air?lat=99&lon=0'),
  )
  assert.equal(outOfRange.status, 400)
  assert.equal(called, false)
} finally {
  globalThis.fetch = originalFetch
}

console.log('Air quality proxy behaviour: passed')
