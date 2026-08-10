/**
 * Rolling last-24h precipitation total.
 *
 * Open-Meteo hourly precipitation is a preceding-hour sum. With past_days on
 * the request we have enough history to sum the 24 steps ending at "now".
 *
 * Run: node scripts/precip-lookback-test.mjs
 */

import { sumPrecipLast24h } from '../src/lib/api.js'

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
  const close =
    typeof got === 'number' && typeof want === 'number'
      ? Math.abs(got - want) < 1e-9
      : Object.is(got, want) || got === want
  if (close) pass(name)
  else fail(name, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}

function payload({ now, times, values }) {
  return {
    current: { time: now },
    hourly: { time: times, precipitation: values },
  }
}

const times = []
const values = []
// Build PAST day + START day like the live past_days=1 series.
for (const date of ['2026-08-08', '2026-08-09']) {
  for (let h = 0; h < 24; h += 1) {
    times.push(`${date}T${String(h).padStart(2, '0')}:00`)
    const inLookback =
      (date === '2026-08-08' && h >= 15) || (date === '2026-08-09' && h <= 14)
    values.push(inLookback ? 0.01 : 0)
  }
}

assertEqual(
  'sums the 24 hours ending at the current hour',
  sumPrecipLast24h(payload({ now: '2026-08-09T14:30', times, values })),
  0.24,
)

assertEqual(
  'ignores hours after now',
  sumPrecipLast24h(
    payload({
      now: '2026-08-09T10:00',
      times,
      // Force future hours (11–14 on START) to huge values — must not count.
      values: values.map((v, i) => (times[i] >= '2026-08-09T11:00' ? 9 : v)),
    }),
  ),
  // PAST 15–23 (9h) + START 00–10 (11h) = 20 × 0.01; hours 11–14 overridden but after end.
  // end is 10:00 → PAST 15..23 (9) + START 00..10 (11) = 20
  0.2,
)

assertEqual(
  'missing precip series returns null',
  sumPrecipLast24h({ current: { time: '2026-08-09T14:30' }, hourly: { time: times } }),
  null,
)

assertEqual(
  'empty payload returns null',
  sumPrecipLast24h({}),
  null,
)

// Floating-point path: non-terminating tenths still sum cleanly for display rounding.
{
  const t = []
  const v = []
  for (let i = 0; i < 24; i += 1) {
    t.push(`2026-08-09T${String(i).padStart(2, '0')}:00`)
    v.push(0.1)
  }
  const sum = sumPrecipLast24h(payload({ now: '2026-08-09T23:00', times: t, values: v }))
  assertEqual('24 × 0.1 ≈ 2.4', Number(sum.toFixed(2)), 2.4)
}

console.log(`\n${failed === 0 ? 'All passed.' : `${failed} failed.`}`)
if (failed) process.exit(1)
