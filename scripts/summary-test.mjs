/**
 * Unit tests for summariseDay — pure logic, no browser needed.
 *
 * The case that prompted this: Open-Meteo reported daily weather_code 51
 * (drizzle) for a day with a 2% precipitation probability and zero
 * accumulation, because the daily code is the most severe hourly code rather
 * than a representative one. The label has to come from the numbers.
 *
 * Run: node scripts/summary-test.mjs
 */
import { summariseDay } from '../src/lib/daySummary.js'

const day = (over) => ({
  weatherCode: 0,
  precipChance: 0,
  precipHours: 0,
  precipSum: 0,
  snowSum: 0,
  cloudCoverDay: 30,
  cloudCoverMean: 30,
  ...over,
})

const cases = [
  {
    name: 'THE BUG: drizzle code at 2% chance describes the sky instead',
    input: day({ weatherCode: 51, precipChance: 2, precipHours: 0, precipSum: 0, cloudCoverDay: 40 }),
    expect: { precip: 'none', short: 'Partly cloudy' },
  },
  {
    name: 'drizzle code with real probability and accumulation is named',
    input: day({ weatherCode: 51, precipChance: 45, precipHours: 3, precipSum: 0.1 }),
    expect: { precip: 'likely', short: 'Drizzle' },
  },
  {
    name: 'middling probability hedges rather than asserting',
    input: day({ weatherCode: 51, precipChance: 25, precipHours: 2, precipSum: 0.02 }),
    expect: { precip: 'possible', short: 'Chance of rain' },
  },
  {
    name: 'high probability with nothing forecast to fall is not precipitation',
    input: day({ weatherCode: 51, precipChance: 50, precipHours: 0, precipSum: 0, cloudCoverDay: 70 }),
    expect: { precip: 'none', short: 'Mostly cloudy' },
  },
  {
    name: 'snow hedges at a lower threshold than rain',
    input: day({ weatherCode: 71, precipChance: 18, precipHours: 2, precipSum: 0.3, snowSum: 1.2 }),
    expect: { precip: 'possible', short: 'Chance of snow' },
  },
  {
    name: 'snow at the same probability as rain-that-would-be-ignored still shows',
    input: day({ weatherCode: 73, precipChance: 16, precipHours: 1, precipSum: 0.2, snowSum: 0.8 }),
    expect: { precip: 'possible', short: 'Chance of snow' },
  },
  {
    name: 'hail survives when the storm is credible',
    input: day({ weatherCode: 96, precipChance: 60, precipHours: 4, precipSum: 0.4 }),
    expect: { precip: 'likely', short: 'Storm + hail', hail: true },
  },
  {
    name: 'overcast code with clear skies is relabelled from cloud cover',
    input: day({ weatherCode: 3, precipChance: 8, cloudCoverDay: 18 }),
    expect: { precip: 'none', short: 'Mostly clear' },
  },
  {
    name: 'genuinely overcast day reads overcast',
    input: day({ weatherCode: 3, precipChance: 8, cloudCoverDay: 94 }),
    expect: { precip: 'none', short: 'Overcast' },
  },
  {
    name: 'clear day reads clear',
    input: day({ weatherCode: 0, precipChance: 0, cloudCoverDay: 4 }),
    expect: { precip: 'none', short: 'Clear' },
  },
  {
    name: 'daylight cloud mean is preferred over the 24h mean',
    input: day({ weatherCode: 3, precipChance: 0, cloudCoverDay: 10, cloudCoverMean: 80 }),
    expect: { precip: 'none', short: 'Clear' },
  },
  {
    name: 'missing probability is treated as zero, not as unknown-so-assume-rain',
    input: day({ weatherCode: 61, precipChance: null, precipHours: 2, precipSum: 0.1, cloudCoverDay: 75 }),
    expect: { precip: 'none', short: 'Mostly cloudy' },
  },
]

let failed = 0
for (const c of cases) {
  const got = summariseDay(c.input)
  const bad = Object.entries(c.expect).filter(([k, v]) => got[k] !== v)
  if (bad.length) {
    failed += 1
    console.log(`FAIL  ${c.name}`)
    for (const [k, v] of bad) console.log(`        ${k}: got ${JSON.stringify(got[k])} want ${JSON.stringify(v)}`)
  } else {
    console.log(`PASS  ${c.name}`)
  }
}

console.log(`\n${cases.length - failed}/${cases.length} passed.`)
if (failed) process.exit(1)
