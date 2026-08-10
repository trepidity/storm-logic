/**
 * Unit tests for precipTiming — pure next-24h start/end derivation.
 *
 * Run: node scripts/precip-timing-test.mjs
 */
import {
  precipTiming,
  isPrecipitatingHour,
  formatApproxHour,
  PRECIP_LIKELY,
} from '../src/lib/precipTiming.js'

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
  if (Object.is(got, want) || got === want) pass(name)
  else fail(name, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}

function assertMatch(name, got, partial) {
  for (const [k, v] of Object.entries(partial)) {
    if (!Object.is(got?.[k], v) && got?.[k] !== v) {
      fail(name, `key ${k}: got ${JSON.stringify(got?.[k])} want ${JSON.stringify(v)} (full ${JSON.stringify(got)})`)
      return
    }
  }
  pass(name)
}

function hour(time, over = {}) {
  return {
    time,
    hour: Number(String(time).slice(11, 13)),
    isNow: false,
    precipChance: 0,
    precipitation: 0,
    ...over,
  }
}

/** Build a dry 24h window starting at `startHour` on 2026-08-09. */
function windowFrom(startHour, length = 24) {
  const out = []
  for (let i = 0; i < length; i += 1) {
    const h = startHour + i
    const day = h < 24 ? '2026-08-09' : '2026-08-10'
    const hourOfDay = h % 24
    const time = `${day}T${String(hourOfDay).padStart(2, '0')}:00`
    out.push(hour(time, { isNow: i === 0 }))
  }
  return out
}

// --- isPrecipitatingHour -------------------------------------------------

assertEqual(
  'amount > 0 is wet even at low chance',
  isPrecipitatingHour({ precipitation: 0.02, precipChance: 5 }),
  true,
)

assertEqual(
  'amount 0 with high chance is still dry when amount is present',
  isPrecipitatingHour({ precipitation: 0, precipChance: 90 }),
  false,
)

assertEqual(
  'missing amount falls back to chance >= LIKELY',
  isPrecipitatingHour({ precipChance: PRECIP_LIKELY }),
  true,
)

assertEqual(
  'missing amount below LIKELY is dry',
  isPrecipitatingHour({ precipChance: PRECIP_LIKELY - 1 }),
  false,
)

assertEqual(
  'null precipitation falls back to chance',
  isPrecipitatingHour({ precipitation: null, precipChance: 55 }),
  true,
)

// --- none ----------------------------------------------------------------

{
  const hours = windowFrom(8)
  const t = precipTiming(hours)
  assertMatch('all dry → none', t, {
    kind: 'none',
    startsAt: null,
    endsAt: null,
  })
  assertEqual('none label', t.label, 'No precip expected next 24h')
}

assertMatch('empty hours → none', precipTiming([]), {
  kind: 'none',
  startsAt: null,
  endsAt: null,
  label: 'No precip expected next 24h',
})

assertMatch('null hours → none', precipTiming(null), {
  kind: 'none',
  label: 'No precip expected next 24h',
})

// --- starts mid-window (amount) ------------------------------------------

{
  const hours = windowFrom(10)
  // Wet 14:00–16:00 (indices 4–6), dry after
  hours[4] = hour(hours[4].time, { precipitation: 0.1, precipChance: 80 })
  hours[5] = hour(hours[5].time, { precipitation: 0.2, precipChance: 90 })
  hours[6] = hour(hours[6].time, { precipitation: 0.05, precipChance: 70 })
  const t = precipTiming(hours)
  assertMatch('starts mid-window', t, {
    kind: 'starts',
    startsAt: '2026-08-09T14:00',
    endsAt: '2026-08-09T17:00',
  })
  assertEqual(
    'starts label uses approx hour',
    t.label,
    `Rain starting ~${formatApproxHour('2026-08-09T14:00')}`,
  )
}

// --- ongoing then ends ---------------------------------------------------

{
  const hours = windowFrom(12)
  hours[0] = hour(hours[0].time, { isNow: true, precipitation: 0.15, precipChance: 100 })
  hours[1] = hour(hours[1].time, { precipitation: 0.1, precipChance: 90 })
  hours[2] = hour(hours[2].time, { precipitation: 0.05, precipChance: 80 })
  // 15:00 dry → endsAt
  const t = precipTiming(hours)
  assertMatch('ongoing then ends', t, {
    kind: 'ongoing',
    startsAt: null,
    endsAt: '2026-08-09T15:00',
  })
  assertEqual(
    'ongoing label',
    t.label,
    `Rain ending ~${formatApproxHour('2026-08-09T15:00')}`,
  )
}

// --- ongoing through whole window ----------------------------------------

{
  const hours = windowFrom(9).map((h, i) =>
    hour(h.time, { isNow: i === 0, precipitation: 0.1, precipChance: 80 }),
  )
  const t = precipTiming(hours)
  assertMatch('ongoing no dry hour', t, {
    kind: 'ongoing',
    startsAt: null,
    endsAt: null,
    label: 'Rain continuing next 24h',
  })
}

// --- chance-only fallback (no precipitation field) -----------------------

{
  const hours = windowFrom(6).map((h, i) => {
    const base = { time: h.time, hour: h.hour, isNow: i === 0, precipChance: 10 }
    // No precipitation key — chance-only path
    if (i >= 3 && i <= 5) return { ...base, precipChance: 55 }
    return base
  })
  const t = precipTiming(hours)
  assertMatch('chance-only starts mid-window', t, {
    kind: 'starts',
    startsAt: '2026-08-09T09:00',
    endsAt: '2026-08-09T12:00',
  })
  assertEqual(
    'chance-only label',
    t.label.startsWith('Rain starting ~'),
    true,
  )
}

{
  // Chance present but below threshold → none
  const hours = windowFrom(8).map((h, i) => ({
    time: h.time,
    hour: h.hour,
    isNow: i === 0,
    precipChance: 30,
  }))
  assertMatch('chance 30 without amount → none', precipTiming(hours), {
    kind: 'none',
  })
}

// --- amount present zeros out high chance --------------------------------

{
  const hours = windowFrom(8)
  hours[2] = hour(hours[2].time, { precipitation: 0, precipChance: 95 })
  assertMatch(
    'finite zero amount ignores high chance for timing',
    precipTiming(hours),
    { kind: 'none' },
  )
}

// --- starts with no end in window ----------------------------------------

{
  const hours = windowFrom(18)
  // From 22:00 onward wet through end
  for (let i = 4; i < hours.length; i += 1) {
    hours[i] = hour(hours[i].time, { precipitation: 0.08, precipChance: 70 })
  }
  const t = precipTiming(hours)
  assertMatch('starts without endsAt', t, {
    kind: 'starts',
    startsAt: '2026-08-09T22:00',
    endsAt: null,
  })
}

console.log(`\n${failed === 0 ? 'All passed.' : `${failed} failed.`}`)
if (failed) process.exit(1)
