/**
 * L2 earned: run-window selection is a numeric/time-boundary algorithm.
 * These independent fixtures catch a product bug where a wet, high-UV, or
 * poor-AQI hour is averaged away or a past/partial window is offered.
 */
import assert from 'node:assert/strict'
import { deriveRunWindows } from '../src/lib/runWindows.js'

const hours = [14, 15, 16, 17, 18].map((hour) => ({
  time: `2026-08-11T${String(hour).padStart(2, '0')}:00`,
  precipitation: hour === 17 ? 0.1 : 0,
  precipChance: 0,
  weatherCode: 0,
  dewPoint: hour === 16 ? 72 : 54,
  uvIndex: hour === 15 ? 6 : 1,
  isDay: hour < 18,
}))
const aqi = new Map(hours.map((hour) => [hour.time, 42]))

const ready = deriveRunWindows({
  hours,
  aqiByTime: aqi,
  currentTime: '2026-08-11T14:30',
  durationMinutes: 45,
  unitId: 'imperial',
})

assert.equal(ready.status, 'ready')
assert.deepEqual(
  ready.windows.map((window) => [window.startsAt, window.tier, window.constraints.map((constraint) => constraint.id)]),
  [
    ['2026-08-11T18:00', 0, ['precipitation', 'thunder', 'dewpoint', 'uv', 'aqi']],
    ['2026-08-11T15:00', 2, ['uv']],
    ['2026-08-11T16:00', 3, ['dewpoint']],
    ['2026-08-11T17:00', 3, ['precipitation']],
  ],
  'only future starts rank, and the worst touched factor remains visible',
)
assert.equal(ready.windows.find((window) => window.startsAt === '2026-08-11T15:00').endsAt, '2026-08-11T15:45')

const tied = deriveRunWindows({
  hours: [{ ...hours[1], dewPoint: 72, uvIndex: 8 }],
  aqiByTime: new Map([[hours[1].time, 42]]),
  currentTime: '2026-08-11T15:00',
  durationMinutes: 30,
  unitId: 'imperial',
})
assert.deepEqual(tied.windows[0].constraints.map((constraint) => constraint.id), ['dewpoint', 'uv'])

const equallySevere = deriveRunWindows({
  hours: [
    { ...hours[0], time: '2026-08-11T15:00', dewPoint: 72, uvIndex: 6 },
    { ...hours[0], time: '2026-08-11T16:00', dewPoint: 72, uvIndex: 1 },
  ],
  aqiByTime: new Map([
    ['2026-08-11T15:00', 42],
    ['2026-08-11T16:00', 42],
  ]),
  currentTime: '2026-08-11T14:30',
  durationMinutes: 30,
  unitId: 'imperial',
})
assert.deepEqual(
  equallySevere.windows.map((window) => window.startsAt),
  ['2026-08-11T16:00', '2026-08-11T15:00'],
  'the lower second-worst tier wins before earlier-start tiebreaking',
)

const partial = deriveRunWindows({
  hours: [hours[1]],
  aqiByTime: new Map(),
  currentTime: '2026-08-11T15:00',
  durationMinutes: 30,
  unitId: 'imperial',
})
assert.equal(partial.status, 'partial')
assert.equal(partial.windows.length, 0)

console.log('Run-window ranking integrity: passed')
