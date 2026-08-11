/**
 * L1 provider-boundary proof for T-SD-10. The committed NWS payload is the
 * independent wire artifact; the added geometry variants exercise the product
 * rule that only active, authoritative polygons may cross this boundary.
 *
 * Run: node scripts/severe-desk-nws-warnings-test.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import handler from '../netlify/functions/nws-warnings.mjs'
import { fetchNwsWarnings, normaliseNwsWarningFeed } from '../src/lib/severeDesk/adapters/nwsWarnings.js'
import { layerStateIssues } from '../src/lib/severeDesk/layerState.js'

const fixturePath = new URL('../fixtures/severe-desk/nws-alerts/nominal.json', import.meta.url)
const recordedFeed = JSON.parse(await readFile(fixturePath, 'utf8'))
const requestTime = '2026-08-10T22:00:00Z'
const geometry = {
  type: 'Polygon',
  coordinates: [[[-98.1, 38.9], [-97.9, 38.9], [-97.9, 39.1], [-98.1, 39.1], [-98.1, 38.9]]],
}

function fixtureFeature(overrides = {}) {
  const { properties: propertyOverrides = {}, ...featureOverrides } = overrides
  return {
    id: 'https://api.weather.gov/alerts/fixture-active',
    type: 'Feature',
    geometry,
    ...featureOverrides,
    properties: {
      id: 'fixture-active',
      event: 'Severe Thunderstorm Warning',
      headline: 'Fixture warning',
      severity: 'Severe',
      status: 'Actual',
      messageType: 'Alert',
      sent: '2026-08-10T21:40:00Z',
      effective: '2026-08-10T21:45:00Z',
      expires: '2026-08-10T22:30:00Z',
      ...propertyOverrides,
    },
  }
}

function feed(features) {
  return { type: 'FeatureCollection', updated: '2026-08-10T21:59:00Z', features }
}

// The actual multi-state capture is valid but contains only zone-based alerts
// with null geometry. That must become a calm/empty layer, not an error and not
// a made-up polygon.
const noGeometry = normaliseNwsWarningFeed(recordedFeed, { receivedAt: requestTime, polledAt: requestTime, selectedAt: requestTime })
assert.equal(noGeometry.status, 'ready')
assert.equal(noGeometry.emptiness, 'no-data-in-window')
assert.deepEqual(noGeometry.features, [])
assert.deepEqual(layerStateIssues(noGeometry), [])

const filtered = normaliseNwsWarningFeed(
  feed([
    fixtureFeature(),
    fixtureFeature({ id: 'cancelled', properties: { messageType: 'Cancel' } }),
    fixtureFeature({ id: 'expired', properties: { expires: '2026-08-10T21:59:59Z' } }),
    fixtureFeature({ id: 'missing-geometry', geometry: null }),
  ]),
  { receivedAt: requestTime, polledAt: requestTime, selectedAt: requestTime },
)
assert.equal(filtered.status, 'ready')
assert.equal(filtered.emptiness, 'populated')
assert.equal(filtered.features.length, 1)
assert.deepEqual(layerStateIssues(filtered), [])
assert.deepEqual(filtered.features[0], {
  id: 'https://api.weather.gov/alerts/fixture-active',
  event: 'Severe Thunderstorm Warning',
  headline: 'Fixture warning',
  severity: 'Severe',
  issuedAt: '2026-08-10T21:40:00Z',
  effectiveAt: '2026-08-10T21:45:00Z',
  expiresAt: '2026-08-10T22:30:00Z',
  geometry,
})

const eventMismatch = normaliseNwsWarningFeed(feed([fixtureFeature()]), {
  receivedAt: requestTime,
  polledAt: requestTime,
  selectedAt: requestTime,
  event: 'Tornado Warning',
})
assert.equal(eventMismatch.status, 'ready')
assert.equal(eventMismatch.emptiness, 'no-data-in-window')
assert.deepEqual(eventMismatch.features, [])

const malformed = normaliseNwsWarningFeed({ type: 'FeatureCollection', features: [] }, { receivedAt: requestTime, polledAt: requestTime })
assert.equal(malformed.status, 'unavailable')
assert.equal('features' in malformed, false)

const originalFetch = globalThis.fetch
try {
  let upstream
  globalThis.fetch = async (url, options) => {
    upstream = { url: String(url), options }
    return new Response(JSON.stringify(recordedFeed), { status: 200 })
  }

  const proxyResponse = await handler(
    new Request('https://stormlogic.example/.netlify/functions/nws-warnings?area=ks,mo'),
  )
  assert.equal(proxyResponse.status, 200)
  assert.equal(upstream.url, 'https://api.weather.gov/alerts/active?area=KS%2CMO')
  assert.equal(upstream.options.headers.Accept, 'application/geo+json')
  assert.equal(proxyResponse.headers.get('Netlify-CDN-Cache-Control'), 'public, s-maxage=30, stale-while-revalidate=60')

  let called = false
  globalThis.fetch = async () => {
    called = true
    throw new Error('invalid request must not reach NWS')
  }
  const tooBroad = await handler(
    new Request('https://stormlogic.example/.netlify/functions/nws-warnings?area=KS,MO,IA,NE,OK'),
  )
  assert.equal(tooBroad.status, 400)
  assert.equal(called, false)

  const marineRegion = await handler(
    new Request('https://stormlogic.example/.netlify/functions/nws-warnings?area=KS&region=CONUS'),
  )
  assert.equal(marineRegion.status, 400)
  assert.equal(called, false)

  let clientUrl
  globalThis.fetch = async (url) => {
    clientUrl = String(url)
    return new Response(JSON.stringify(recordedFeed), { status: 200 })
  }
  const client = await fetchNwsWarnings({ areaCodes: ['KS', 'MO'], event: 'Severe Thunderstorm Warning', now: requestTime })
  assert.equal(client.status, 'ready')
  assert.equal(client.emptiness, 'no-data-in-window')
  assert.equal(clientUrl, '/api/nws-warnings?area=KS%2CMO&event=Severe+Thunderstorm+Warning')

  globalThis.fetch = async () => new Response(JSON.stringify(feed([fixtureFeature()])), { status: 200 })
  const selectedAfterExpiry = await fetchNwsWarnings({
    areaCodes: ['KS'],
    now: requestTime,
    selectedAt: '2026-08-10T22:31:00Z',
  })
  assert.equal(selectedAfterExpiry.status, 'ready')
  assert.equal(selectedAfterExpiry.emptiness, 'no-data-in-window')
  assert.deepEqual(selectedAfterExpiry.features, [])

  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })
  const unavailable = await fetchNwsWarnings({ areaCodes: ['KS'], now: requestTime })
  assert.equal(unavailable.status, 'unavailable')
  assert.equal('features' in unavailable, false)
} finally {
  globalThis.fetch = originalFetch
}

console.log('NWS warning adapter boundary: passed')
