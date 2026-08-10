/**
 * L2 rule-selection proof for selected-day explanations. The rendered browser
 * seam lives in smoke-test.mjs; these independent literals localise the
 * numeric/data-precedence rules (clear, precip, wind, and missing data).
 *
 * Run: node scripts/day-explanation-test.mjs
 */
import { explainDay } from '../src/lib/dayExplanation.js'

let failed = 0

function assertEqual(name, got, want) {
  if (got === want) {
    console.log(`PASS  ${name}`)
    return
  }
  failed += 1
  console.log(`FAIL  ${name}`)
  console.log(`      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}

function day(overrides = {}) {
  return {
    weatherCode: 0,
    tempMax: 72,
    cloudCoverDay: 8,
    precipChance: 0,
    precipHours: 0,
    precipSum: 0,
    snowSum: 0,
    windMax: 8,
    windDirection: 180,
    hours: [
      { time: '2026-08-10T12:00', precipitation: 0, precipChance: 0 },
      { time: '2026-08-10T13:00', precipitation: 0, precipChance: 0 },
    ],
    ...overrides,
  }
}

assertEqual(
  'clear day keeps the sentence to sky and high',
  explainDay(day({ tempMax: 72 })),
  'Clear, high near 72°.',
)

assertEqual(
  'credible rain names its first wet hour from the selected-day series',
  explainDay(
    day({
      weatherCode: 63,
      tempMax: 58,
      precipChance: 80,
      precipHours: 3,
      precipSum: 0.25,
      hours: [
        { time: '2026-08-10T13:00', precipitation: 0, precipChance: 0 },
        { time: '2026-08-10T14:00', precipitation: 0.1, precipChance: 80 },
      ],
    }),
  ),
  'Rain likely around 2pm, high near 58°.',
)

assertEqual(
  'breezy day includes dominant wind direction without adding a second data source',
  explainDay(day({ tempMax: 58, windMax: 23, windDirection: 315 })),
  'Clear, breezy NW winds, high near 58°.',
)

assertEqual(
  'metric wind threshold preserves the same breezy reading after a unit switch',
  explainDay(day({ tempMax: 14, windMax: 25, windDirection: 315 }), { windSuffix: 'km/h' }),
  'Clear, breezy NW winds, high near 14°.',
)

assertEqual('missing selected-day data renders no prose', explainDay(null), null)
assertEqual('missing hourly context renders no prose', explainDay({ tempMax: 72 }), null)

if (failed) process.exit(1)
