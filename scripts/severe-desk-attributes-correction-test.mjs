/**
 * Corrected IEM attributes contract, driven through the proxy handler,
 * recorded v1.4 provider fixtures, adapter, and tracking projection.
 *
 * Mutation caught: a `valid=` request being rejected or silently ignored,
 * response-generation time presented as observation time, an upstream-selected
 * historical snapshot re-windowed in the browser, or future emptiness typed
 * as a failed source.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import attributesHandler from '../netlify/functions/severe-desk-iem-attributes.mjs'
import { normaliseIemAttributes } from '../src/lib/severeDesk/adapters/iemAttributes.js'
import { coordinateTrackingLayers } from '../src/lib/severeDesk/trackingTimeCoordinator.js'

const load = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const historical = await load('../fixtures/severe-desk/iem-attributes/valid-historical.json')
const liveEdgeOneSided = await load('../fixtures/severe-desk/iem-attributes/valid-live-edge-one-sided.json')
const futureEmpty = await load('../fixtures/severe-desk/iem-attributes/valid-future-empty.json')
const ignored = await load('../fixtures/severe-desk/iem-attributes/ignored-parameter.json')
const requestedAt = '2026-08-11T13:40:00Z'
const liveEdgeRequestedAt = '2026-08-11T19:00:00Z'
const pollAt = '2026-08-11T15:10:00Z'

const scanTimes = (payload) => payload.features.map((feature) => Date.parse(feature.properties.valid))
const latestScan = new Date(Math.max(...scanTimes(historical))).toISOString().replace('.000Z', 'Z')

const originalFetch = globalThis.fetch
try {
  let upstream
  globalThis.fetch = async (url) => {
    upstream = String(url)
    return new Response(JSON.stringify(historical), { status: 200, headers: { 'Content-Type': 'application/vnd.geo+json' } })
  }
  const accepted = await attributesHandler(new Request(`https://stormlogic.example/.netlify/functions/severe-desk-iem-attributes?valid=${encodeURIComponent(requestedAt)}`))
  assert.equal(accepted.status, 200, 'the proxy must accept the recorded valid= parameter')
  assert.equal(upstream, `https://mesonet.agron.iastate.edu/geojson/nexrad_attr.py?valid=${encodeURIComponent(requestedAt)}`, 'the proxy must forward only the requested valid= instant')
  assert.equal(accepted.headers.get('Netlify-CDN-Cache-Control'), 'public, s-maxage=86400, stale-while-revalidate=604800', 'an immutable valid= snapshot must not use the live cache budget')

  upstream = null
  const rejected = await attributesHandler(new Request(`https://stormlogic.example/.netlify/functions/severe-desk-iem-attributes?valid_time=${encodeURIComponent(requestedAt)}`))
  assert.equal(rejected.status, 422, 'the proxy must reject an unrecognised parameter before IEM can silently ignore it')
  assert.equal(upstream, null, 'an unrecognised parameter must never reach IEM')
} finally {
  globalThis.fetch = originalFetch
}

const historicalState = normaliseIemAttributes(historical, { receivedAt: pollAt, polledAt: pollAt, now: pollAt, requestedAt })
assert.equal(historicalState.status, 'ready', 'a bracketed historical valid= response is source-healthy')
assert.equal(historicalState.clock.observedAt, latestScan, 'the layer observation clock must be an actual feature scan time, never generated_at')
assert.equal(historicalState.features.length, historical.features.length, 'the adapter retains each upstream-selected site scan')

const liveEdgeState = normaliseIemAttributes(liveEdgeOneSided, {
  receivedAt: pollAt,
  polledAt: pollAt,
  now: pollAt,
  requestedAt: liveEdgeRequestedAt,
})
assert.equal(
  liveEdgeState.status,
  'ready',
  'a one-sided live-edge valid= response remains source-healthy when every scan is within the recorded proximity bound',
)
assert.equal(
  liveEdgeState.features.length,
  liveEdgeOneSided.features.length,
  'the adapter must retain a valid one-sided live-edge scan selection rather than call it unavailable',
)

const projectedHistorical = coordinateTrackingLayers([historicalState], requestedAt)[0]
assert.equal(projectedHistorical.status, 'ready')
assert.equal(projectedHistorical.features.length, 300, 'the approved display cap still applies')
assert.equal(projectedHistorical.truncated.total, historical.features.length, 'the client must not re-window a valid= response that IEM already selected upstream')

const futureState = normaliseIemAttributes(futureEmpty, { receivedAt: pollAt, polledAt: pollAt, now: pollAt, requestedAt: '2030-01-01T00:00:00Z' })
assert.deepEqual([futureState.status, futureState.emptiness, futureState.features], ['ready', 'no-data-in-window', []], 'an accepted future valid= empty response is calm/no-data, not source failure')

const ignoredState = normaliseIemAttributes(ignored, { receivedAt: pollAt, polledAt: pollAt, now: pollAt, requestedAt })
assert.deepEqual([ignoredState.status, ignoredState.reason], ['unavailable', 'upstream-error'], 'a well-formed response whose scan range misses requested valid= must fail closed')

console.log('IEM v1.7 attributes correction contract: passed')
