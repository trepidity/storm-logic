/**
 * L1 recorded-provider contract proof for T-SD-11.
 *
 * The committed NOAA SPC payloads are the independent expectation at this
 * boundary. This catches an adapter that relabels a probabilistic outlook as a
 * warning, substitutes fetch time for the issuance, or lets a broken payload
 * masquerade as a quiet day.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import handler from '../netlify/functions/severe-desk-spc.mjs'
import { normaliseSpcOutlook } from '../src/lib/severeDesk/adapters/spcOutlook.js'

const fixtureRoot = new URL('../fixtures/severe-desk/noaa-spc/', import.meta.url)
const load = async (name) => JSON.parse(await readFile(new URL(`${name}.json`, fixtureRoot), 'utf8'))
const context = Object.freeze({
  hazard: 'hail',
  receivedAt: '2026-08-11T00:58:40Z',
  polledAt: '2026-08-11T00:58:40Z',
  selectedAt: '2026-08-10T20:00:00Z',
})

const nominal = normaliseSpcOutlook(await load('nominal'), context)
assert.equal(nominal.status, 'ready')
assert.deepEqual(nominal.source, {
  name: 'NOAA Storm Prediction Center',
  attribution: 'NOAA Storm Prediction Center',
  authority: 'outlook',
  product: 'Day 1 hail probability outlook',
  isFallback: false,
})
assert.equal(nominal.clock.observedAt, '2026-08-10T19:20:00Z', 'the issued product time, not fetch time, is the layer clock')
assert.equal(nominal.clock.validFrom, '2026-08-10T20:00:00Z')
assert.equal(nominal.clock.validTo, '2026-08-11T12:00:00Z')
assert.equal(nominal.emptiness, 'populated')
assert.equal(nominal.features.length, 1)
assert.deepEqual(nominal.features[0].properties, {
  kind: 'probability',
  hazard: 'hail',
  probability: '0.05',
  label: '5% Hail Risk',
  issuedAt: '2026-08-10T19:20:00Z',
  validFrom: '2026-08-10T20:00:00Z',
  validTo: '2026-08-11T12:00:00Z',
})

const quiet = normaliseSpcOutlook(await load('empty'), context)
assert.deepEqual(
  [quiet.status, quiet.emptiness, quiet.features],
  ['ready', 'no-data-in-window', []],
  'a valid empty outlook response is a calm/out-of-window result, not a provider outage',
)

for (const name of ['malformed', 'upstream-failure']) {
  const unavailable = normaliseSpcOutlook(await load(name), context)
  assert.deepEqual(
    unavailable,
    {
      status: 'unavailable',
      layerId: 'spc-outlooks',
      source: nominal.source,
      reason: 'upstream-error',
      lastKnownAt: null,
    },
    `${name} input must fail closed without rendering borrowed outlook geometry`,
  )
}

const expired = normaliseSpcOutlook(await load('nominal'), {
  ...context,
  selectedAt: '2026-08-11T12:00:01Z',
})
assert.deepEqual(
  [expired.status, expired.reason, expired.lastKnownAt, 'features' in expired],
  ['unavailable', 'out-of-window', '2026-08-10T19:20:00Z', false],
  'an expired outlook never borrows its nearest prior geometry',
)

const originalFetch = globalThis.fetch
try {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options }
    return new Response(JSON.stringify(await load('nominal')), { status: 200 })
  }

  const response = await handler(
    new Request('https://stormlogic.example/.netlify/functions/severe-desk-spc?day=1&hazard=hail&bbox=-102,36,-94,41'),
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), await load('nominal'))
  assert.equal(
    captured.url,
    'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/5/query?where=1%3D1&geometry=-102%2C36%2C-94%2C41&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=geojson',
    'the Day 1 hail proxy must use NOAA SPC layer 5, a fixed-region envelope, and native GeoJSON',
  )
  assert.equal(captured.options.headers.Accept, 'application/geo+json')
  assert.equal(response.headers.get('Netlify-CDN-Cache-Control'), 'public, s-maxage=300, stale-while-revalidate=600')

  globalThis.fetch = async () => new Response('SPC unavailable', { status: 503 })
  const upstreamFailure = await handler(
    new Request('https://stormlogic.example/.netlify/functions/severe-desk-spc?day=1&hazard=hail&bbox=-102,36,-94,41'),
  )
  assert.equal(upstreamFailure.status, 502)
  assert.deepEqual(await upstreamFailure.json(), { error: 'NOAA SPC outlook service error.' })

  let called = false
  globalThis.fetch = async () => {
    called = true
    throw new Error('invalid request must not reach NOAA')
  }
  const invalid = await handler(
    new Request('https://stormlogic.example/.netlify/functions/severe-desk-spc?day=2&hazard=hail'),
  )
  assert.equal(invalid.status, 400)
  assert.equal(called, false)

  const missingRegion = await handler(
    new Request('https://stormlogic.example/.netlify/functions/severe-desk-spc?day=1&hazard=hail'),
  )
  assert.equal(missingRegion.status, 400)
  assert.equal(called, false, 'a desk request without a fixed region must not fetch all-CONUS geometry')
} finally {
  globalThis.fetch = originalFetch
}

console.log('Severe-desk SPC adapter and proxy behaviour: passed')
