/**
 * L2 numeric/order proof: a false dry window would be a misleading planning
 * aid, so these independently literal hourly cases localise the longest-run
 * calculation and its missing-data boundary.
 */
import assert from 'node:assert/strict'
import { deriveOutdoorPlan } from '../src/lib/outdoorPlan.js'

const date = '2030-06-11'
const hours = Array.from({ length: 24 }, (_, hour) => ({
  time: `${date}T${String(hour).padStart(2, '0')}:00`,
  isDay: hour >= 6 && hour <= 18,
  precipitation: [6, 7, 11, 16, 17, 18].includes(hour) ? 0.1 : 0,
  precipChance: 0,
}))

const day = {
  date,
  hours,
  gustMax: 28,
  uvIndexMax: 8,
  weatherCode: 95,
}

assert.deepEqual(deriveOutdoorPlan(day), {
  window: { startsAt: `${date}T12:00`, endsAt: `${date}T16:00`, hours: 4 },
  gustMax: 28,
  uvIndexMax: 8,
  thunder: true,
  hail: false,
})

const missingPrecip = structuredClone(day)
missingPrecip.hours[13].precipitation = null
missingPrecip.hours[13].precipChance = null
assert.equal(
  deriveOutdoorPlan(missingPrecip),
  null,
  'an unknown daylight hour must not be treated as a dry planning window',
)

const invalidLocalDate = structuredClone(day)
invalidLocalDate.date = '2030-06-31'
for (const hour of invalidLocalDate.hours) {
  hour.time = hour.time.replace(date, invalidLocalDate.date)
}
assert.equal(
  deriveOutdoorPlan(invalidLocalDate),
  null,
  'an impossible local date must not create a daylight planning window',
)

const allWet = structuredClone(day)
for (const hour of allWet.hours) {
  if (hour.isDay) hour.precipitation = 0.1
}
assert.deepEqual(deriveOutdoorPlan(allWet), {
  window: null,
  gustMax: 28,
  uvIndexMax: 8,
  thunder: true,
  hail: false,
})

console.log('Outdoor-plan numeric integrity: passed')
