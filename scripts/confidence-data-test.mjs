/**
 * L2 numeric/boundary proof. A wrong percentile rank, accidental use of the
 * provider mean, or acceptance of incomplete member data would ship a false
 * confidence range, so these direct cases localise that hard logic.
 */
import assert from 'node:assert/strict'
import { deriveTomorrowConfidence } from '../src/lib/forecastConfidence.js'

const date = '2030-06-11'
const times = Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, '0')}:00`)
const members = Object.fromEntries(
  Array.from({ length: 30 }, (_, index) => {
    const member = String(index + 1).padStart(2, '0')
    return [
      [`temperature_2m_member${member}`, times.map(() => 70 + (index + 1) * 0.2)],
      [`precipitation_member${member}`, times.map(() => (index < 14 ? 0 : 0.01))],
    ]
  }).flat(),
)

const completePayload = {
  hourly: {
    time: times,
    temperature_2m: times.map(() => 72),
    precipitation: times.map(() => 0.01),
    ...members,
  },
}

assert.deepEqual(deriveTomorrowConfidence(completePayload, date), {
  date,
  memberCount: 30,
  temperature: { low: 71, high: 75 },
  precipitation: { low: 0, high: 0.24 },
})

const missingMember = structuredClone(completePayload)
delete missingMember.hourly.precipitation_member30
assert.equal(
  deriveTomorrowConfidence(missingMember, date),
  null,
  'a missing ensemble member must never produce a partial spread',
)

const gappedTomorrow = structuredClone(completePayload)
gappedTomorrow.hourly.time.splice(8, 1)
for (const values of Object.values(gappedTomorrow.hourly)) {
  if (Array.isArray(values)) values.splice(8, 1)
}
assert.equal(
  deriveTomorrowConfidence(gappedTomorrow, date),
  null,
  'a missing hourly slot must remain unavailable instead of narrowing the range',
)

console.log('Ensemble confidence numeric integrity: passed')
