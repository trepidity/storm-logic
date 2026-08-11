/**
 * Pure unit tests for US AQI category bands and payload normalisation.
 *
 * Run: node scripts/us-aqi-test.mjs
 */
import assert from 'node:assert/strict'
import {
  isUsAqiCoverage,
  normaliseCurrentAirQuality,
  normaliseHourlyAirQuality,
  usAqiCategory,
  US_AQI_LABEL,
} from '../src/lib/usAqi.js'
import { fetchAirQuality, fetchHourlyAirQuality } from '../src/lib/api.js'

assert.equal(US_AQI_LABEL, 'US AQI', 'primary UI label must be exactly "US AQI"')

// Product gate: U.S. only (Open-Meteo would answer elsewhere).
assert.equal(isUsAqiCoverage(41.8781, -87.6298), true, 'Chicago is in coverage')
assert.equal(isUsAqiCoverage(61.2181, -149.9003), true, 'Anchorage is in coverage')
assert.equal(isUsAqiCoverage(21.3069, -157.8583), true, 'Honolulu is in coverage')
assert.equal(isUsAqiCoverage(18.4655, -66.1057), true, 'San Juan is in coverage')
assert.equal(isUsAqiCoverage(51.5074, -0.1278), false, 'London is out of coverage')
assert.equal(isUsAqiCoverage(-33.8688, 151.2093), false, 'Sydney is out of coverage')
assert.equal(isUsAqiCoverage(NaN, -87.6), false)

{
  let threw = null
  try {
    await fetchAirQuality({ latitude: 51.5, longitude: -0.12 })
  } catch (err) {
    threw = err
  }
  assert.ok(threw, 'fetchAirQuality must reject outside U.S. coverage')
  assert.equal(threw.code, 'coverage')
}

{
  let threw = null
  try {
    await fetchHourlyAirQuality({ latitude: 51.5, longitude: -0.12 })
  } catch (err) {
    threw = err
  }
  assert.ok(threw, 'fetchHourlyAirQuality must reject outside U.S. coverage')
  assert.equal(threw.code, 'coverage')
}

const bands = [
  [0, 'good', 'Good'],
  [50, 'good', 'Good'],
  [51, 'moderate', 'Moderate'],
  [100, 'moderate', 'Moderate'],
  [101, 'usg', 'Unhealthy for Sensitive Groups'],
  [150, 'usg', 'Unhealthy for Sensitive Groups'],
  [151, 'unhealthy', 'Unhealthy'],
  [200, 'unhealthy', 'Unhealthy'],
  [201, 'very-unhealthy', 'Very Unhealthy'],
  [300, 'very-unhealthy', 'Very Unhealthy'],
  [301, 'hazardous', 'Hazardous'],
  [500, 'hazardous', 'Hazardous'],
]

for (const [value, key, label] of bands) {
  const cat = usAqiCategory(value)
  assert.deepEqual(cat, { key, label }, `usAqiCategory(${value})`)
}

assert.equal(usAqiCategory(-1), null)
assert.equal(usAqiCategory(NaN), null)
assert.equal(usAqiCategory(null), null)
assert.equal(usAqiCategory(undefined), null)
assert.equal(usAqiCategory('42'), null, 'string values are not accepted by category helper')

// Ready reading
const ready = normaliseCurrentAirQuality({
  current: { time: '2026-08-10T12:00', interval: 3600, us_aqi: 53 },
})
assert.deepEqual(ready, {
  usAqi: 53,
  time: '2026-08-10T12:00',
  category: { key: 'moderate', label: 'Moderate' },
})

// Numeric string from a sloppy fixture still works via Number()
const stringVal = normaliseCurrentAirQuality({ current: { us_aqi: '12', time: '2026-01-01T00:00' } })
assert.equal(stringVal.usAqi, 12)
assert.equal(stringVal.category.key, 'good')

// No-data cases
assert.equal(normaliseCurrentAirQuality(null), null)
assert.equal(normaliseCurrentAirQuality({}), null)
assert.equal(normaliseCurrentAirQuality({ current: {} }), null)
assert.equal(normaliseCurrentAirQuality({ current: { us_aqi: null } }), null)
assert.equal(normaliseCurrentAirQuality({ current: { us_aqi: '' } }), null)
assert.equal(normaliseCurrentAirQuality({ current: { us_aqi: 'not-a-number' } }), null)
assert.equal(normaliseCurrentAirQuality({ current: { us_aqi: -5 } }), null)

// Missing time is allowed; category still required
const noTime = normaliseCurrentAirQuality({ current: { us_aqi: 0 } })
assert.deepEqual(noTime, {
  usAqi: 0,
  time: null,
  category: { key: 'good', label: 'Good' },
})

const hourly = normaliseHourlyAirQuality({
  hourly: {
    time: ['2026-08-10T12:00', '2026-08-10T13:00'],
    us_aqi: [42, '53'],
  },
})
assert.deepEqual([...hourly.entries()], [
  ['2026-08-10T12:00', 42],
  ['2026-08-10T13:00', 53],
])
assert.equal(normaliseHourlyAirQuality({ hourly: { time: ['2026-08-10T12:00'], us_aqi: [] } }), null)
assert.equal(normaliseHourlyAirQuality({ hourly: { time: ['2026-08-10T12:00'], us_aqi: [-1] } }), null)

console.log('US AQI category + normalise: passed')
