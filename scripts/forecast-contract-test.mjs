/**
 * Open-Meteo forecast request contract — consumer behaviour.
 *
 * Proves that the URLs actually issued by each path (browser direct / Netlify
 * proxy upstream) carry the golden field lists, unit maps, and forecast_days.
 * Coordinate precision may differ on purpose (4 dp dev, 2 dp CDN cache key);
 * every other param must match the golden wire contract.
 *
 * Run: node scripts/forecast-contract-test.mjs
 */

import { buildForecastUrl } from '../src/lib/api.js'
import handler from '../netlify/functions/forecast.mjs'

// Independent golden: what the product must request from Open-Meteo.
// Edit deliberately when adding/removing forecast fields — do not re-derive
// from the module under test.
const GOLDEN_CURRENT = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
].join(',')

const GOLDEN_DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'sunrise',
  'sunset',
  'daylight_duration',
  'sunshine_duration',
  'uv_index_max',
  'precipitation_sum',
  'rain_sum',
  'showers_sum',
  'snowfall_sum',
  'precipitation_hours',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'wind_direction_10m_dominant',
].join(',')

const GOLDEN_HOURLY = [
  'cloud_cover',
  'temperature_2m',
  'precipitation_probability',
  'precipitation',
  'weather_code',
].join(',')

const GOLDEN_DAYS = '11'
const GOLDEN_PAST_DAYS = '1'

const GOLDEN_UNITS = {
  imperial: {
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
  },
  metric: {
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  },
}

const FIELD_KEYS = [
  'current',
  'daily',
  'hourly',
  'timezone',
  'forecast_days',
  'past_days',
  'temperature_unit',
  'wind_speed_unit',
  'precipitation_unit',
]

const SAMPLE = { latitude: 41.8781, longitude: -87.6298 }

let failed = 0

function pass(name) {
  console.log(`PASS  ${name}`)
}

function fail(name, detail) {
  failed += 1
  console.log(`FAIL  ${name}`)
  if (detail) console.log(`        ${detail}`)
}

function assertEqual(name, got, want) {
  const g = typeof got === 'string' || got == null ? String(got) : JSON.stringify(got)
  const w = typeof want === 'string' || want == null ? String(want) : JSON.stringify(want)
  if (g === w) pass(name)
  else fail(name, `got ${g} want ${w}`)
}

function paramsFromUrl(url) {
  return new URL(url, 'http://local.invalid').searchParams
}

/** Assert non-coordinate upstream params match the golden wire contract. */
function assertGoldenFields(label, params, unitId) {
  const units = GOLDEN_UNITS[unitId]
  assertEqual(`${label} current`, params.get('current'), GOLDEN_CURRENT)
  assertEqual(`${label} daily`, params.get('daily'), GOLDEN_DAILY)
  assertEqual(`${label} hourly`, params.get('hourly'), GOLDEN_HOURLY)
  assertEqual(`${label} forecast_days`, params.get('forecast_days'), GOLDEN_DAYS)
  assertEqual(`${label} past_days`, params.get('past_days'), GOLDEN_PAST_DAYS)
  assertEqual(`${label} timezone`, params.get('timezone'), 'auto')
  assertEqual(`${label} temperature_unit`, params.get('temperature_unit'), units.temperature_unit)
  assertEqual(`${label} wind_speed_unit`, params.get('wind_speed_unit'), units.wind_speed_unit)
  assertEqual(
    `${label} precipitation_unit`,
    params.get('precipitation_unit'),
    units.precipitation_unit,
  )
}

/**
 * Capture the upstream URL the Netlify handler actually fetches.
 * Mocks global fetch; restores it afterwards.
 */
async function captureProxyUpstreamUrl({ latitude, longitude, unitId }) {
  const previous = globalThis.fetch
  let captured = null

  globalThis.fetch = async (input) => {
    captured = typeof input === 'string' ? input : input.url
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const qs = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      units: unitId,
    })
    const res = await handler(
      new Request(`https://example.com/api/forecast?${qs}`),
    )
    if (!res.ok) {
      fail(`proxy handler status (${unitId})`, `got ${res.status}`)
    }
    if (!captured) {
      fail(`proxy issued an upstream fetch (${unitId})`, 'fetch was not called')
    }
    return captured
  } finally {
    globalThis.fetch = previous
  }
}

// --- browser direct path (dev) ---------------------------------------------

for (const unitId of Object.keys(GOLDEN_UNITS)) {
  const url = buildForecastUrl({ ...SAMPLE, unitId }, { mode: 'direct' })
  const params = paramsFromUrl(url)

  if (!url.startsWith('https://api.open-meteo.com/v1/forecast?')) {
    fail(`dev URL host (${unitId})`, url)
  } else {
    pass(`dev URL targets Open-Meteo (${unitId})`)
  }

  assertGoldenFields(`dev ${unitId}`, params, unitId)
  assertEqual(`dev ${unitId} latitude 4dp`, params.get('latitude'), '41.8781')
  assertEqual(`dev ${unitId} longitude 4dp`, params.get('longitude'), '-87.6298')
}

// --- Netlify proxy path (prod upstream) ------------------------------------

for (const unitId of Object.keys(GOLDEN_UNITS)) {
  const url = await captureProxyUpstreamUrl({ ...SAMPLE, unitId })
  if (!url) continue

  const params = paramsFromUrl(url)

  if (!url.startsWith('https://api.open-meteo.com/v1/forecast?')) {
    fail(`proxy upstream host (${unitId})`, url)
  } else {
    pass(`proxy upstream targets Open-Meteo (${unitId})`)
  }

  assertGoldenFields(`proxy ${unitId}`, params, unitId)
  assertEqual(`proxy ${unitId} latitude 2dp`, params.get('latitude'), '41.88')
  assertEqual(`proxy ${unitId} longitude 2dp`, params.get('longitude'), '-87.63')
}

// --- parity: non-coordinate fields identical across consumers --------------

{
  const dev = paramsFromUrl(buildForecastUrl({ ...SAMPLE, unitId: 'imperial' }, { mode: 'direct' }))
  const proxyUrl = await captureProxyUpstreamUrl({ ...SAMPLE, unitId: 'imperial' })
  const proxy = proxyUrl ? paramsFromUrl(proxyUrl) : null

  if (proxy) {
    let match = true
    for (const key of FIELD_KEYS) {
      if (dev.get(key) !== proxy.get(key)) {
        match = false
        fail(`dev/proxy field parity: ${key}`, `dev=${dev.get(key)} proxy=${proxy.get(key)}`)
      }
    }
    if (match) pass('dev and proxy agree on all non-coordinate fields')
  }
}

// --- proxy client URL stays a thin lat/lon/units handoff -------------------

{
  const client = buildForecastUrl({ ...SAMPLE, unitId: 'metric' }, { mode: 'proxy' })
  const params = paramsFromUrl(client)
  assertEqual('prod client path', client.split('?')[0], '/api/forecast')
  assertEqual('prod client lat', params.get('lat'), '41.8781')
  assertEqual('prod client lon', params.get('lon'), '-87.6298')
  assertEqual('prod client units', params.get('units'), 'metric')
  // Must not embed the Open-Meteo field lists on the browser→function hop.
  if (params.has('current') || params.has('daily') || params.has('hourly')) {
    fail('prod client must not carry upstream field lists')
  } else {
    pass('prod client carries only lat/lon/units')
  }
}

console.log(`\n${failed === 0 ? 'All passed.' : `${failed} failed.`}`)
if (failed) process.exit(1)
