/**
 * Fail-closed inventory gate for Wave 0 provider contract fixtures.
 *
 * This verifies capture provenance and closure coverage. It deliberately does
 * not normalise provider payloads; adapter contracts consume these recorded
 * artifacts through their own focused tests.
 *
 * `[v1.7]` One narrow exception: the IEM `valid=` captures carry contract
 * assertions (see `ASSERTIONS`). Those fixtures exist to pin a *temporal
 * relationship*, which a checksum cannot express — see the note there. The
 * assertions read scan timestamps and nothing else; they do not build the
 * normalised shapes an adapter would.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, dirname, relative, sep } from 'node:path'

// Tests may point this gate at a temporary, byte-for-byte fixture clone to
// prove its semantic assertions reject mutations. Production uses the tracked
// default; no caller can widen the fixture root inside the repository run.
const ROOT = resolve(process.env.SEVERE_DESK_FIXTURE_ROOT ?? 'fixtures/severe-desk')
const MANIFEST = resolve(ROOT, 'manifest.json')
const SOURCES = [
  'nws-alerts',
  'noaa-wwa',
  'noaa-spc',
  'iem-spc',
  'iem-lsr',
  'iem-attributes',
  'rainviewer',
  'noaa-mrms',
]
const CASES = ['nominal', 'empty', 'malformed', 'upstream-failure']
const TARGETED = [
  ['nws-alerts', 'multi-state-area'],
  ['nws-alerts', 'malformed-area-400'],
  ['noaa-wwa', 'geojson'],
  ['noaa-wwa', 'truncated'],
  ['noaa-wwa', 'return-count-only'],
  ['noaa-spc', 'active-probabilistic'],
  ['noaa-spc', 'quiet-day'],
  ['iem-lsr', 'severe-burst'],
  ['iem-lsr', 'calm-day'],
  ['noaa-mrms', 'get-capabilities'],
  ['iem-attributes', 'valid-historical'],
  ['iem-attributes', 'valid-live-edge-one-sided'],
  ['iem-attributes', 'valid-future-empty'],
  ['iem-attributes', 'valid-malformed-422'],
  ['iem-attributes', 'ignored-parameter'],
]

/**
 * Temporal contract assertions for the IEM `valid=` request model (§6.5).
 *
 * This is the one place the script parses a payload, and the exception is
 * deliberate. Everything above pins *bytes*; a SHA-256 cannot express a
 * *relationship*. The §6.5f fail-open has exactly that shape — a silently
 * ignored parameter returns a well-formed FeatureCollection with a perfectly
 * stable checksum that simply describes the wrong instant. No hash, status
 * code, or content type distinguishes it from a correct response. Only the
 * relationship between the requested instant and the returned scan times
 * does, so R-10's regression fixture is worthless unless that relationship is
 * asserted here.
 */
function requestedInstant(request) {
  const match = /[?&](?:valid|valid_time)=([^&]+)/.exec(request)
  const parsed = match ? Date.parse(decodeURIComponent(match[1])) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function scanTimes(text) {
  const payload = JSON.parse(text)
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    throw new Error('not a FeatureCollection')
  }
  const times = payload.features.map((feature) => Date.parse(feature?.properties?.valid))
  if (times.some((time) => !Number.isFinite(time))) throw new Error('a feature lacks a parsable properties.valid')
  return { payload, times: times.sort((left, right) => left - right) }
}

const VALID_PROXIMITY_MS = 20 * 60_000

function isWithinRequestProximity(text, request) {
  const instant = requestedInstant(request)
  const { times } = scanTimes(text)
  if (instant === null || times.length === 0) return false
  return times.every((time) => Math.abs(time - instant) <= VALID_PROXIMITY_MS)
}

