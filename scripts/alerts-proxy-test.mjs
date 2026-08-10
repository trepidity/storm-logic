/** Behaviour proof for the NWS boundary: point rounding, cache lifetime and
 * the expected out-of-coverage response all come from the actual handler. */
import assert from 'node:assert/strict'
import handler from '../netlify/functions/alerts.mjs'

const originalFetch = globalThis.fetch
const featureCollection = { type: 'FeatureCollection', features: [] }

try {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options }
    return new Response(JSON.stringify(featureCollection), { status: 200 })
  }

  const success = await handler(
    new Request('https://stormlogic.example/.netlify/functions/alerts?lat=41.8781&lon=-87.6298'),
  )
  assert.equal(success.status, 200)
  assert.deepEqual(await success.json(), featureCollection)
  assert.equal(
    captured.url,
    'https://api.weather.gov/alerts/active?point=41.88%2C-87.63',
    'nearby places must share the two-decimal cache bucket',
  )
  assert.equal(captured.options.headers.Accept, 'application/geo+json')
  assert.equal(success.headers.get('Netlify-CDN-Cache-Control'), 'public, s-maxage=30, stale-while-revalidate=60')

  globalThis.fetch = async () => new Response('outside coverage', { status: 400 })
  const coverage = await handler(
    new Request('https://stormlogic.example/.netlify/functions/alerts?lat=51.5072&lon=-0.1276'),
  )
  assert.equal(coverage.status, 422)
  assert.equal((await coverage.json()).error, 'NWS alerts are unavailable for this location.')

  let called = false
  globalThis.fetch = async () => {
    called = true
    throw new Error('should not fetch')
  }
  const invalid = await handler(
    new Request('https://stormlogic.example/.netlify/functions/alerts?lat=not-a-number&lon=-87.63'),
  )
  assert.equal(invalid.status, 400)
  assert.equal(called, false, 'invalid coordinates must be rejected before an upstream request')
} finally {
  globalThis.fetch = originalFetch
}

console.log('NWS alerts proxy behaviour: passed')
