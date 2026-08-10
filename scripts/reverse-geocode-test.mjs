/**
 * Reverse geocoding for "My location".
 *
 * Open-Meteo has no reverse endpoint, so we name a GPS fix via BigDataCloud's
 * keyless client API. This test drives reverseGeocode / currentPosition through
 * mocked fetch + geolocation — no network.
 *
 * Run: node scripts/reverse-geocode-test.mjs
 */

import { reverseGeocode, currentPosition } from '../src/lib/api.js'

const CHICAGO_FIX = {
  city: 'Chicago',
  locality: 'Chicago',
  principalSubdivision: 'Illinois',
  countryName: 'United States of America (the)',
  countryCode: 'US',
  // Deliberately different from the GPS fix — we must keep the GPS coords.
  latitude: 41.85,
  longitude: -87.65,
}

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
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) pass(name)
  else fail(name, `got ${g} want ${w}`)
}

function withFetch(impl, fn) {
  const previous = globalThis.fetch
  globalThis.fetch = impl
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = previous
    })
}

// --- reverseGeocode maps a vendor payload to a place ----------------------

await withFetch(async (input) => {
  const url = String(input)
  if (!url.includes('api.bigdatacloud.net/data/reverse-geocode-client')) {
    fail('reverse hits BigDataCloud', url)
  }
  const u = new URL(url)
  assertEqual('reverse query lat', u.searchParams.get('latitude'), '41.8781')
  assertEqual('reverse query lon', u.searchParams.get('longitude'), '-87.6298')
  return new Response(JSON.stringify(CHICAGO_FIX), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}, async () => {
  const place = await reverseGeocode(41.8781, -87.6298)
  assertEqual('name is city', place.name, 'Chicago')
  assertEqual('label is readable', place.label, 'Chicago, Illinois, United States of America')
  assertEqual('admin1', place.admin1, 'Illinois')
  assertEqual('country strips (the)', place.country, 'United States of America')
  assertEqual('countryCode', place.countryCode, 'US')
  // GPS fix, not city centroid from the reverse payload.
  assertEqual('keeps GPS latitude', place.latitude, 41.8781)
  assertEqual('keeps GPS longitude', place.longitude, -87.6298)
})

// --- locality fallback when city is empty ---------------------------------

await withFetch(async () => {
  return new Response(
    JSON.stringify({
      city: '',
      locality: 'Rogers Park',
      principalSubdivision: 'Illinois',
      countryName: 'United States of America',
      countryCode: 'US',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}, async () => {
  const place = await reverseGeocode(42.01, -87.67)
  assertEqual('falls back to locality', place.name, 'Rogers Park')
})

// --- empty payload → null -------------------------------------------------

await withFetch(async () => {
  return new Response(JSON.stringify({ countryName: 'Ocean' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}, async () => {
  const place = await reverseGeocode(0, 0)
  assertEqual('no name → null', place, null)
})

// --- currentPosition names the fix; reverse failure still yields coords ---

{
  // Node exposes a non-writable navigator; replace the whole object for the suite.
  const previousNavigator = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {
      geolocation: {
        getCurrentPosition(success) {
          success({ coords: { latitude: 41.8781, longitude: -87.6298 } })
        },
      },
    },
  })

  try {
    await withFetch(async () => {
      return new Response(JSON.stringify(CHICAGO_FIX), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }, async () => {
      const place = await currentPosition()
      assertEqual('currentPosition name', place.name, 'Chicago')
      assertEqual(
        'currentPosition label',
        place.label,
        'Chicago, Illinois, United States of America',
      )
      assertEqual('currentPosition id is geo', place.id, 'geo')
      assertEqual('currentPosition GPS lat', place.latitude, 41.8781)
    })

    await withFetch(async () => {
      return new Response(JSON.stringify({ error: true }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }, async () => {
      const place = await currentPosition()
      assertEqual('reverse fail keeps coords', place.latitude, 41.8781)
      assertEqual('reverse fail generic name', place.name, 'My location')
      assertEqual('reverse fail generic label', place.label, 'My location')
      assertEqual('reverse fail still geo', place.id, 'geo')
    })

    // A non-responsive third party must be no worse than a rejected one: the
    // app still switches to the actual GPS fix under its generic label.
    let reverseWasAborted = false
    await withFetch((_input, init) => {
      const signal = init?.signal
      return new Promise((_resolve, reject) => {
        if (!signal) {
          reject(new Error('reverse request had no abort signal'))
          return
        }
        signal.addEventListener(
          'abort',
          () => {
            reverseWasAborted = true
            const err = new Error('reverse lookup timed out')
            err.name = 'AbortError'
            reject(err)
          },
          { once: true },
        )
      })
    }, async () => {
      const guard = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('reverse lookup did not time out')), 3_000),
      )
      const place = await Promise.race([currentPosition(), guard])
      assertEqual('reverse timeout aborts the request', reverseWasAborted, true)
      assertEqual('reverse timeout keeps coords', place.latitude, 41.8781)
      assertEqual('reverse timeout uses generic label', place.label, 'My location')
    })
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: previousNavigator,
    })
  }
}

console.log(`\n${failed === 0 ? 'All passed.' : `${failed} failed.`}`)
if (failed) process.exit(1)
