/**
 * Pure unit tests for US AQI category bands and payload normalisation.
 *
 * Run: node scripts/us-aqi-test.mjs
 */
import assert from 'node:assert/strict'
import { normaliseCurrentAirQuality, usAqiCategory, US_AQI_LABEL } from '../src/lib/usAqi.js'

assert.equal(US_AQI_LABEL, 'US AQI', 'primary UI label must be exactly "US AQI"')

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

console.log('US AQI category + normalise: passed')
