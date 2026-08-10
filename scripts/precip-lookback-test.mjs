/**
 * Rolling last-24h precipitation total — integrity closeout.
 *
 * Open-Meteo hourly precipitation is a preceding-hour sum. With past_days on
 * the request we have enough history to sum the 24 steps ending at "now".
 * Incomplete lookback or any non-finite slot → null (never a partial sum).
 * A complete window of zeros is dry weather and returns 0.
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

/** Build PAST day + START day like the live past_days=1 series (48 hours). */
function twoDaySeries(valueAt) {
  const times = []
  const values = []
  for (const date of ['2026-08-08', '2026-08-09']) {
    for (let h = 0; h < 24; h += 1) {
      times.push(`${date}T${String(h).padStart(2, '0')}:00`)
      values.push(valueAt(date, h))
    }
  }
  return { times, values }
}

// ── Full 24h sum ────────────────────────────────────────────────────────────
{
  const { times, values } = twoDaySeries((date, h) => {
    const inLookback =
      (date === '2026-08-08' && h >= 15) || (date === '2026-08-09' && h <= 14)
    return inLookback ? 0.01 : 0
  })
  assertEqual(
    'full 24h sum ending at current hour',
    sumPrecipLast24h(payload({ now: '2026-08-09T14:30', times, values })),
    0.24,
  )
}

// ── Incomplete history (only 20 hours before now) → null ────────────────────
{
  const times = []
  const values = []
  // START day only, hours 00–19 → at 19:00 only 20 slots exist.
  for (let h = 0; h < 20; h += 1) {
    times.push(`2026-08-09T${String(h).padStart(2, '0')}:00`)
    values.push(0.01)
  }
  assertEqual(
    'incomplete history (only 20 hours) → null',
    sumPrecipLast24h(payload({ now: '2026-08-09T19:00', times, values })),
    null,
  )
}

// ── Gap / null in middle of window → null ───────────────────────────────────
{
  const { times, values } = twoDaySeries(() => 0.01)
  // Null out one hour inside the lookback ending at 14:00 (PAST 15 … START 14).
  const gapIdx = times.indexOf('2026-08-09T06:00')
  values[gapIdx] = null
  assertEqual(
    'gap/null in middle of window → null',
    sumPrecipLast24h(payload({ now: '2026-08-09T14:00', times, values })),
    null,
  )
}

// ── Missing timestamp in middle of window → null ─────────────────────────────
{
  const { times, values } = twoDaySeries(() => 0.01)
  const missingIndex = times.indexOf('2026-08-09T06:00')
  times.splice(missingIndex, 1)
  values.splice(missingIndex, 1)
  assertEqual(
    'missing hourly timestamp in window → null',
    sumPrecipLast24h(payload({ now: '2026-08-09T14:00', times, values })),
    null,
  )
}

// ── Non-finite (NaN) in window → null ───────────────────────────────────────
{
  const { times, values } = twoDaySeries(() => 0.01)
  values[times.indexOf('2026-08-09T03:00')] = Number.NaN
  assertEqual(
    'non-finite value in window → null',
    sumPrecipLast24h(payload({ now: '2026-08-09T14:00', times, values })),
    null,
  )
}

// ── All zeros → 0 (dry is real data) ────────────────────────────────────────
{
  const { times, values } = twoDaySeries(() => 0)
  assertEqual(
    'all zeros → 0',
    sumPrecipLast24h(payload({ now: '2026-08-09T14:00', times, values })),
    0,
  )
}

// ── Ignores future hours ────────────────────────────────────────────────────
{
  const { times, values: base } = twoDaySeries((date, h) => {
    const inLookback =
      (date === '2026-08-08' && h >= 15) || (date === '2026-08-09' && h <= 14)
    return inLookback ? 0.01 : 0
  })
  // Force future hours (11–14 on START) to huge values — must not count.
  // now = 10:00 → window PAST 11..23 + START 00..10 = 24 finite slots.
  // Sum of 0.01 slots in that window: PAST 15–23 (9) + START 00–10 (11) = 0.2
  const values = base.map((v, i) => (times[i] >= '2026-08-09T11:00' ? 9 : v))
  assertEqual(
    'ignores future hours',
    sumPrecipLast24h(payload({ now: '2026-08-09T10:00', times, values })),
    0.2,
  )
}

// ── Missing series / empty payload → null ───────────────────────────────────
{
  const { times } = twoDaySeries(() => 0)
  assertEqual(
    'missing precip series → null',
    sumPrecipLast24h({ current: { time: '2026-08-09T14:30' }, hourly: { time: times } }),
    null,
  )
  assertEqual('empty payload → null', sumPrecipLast24h({}), null)
}

// ── Floating-point path: non-terminating tenths still sum cleanly ────────────
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
