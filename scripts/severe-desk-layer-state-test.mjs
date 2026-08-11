/**
 * SC-SD-LAYER's no-network consumer seam.
 *
 * The fixture is provider-agnostic LayerState, not an upstream payload. The
 * projector is the Radar-facing consumer: it may expose a ready layer's
 * features, but a failed or malformed candidate can only become a labelled
 * absence. Run: npm run test:severe-desk-layer
 */
import { readFile } from 'node:fs/promises'
import { projectRadarLayerStack } from '../src/lib/severeDesk/radarLayerStack.js'

const fixturePath = new URL('../fixtures/layer-state/contract-states.json', import.meta.url)
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
const results = []

function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

function state(layerId) {
  return fixture.states.find((candidate) => candidate.layerId === layerId)
}

if (fixture.schemaVersion !== 1 || !Array.isArray(fixture.states)) {
  throw new Error('Layer-state fixture must provide schemaVersion 1 and states.')
}

const stack = projectRadarLayerStack(fixture.states)
check(
  'Radar consumer orders accepted layers by the approved z-order',
  stack.map((entry) => entry.layerId),
  ['reflectivity', 'warnings', 'storm-reports'],
)

const reflectivity = stack.find((entry) => entry.layerId === 'reflectivity')
check(
  'a ready populated observation exposes its source, product, time, and features',
  reflectivity,
  {
    layerId: 'reflectivity',
    zIndex: 20,
    label: 'Reflectivity',
    authority: 'observation',
    status: 'ready',
    sourceLine: 'Recorded composite radar · composite reflectivity',
    observedAt: '2026-08-10T18:00:00Z',
    freshness: 'fresh',
    message: null,
    features: [{ id: 'fixture-reflectivity-frame' }],
  },
)

const reports = stack.find((entry) => entry.layerId === 'storm-reports')
check(
  'a successfully fetched empty feed remains ready and says no data in the selected window',
  reports,
  {
    layerId: 'storm-reports',
    zIndex: 60,
    label: 'Storm reports',
    authority: 'report',
    status: 'ready',
    sourceLine: 'Recorded storm reports · local storm reports',
    observedAt: '2026-08-10T18:00:00Z',
    freshness: 'fresh',
    message: 'No storm reports in the selected window.',
    features: [],
  },
)

const warnings = stack.find((entry) => entry.layerId === 'warnings')
check(
  'an unavailable layer renders a labelled absence and never a last-known feature',
  warnings,
  {
    layerId: 'warnings',
    zIndex: 40,
    label: 'Official alerts',
    authority: 'warning',
    status: 'unavailable',
    sourceLine: 'Recorded official alerts · watches, warnings, and advisories',
    observedAt: '2026-08-10T17:59:30Z',
    freshness: null,
    message: 'Official alerts unavailable.',
    features: [],
  },
)

// Negative path: a stale feature smuggled into an unavailable object must not
// reach the Radar consumer. This catches the product bug where a broken feed
// still draws yesterday's plausible geometry.
const staleLeak = structuredClone(state('warnings'))
staleLeak.features = [{ id: 'must-not-render' }]
const projectedLeak = projectRadarLayerStack([staleLeak])[0]
check('an unavailable candidate with stale features is rejected to a featureless absence', projectedLeak.features, [])

// A source authority cannot be substituted just because its feature shape
// happens to fit. This catches a warning/report/estimate being rendered under
// the wrong legend class.
const wrongAuthority = structuredClone(state('warnings'))
wrongAuthority.source.authority = 'observation'
const projectedAuthorityMismatch = projectRadarLayerStack([wrongAuthority])[0]
check(
  'a source whose authority disagrees with its registered layer is unavailable',
  [projectedAuthorityMismatch.status, projectedAuthorityMismatch.features],
  ['unavailable', []],
)

// `no-data` is deliberately not an unavailable reason. A malformed candidate
// must fail closed rather than turn an outage into a calm-weather message.
const conflated = structuredClone(state('storm-reports'))
conflated.status = 'unavailable'
delete conflated.emptiness
conflated.reason = 'no-data'
const projectedConflation = projectRadarLayerStack([conflated])[0]
check(
  'the deleted no-data unavailable reason cannot masquerade as a calm feed',
  [projectedConflation.status, projectedConflation.message, projectedConflation.features],
  ['unavailable', 'Storm reports unavailable.', []],
)

const failed = results.filter((result) => !result).length
console.log(`\n${results.length - failed}/${results.length} assertions passed.`)
if (failed) process.exit(1)
