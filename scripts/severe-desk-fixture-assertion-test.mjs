/**
 * Mutation proof for the v1.7 IEM attributes fixture assertions.
 *
 * A fixture gate that only succeeds can silently lose the temporal properties
 * it exists to protect. This test copies the recorded corpus, applies one
 * semantic mutation at a time, repairs the changed checksum, and requires the
 * production checker to reject each resulting lie for its own reason.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const source = new URL('../fixtures/severe-desk/', import.meta.url)
const checker = new URL('./severe-desk-fixture-check.mjs', import.meta.url)
const temporaryRoot = await mkdtemp(join(tmpdir(), 'stormlogic-fixture-assertions-'))
const root = join(temporaryRoot, 'severe-desk')

function digest(text) {
  return createHash('sha256').update(text).digest('hex')
}

async function loadJson(path) {
  return JSON.parse(await readFile(join(root, path), 'utf8'))
}

async function saveJson(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`
  await writeFile(join(root, path), text)
  return text
}

async function repairHash(manifest, fixtureCase, text) {
  const fixture = manifest.fixtures.find((entry) => entry.sourceId === 'iem-attributes' && entry.case === fixtureCase)
  fixture.sha256 = digest(text)
  await saveJson('manifest.json', manifest)
}

async function reset() {
  await rm(root, { recursive: true, force: true })
  await cp(source, root, { recursive: true })
}

async function mutate(name, expected, apply) {
  await reset()
  await apply()
  const result = spawnSync(process.execPath, [checker.pathname], {
    cwd: process.cwd(),
    env: { ...process.env, SEVERE_DESK_FIXTURE_ROOT: root },
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0, `${name}: control mutation unexpectedly passed`)
  assert.match(`${result.stdout}\n${result.stderr}`, expected, `${name}: checker rejected the fixture for the wrong reason`)
  console.log(`PASS  ${name}`)
}

try {
  // Control: the untouched copy must pass before mutations mean anything.
  await reset()
  const control = spawnSync(process.execPath, [checker.pathname], {
    cwd: process.cwd(), env: { ...process.env, SEVERE_DESK_FIXTURE_ROOT: root }, encoding: 'utf8',
  })
  assert.equal(control.status, 0, control.stderr || control.stdout)
  console.log('PASS  untouched v1.7 fixture corpus')

  await mutate('moved requested instant exceeds the proximity bound', /outside the 20-minute valid= proximity bound/, async () => {
    const manifest = await loadJson('manifest.json')
    const fixture = manifest.fixtures.find((entry) => entry.sourceId === 'iem-attributes' && entry.case === 'valid-historical')
    fixture.request = fixture.request.replace('2026-08-11T13:40:00Z', '2026-08-11T10:40:00Z')
    await saveJson('manifest.json', manifest)
  })

  await mutate('duplicate site scan violates upstream selection', /site\(s\) returned more than one scan/, async () => {
    const manifest = await loadJson('manifest.json')
    const path = 'iem-attributes/valid-historical.json'
    const payload = await loadJson(path)
    const duplicate = structuredClone(payload.features[0])
    duplicate.properties.valid = '2026-08-11T13:41:00Z'
    payload.features.push(duplicate)
    const text = await saveJson(path, payload)
    await repairHash(manifest, 'valid-historical', text)
  })

  await mutate('future empty response cannot grow features', /in-range future valid= returned/, async () => {
    const manifest = await loadJson('manifest.json')
    const historical = await loadJson('iem-attributes/valid-historical.json')
    const path = 'iem-attributes/valid-future-empty.json'
    const payload = await loadJson(path)
    payload.features = [historical.features[0]]
    const text = await saveJson(path, payload)
    await repairHash(manifest, 'valid-future-empty', text)
  })

  await mutate('malformed 422 must remain non-JSON', /422 body parsed as JSON/, async () => {
    const manifest = await loadJson('manifest.json')
    const path = 'iem-attributes/valid-malformed-422.txt'
    const text = `${JSON.stringify({ detail: 'made JSON by mutation' })}\n`
    await writeFile(join(root, path), text)
    await repairHash(manifest, 'valid-malformed-422', text)
  })

  await mutate('ignored parameter must remain a visible fail-open', /unrecognised parameter was honoured/, async () => {
    const manifest = await loadJson('manifest.json')
    const fixture = manifest.fixtures.find((entry) => entry.sourceId === 'iem-attributes' && entry.case === 'ignored-parameter')
    const payload = await loadJson('iem-attributes/ignored-parameter.json')
    const scan = payload.features[0].properties.valid
    fixture.request = fixture.request.replace('2026-08-11T13:40:00Z', scan)
    await saveJson('manifest.json', manifest)
  })

  await mutate('one-sided live-edge scans must remain inside the accepted proximity', /one-sided live-edge scans are outside the 20-minute/, async () => {
    const manifest = await loadJson('manifest.json')
    const fixture = manifest.fixtures.find((entry) => entry.sourceId === 'iem-attributes' && entry.case === 'valid-live-edge-one-sided')
    fixture.request = fixture.request.replace('2026-08-11T19:00:00Z', '2026-08-11T19:21:00Z')
    await saveJson('manifest.json', manifest)
  })
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

console.log('IEM v1.7 fixture assertion mutations: passed')
