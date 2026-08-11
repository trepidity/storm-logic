/**
 * Fail-closed inventory gate for Wave 0 provider contract fixtures.
 *
 * This verifies capture provenance and closure coverage only. It deliberately
 * does not parse or normalise provider payloads; those adapters do not exist
 * until the recorded artifacts have closed this gate.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, dirname, relative, sep } from 'node:path'

const ROOT = resolve('fixtures/severe-desk')
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
]

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
      try {
        const bytes = await readFile(artifactPath)
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        if (sha256 !== fixture.sha256) {
          console.error(`INVALID  ${key} SHA-256 does not match ${fixture.artifact}`)
          valid = false
        }
      } catch (error) {
        console.error(`INVALID  ${key} cannot read ${fixture.artifact}: ${error.message}`)
        valid = false
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
