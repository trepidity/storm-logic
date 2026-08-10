/**
 * L2 numeric/ordering proof: a wrong wet-event boundary, sum, or gap policy
 * would ship a plausible but false precipitation total. Browser smoke below
 * proves the returned model reaches the current-card consumer.
 *
 * Run: node scripts/precip-event-test.mjs
 */
import { derivePrecipEvent } from '../src/lib/precipEvent.js'

let failed = 0

function fail(name, detail) {
  failed += 1
  console.error(`FAIL  ${name}\n      ${detail}`)
}

function pass(name) {
  console.log(`PASS  ${name}`)
}

function assertEqual(name, actual, expected) {
  if (actual === expected) pass(name)
  else fail(name, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
}

function assertClose(name, actual, expected) {
  if (Math.abs(actual - expected) < 1e-9) pass(name)
  else fail(name, `got ${actual}, expected ${expected}`)
}

function entry(hour, precipitation) {
  return { time: `2026-08-09T${String(hour).padStart(2, '0')}:00`, precipitation }
}

{
  const event = derivePrecipEvent(
    [entry(8, 0), entry(9, 0.05), entry(10, 0.1)],
    [entry(11, 0.15), entry(12, 0.2), entry(13, 0.3), entry(14, 0)],
  )

  assertEqual('complete event preserves the first dry hour', event?.firstDryAt, '2026-08-09T14:00')
  assertClose('complete event totals precipitation before and after now', event?.total, 0.8)
  assertClose('complete event separates precipitation so far', event?.soFar, 0.3)
  assertClose('complete event separates forecast precipitation remaining', event?.remaining, 0.5)
}

{
  const event = derivePrecipEvent(
    [entry(8, 0.05), entry(9, 0.1), entry(10, 0.1)],
    [entry(11, 0.15), entry(12, 0)],
  )
  assertEqual('event extending beyond retained history suppresses totals', event, null)
}

{
  const event = derivePrecipEvent(
    [entry(8, 0), entry(9, 0.05), entry(10, 0.1)],
    [entry(11, 0.15), entry(12, 0.2), entry(13, 0.3)],
  )
  assertEqual('event continuing past forecast horizon suppresses totals', event, null)
}

{
  const event = derivePrecipEvent(
    [entry(8, 0), entry(9, 0.05), entry(10, 0.1)],
    [entry(11, 0.15), entry(13, 0.3), entry(14, 0)],
  )
  assertEqual('gapped event series suppresses totals', event, null)
}

if (failed) process.exit(1)
