/**
 * L1 provider-boundary proof for Wave D.  These assertions drive the recorded
 * IEM payloads through the adapters and the two production proxy handlers.
 *
 * Mutations caught: treating a quiet feed as an outage, letting malformed
 * provider geometry through, deriving feed freshness from a report timestamp,
 * or inventing a motion vector / regional upstream filter.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import iemLsrHandler from '../netlify/functions/severe-desk-iem-lsr.mjs'
import iemAttributesHandler from '../netlify/functions/severe-desk-iem-attributes.mjs'
import { normaliseIemLsr, normaliseIemLsrFailure } from '../src/lib/severeDesk/adapters/iemLsr.js'
import { normaliseIemAttributes, normaliseIemAttributesFailure } from '../src/lib/severeDesk/adapters/iemAttributes.js'
import { fetchIemLsrLayer } from '../src/lib/severeDesk/clients/iemLsrClient.js'
import { fetchIemAttributesLayer } from '../src/lib/severeDesk/clients/iemAttributesClient.js'
import { isLayerState } from '../src/lib/severeDesk/layerState.js'

const load = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const lsrNominal = await load('../fixtures/severe-desk/iem-lsr/nominal.json')
const lsrEmpty = await load('../fixtures/severe-desk/iem-lsr/empty.json')
const lsrMalformed = await load('../fixtures/severe-desk/iem-lsr/malformed.json')
const attrsNominal = await load('../fixtures/severe-desk/iem-attributes/nominal.json')
const attrsEmpty = await load('../fixtures/severe-desk/iem-attributes/empty.json')
const attrsMalformed = await load('../fixtures/severe-desk/iem-attributes/malformed.json')

const polledAt = '2026-08-11T01:10:00Z'
const freshNow = '2026-08-11T01:10:30Z'

const reports = normaliseIemLsr(lsrNominal, { receivedAt: polledAt, polledAt, now: freshNow })
assert.equal(reports.status, 'ready')
assert.equal(reports.source.authority, 'report')
assert.equal(reports.source.product, 'Local Storm Reports')
assert.equal(reports.freshness, 'fresh', 'a fresh feed cannot become stale because its reports are historical')
const firstRecordedReport = reports.features.find((feature) => feature.id === '0')
assert.equal(firstRecordedReport.phenomenon, 'TSTM WND DMG')
assert.equal(firstRecordedReport.reportAt, '2026-08-10T20:45:00Z')
assert.deepEqual(firstRecordedReport.coordinates, { longitude: -79.22, latitude: 37.39 })
assert.equal(reports.truncated.shown, 500)
assert.equal(reports.truncated.total, 686)
assert.equal(reports.truncated.exact, true)
assert.equal(isLayerState(reports), true)

const quietReports = normaliseIemLsr(lsrEmpty, { receivedAt: polledAt, polledAt, now: freshNow })
assert.deepEqual(
  [quietReports.status, quietReports.emptiness, quietReports.features],
  ['ready', 'no-data-in-window', []],
  'a successfully fetched calm window is not an unavailable feed',
)
assert.equal(isLayerState(quietReports), true)
assert.equal(normaliseIemLsr(lsrMalformed, { receivedAt: polledAt, polledAt, now: freshNow }).status, 'unavailable')
assert.equal(normaliseIemLsrFailure({ lastKnownAt: polledAt }).reason, 'upstream-error')

const attributes = normaliseIemAttributes(attrsNominal, { receivedAt: polledAt, polledAt, now: freshNow })
assert.equal(attributes.status, 'ready')
assert.equal(attributes.source.authority, 'signature')
assert.equal(attributes.source.product, 'NEXRAD storm attributes')
assert.deepEqual(
  attributes.features[0],
  {
    id: '0',
    sourceVolume: 'AMX',
    scanAt: '2026-08-11T00:53:55Z',
    coordinates: { longitude: -81.44938512954985, latitude: 27.10660836487092 },
    stormId: 'G1',
    attributes: {
      azimuthDegrees: 328,
      rangeNauticalMiles: 196,
      tornadoVortexSignature: 'NONE',
      mesocyclone: 'NONE',
      probabilityOfSevereHail: 0,
      probabilityOfHail: 60,
      maxHailSizeInches: 0.5,
      verticallyIntegratedLiquid: 24,
      maxReflectivityDbz: 54,
      maxReflectivityHeightKft: 17.6,
      echoTopKft: 28.4,
    },
    motion: { directionDegrees: 209, speedKnots: 6 },
  },
)
assert.equal(isLayerState(attributes), true)

const noVectorPayload = structuredClone(attrsNominal)
delete noVectorPayload.features[0].properties.drct
delete noVectorPayload.features[0].properties.sknt
assert.equal(
  normaliseIemAttributes(noVectorPayload, { receivedAt: polledAt, polledAt, now: freshNow }).features[0].motion,
  null,
  'a missing motion vector stays absent; the adapter must not create a track',
)
const quietAttributes = normaliseIemAttributes(attrsEmpty, { receivedAt: polledAt, polledAt, now: freshNow })
assert.deepEqual([quietAttributes.status, quietAttributes.emptiness, quietAttributes.features], ['ready', 'no-data-in-window', []])
assert.equal(isLayerState(quietAttributes), true)
assert.equal(normaliseIemAttributes(attrsMalformed, { receivedAt: polledAt, polledAt, now: freshNow }).status, 'unavailable')
assert.equal(normaliseIemAttributesFailure({ lastKnownAt: polledAt }).reason, 'upstream-error')

const originalFetch = globalThis.fetch
try {
  let lsrRequest
  globalThis.fetch = async (url, options) => {
    lsrRequest = { url: String(url), options }
    return new Response(JSON.stringify(lsrEmpty), { status: 200 })
  }
  const lsrResponse = await iemLsrHandler(new Request('https://stormlogic.example/.netlify/functions/severeDesk/iemLsr?sts=2026-08-10T18%3A00%3A00Z&ets=2026-08-11T00%3A00%3A00Z&wfos=TOP'))
  assert.equal(lsrResponse.status, 200)
  assert.equal(lsrRequest.url, 'https://mesonet.agron.iastate.edu/geojson/lsr.py?sts=2026-08-10T18%3A00%3A00Z&ets=2026-08-11T00%3A00%3A00Z&wfos=TOP')
  assert.equal(lsrRequest.options.headers.Accept, 'application/geo+json')
  assert.equal(lsrResponse.headers.get('Netlify-CDN-Cache-Control'), 'public, s-maxage=60, stale-while-revalidate=120')

  let attributesRequest
  globalThis.fetch = async (url, options) => {
    attributesRequest = { url: String(url), options }
    return new Response(JSON.stringify(attrsEmpty), { status: 200 })
  }
  const attributesResponse = await iemAttributesHandler(new Request('https://stormlogic.example/.netlify/functions/severeDesk/iemAttributes'))
  assert.equal(attributesResponse.status, 200)
  assert.equal(attributesRequest.url, 'https://mesonet.agron.iastate.edu/geojson/nexrad_attr.py')
  assert.equal(attributesRequest.options.headers.Accept, 'application/geo+json')
  assert.equal(attributesResponse.headers.get('Netlify-CDN-Cache-Control'), 'public, s-maxage=120, stale-while-revalidate=240')

  let attributeAttempts = 0
  globalThis.fetch = async () => {
    attributeAttempts += 1
    if (attributeAttempts === 1) {
      const timeout = new Error('cold IEM response timed out')
      timeout.name = 'TimeoutError'
      throw timeout
    }
    return new Response(JSON.stringify(attrsEmpty), { status: 200 })
  }
  const recoveredAttributes = await iemAttributesHandler(new Request('https://stormlogic.example/.netlify/functions/severeDesk/iemAttributes'))
  assert.equal(recoveredAttributes.status, 200, 'one transient IEM timeout must receive one bounded proxy retry')
  assert.equal(attributeAttempts, 2, 'the proxy must retry the cold upstream once, not return a flaky one-shot failure')

  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('must not fetch') }
  const spatialClaim = await iemAttributesHandler(new Request('https://stormlogic.example/.netlify/functions/severeDesk/iemAttributes?region=KS'))
  assert.equal(spatialClaim.status, 422)
  assert.equal(called, false, 'the proxy must not make an unverified regional IEM attributes request')

  const unsupportedLsrScope = await iemLsrHandler(new Request('https://stormlogic.example/.netlify/functions/severeDesk/iemLsr?sts=2026-08-10T18%3A00%3A00Z&ets=2026-08-11T00%3A00%3A00Z&region=KS'))
  assert.equal(unsupportedLsrScope.status, 422)
  assert.equal(called, false, 'the LSR proxy must reject an invented region parameter rather than ignore it')

  let clientUrl
  globalThis.fetch = async (url) => {
    clientUrl = String(url)
    return new Response(JSON.stringify(lsrEmpty), { status: 200 })
  }
  const clientReports = await fetchIemLsrLayer(
    { sts: '2026-08-10T18:00:00Z', ets: '2026-08-11T00:00:00Z', wfos: 'TOP' },
    undefined,
    { now: freshNow },
  )
  assert.equal(clientUrl, '/api/severeDesk/iemLsr?sts=2026-08-10T18%3A00%3A00Z&ets=2026-08-11T00%3A00%3A00Z&wfos=TOP')
  assert.deepEqual([clientReports.status, clientReports.emptiness], ['ready', 'no-data-in-window'])

  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'unavailable' }), { status: 502 })
  assert.deepEqual(
    [
      (await fetchIemAttributesLayer({ now: freshNow })).status,
      (await fetchIemAttributesLayer({ now: freshNow })).reason,
    ],
    ['unavailable', 'upstream-error'],
    'a failed proxy cannot become an empty attributes collection',
  )
} finally {
  globalThis.fetch = originalFetch
}

console.log('IEM Wave D adapter contracts: passed')