const ASSERTIONS = new Map([
  ['iem-attributes:valid-historical', (text, fixture) => {
    const { payload, times } = scanTimes(text)
    if (times.length === 0) return 'historical valid= returned no features'
    if (!isWithinRequestProximity(text, fixture.request)) return 'returned scan times are outside the 20-minute valid= proximity bound'
    const perSite = new Map()
    for (const feature of payload.features) {
      const site = feature?.properties?.nexrad
      if (!perSite.has(site)) perSite.set(site, new Set())
      perSite.get(site).add(feature.properties.valid)
    }
    const duplicated = [...perSite.values()].filter((scans) => scans.size > 1).length
    if (duplicated > 0) return `${duplicated} site(s) returned more than one scan; upstream per-site selection (§6.5b) no longer holds`
    return null
  }],
  ['iem-attributes:valid-future-empty', (text) => {
    const { times } = scanTimes(text)
    return times.length === 0 ? null : `an in-range future valid= returned ${times.length} features; it must be an empty FeatureCollection`
  }],
  ['iem-attributes:valid-malformed-422', (text, fixture) => {
    if (fixture.status !== 422) return `malformed valid= must record HTTP 422, not ${fixture.status}`
    try {
      JSON.parse(text)
    } catch {
      return null
    }
    return 'the 422 body parsed as JSON; §6.5e records a non-JSON Python repr, so the proxy error path is no longer pinned'
  }],
  ['iem-attributes:ignored-parameter', (text, fixture) => {
    const { times } = scanTimes(text)
    if (times.length === 0) return 'ignored-parameter capture returned no features; it cannot demonstrate the fail-open'
    if (isWithinRequestProximity(text, fixture.request)) {
      return 'the unrecognised parameter was honoured; R-10 fail-open no longer reproduces and the adapter proximity assertion is untested'
    }
    return null
  }],
  ['iem-attributes:valid-live-edge-one-sided', (text, fixture) => {
    const { times } = scanTimes(text)
    if (times.length === 0) return 'one-sided live-edge valid= returned no features'
    if (!isWithinRequestProximity(text, fixture.request)) return 'one-sided live-edge scans are outside the 20-minute valid= proximity bound'
    const instant = requestedInstant(fixture.request)
    if (instant === null || !times.every((time) => time < instant)) return 'live-edge fixture must remain one-sided before the requested valid= instant'
    return null
  }],
])

function issue(message) {
  console.error(`MISSING  ${message}`)
  return false
}

let manifest
try {
  manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
} catch (error) {
  console.error(`INVALID  fixtures/severe-desk/manifest.json: ${error.message}`)
  process.exit(1)
}

let valid = true
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.fixtures)) {
  console.error('INVALID  manifest must have schemaVersion 1 and a fixtures array')
  process.exit(1)
}

const entries = new Map()
for (const fixture of manifest.fixtures) {
  const key = `${fixture.sourceId}:${fixture.case}`
  if (!SOURCES.includes(fixture.sourceId) || typeof fixture.case !== 'string') {
    console.error(`INVALID  unknown source or case in ${JSON.stringify(fixture)}`)
    valid = false
    continue
  }
  if (entries.has(key)) {
    console.error(`INVALID  duplicate manifest entry ${key}`)
    valid = false
    continue
  }
  entries.set(key, fixture)

  const required = ['captureKind', 'capturedAtUtc', 'request', 'status', 'contentType', 'artifact', 'sha256', 'proves']
  for (const field of required) {
    if (fixture[field] === undefined || fixture[field] === null || fixture[field] === '') {
      console.error(`INVALID  ${key} lacks ${field}`)
      valid = false
    }
  }
  if (!['live', 'constructed'].includes(fixture.captureKind)) {
    console.error(`INVALID  ${key} captureKind must be live or constructed`)
    valid = false
  }
  if (fixture.captureKind === 'live' && ['malformed', 'upstream-failure'].includes(fixture.case)) {
    console.error(`INVALID  ${key} must be a constructed failure input, not a live capture`)
    valid = false
  }
  if (typeof fixture.artifact === 'string') {
    const artifactPath = resolve(ROOT, fixture.artifact)
    if (relative(ROOT, artifactPath).startsWith(`..${sep}`)) {
      console.error(`INVALID  ${key} artifact escapes fixture root`)
      valid = false
    } else {
      let bytes = null
      try {
        bytes = await readFile(artifactPath)
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        if (sha256 !== fixture.sha256) {
          console.error(`INVALID  ${key} SHA-256 does not match ${fixture.artifact}`)
          valid = false
        }
      } catch (error) {
        console.error(`INVALID  ${key} cannot read ${fixture.artifact}: ${error.message}`)
        valid = false
      }

      const assertion = ASSERTIONS.get(key)
      if (assertion && bytes) {
        let failure
        try {
          failure = assertion(bytes.toString('utf8'), fixture)
        } catch (error) {
          failure = `assertion could not evaluate the artifact: ${error.message}`
        }
        if (failure) {
          console.error(`CONTRACT ${key} ${failure}`)
          valid = false
        }
      }
    }
  }
}

for (const sourceId of SOURCES) {
  for (const fixtureCase of CASES) {
    if (!entries.has(`${sourceId}:${fixtureCase}`)) valid = issue(`${sourceId}:${fixtureCase}`) && valid
  }
}
for (const [sourceId, fixtureCase] of TARGETED) {
  if (!entries.has(`${sourceId}:${fixtureCase}`)) valid = issue(`${sourceId}:${fixtureCase}`) && valid
}

if (!valid) process.exit(1)
console.log(`Provider fixture closure: ${entries.size} verified artifacts.`)
