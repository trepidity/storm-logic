/**
 * Location search: qualifier parsing ("Florence, OR", "Florence Oregon") and
 * result filtering, driven through searchPlaces with a mocked Open-Meteo
 * geocoder — no network.
 *
 * Run: node scripts/place-search-test.mjs
 */

import { searchPlaces, SEARCH_RESULT_LIMIT } from '../src/lib/api.js'
import { parsePlaceQuery, resolveQualifier, countryCodeHint } from '../src/lib/placeQuery.js'

let failed = 0
const pass = (name) => console.log(`PASS  ${name}`)
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

let nextId = 1
const place = (name, admin1, country, country_code) => ({
  id: nextId++, name, admin1, country, country_code, latitude: 1, longitude: 2,
})
const US = (name, state) => place(name, state, 'United States', 'US')

// Mirrors Open-Meteo's real ordering for "Florence": Oregon is 8th, and an
// alternate-name hit ("Oregon, Illinois") sneaks in.
const FLORENCE = [
  place('Florence', 'Tuscany', 'Italy', 'IT'),
  US('Florence', 'Alabama'),
  US('Florence', 'South Carolina'),
  US('Florence', 'Arizona'),
  US('Oregon', 'Illinois'),
  US('Florence', 'Wisconsin'),
  US('Florence', 'Kentucky'),
  US('Florence', 'Oregon'),
  US('Florence', 'New Jersey'),
  US('Florence', 'Mississippi'),
  US('Florence', 'Colorado'),
  US('Florence', 'Texas'),
]
const DB = {
  florence: FLORENCE,
  paris: [
    place('Paris', 'Île-de-France Region', 'France', 'FR'),
    US('Paris', 'Texas'),
    US('Paris', 'Tennessee'),
  ],
  'new york': [US('New York', 'New York'), US('New York Mills', 'Minnesota')],
  'oregon city': [US('Oregon City', 'Oregon')],
  'salt lake city': [US('Salt Lake City', 'Utah')],
  salt: [US('Salt Lake City', 'Utah'), place('Salt', 'Catalonia', 'Spain', 'ES')],
}

const calls = []
async function withGeocoder(fn) {
  const previous = globalThis.fetch
  globalThis.fetch = async (url) => {
    const u = new URL(url)
    const name = u.searchParams.get('name')
    const count = Number(u.searchParams.get('count'))
    const cc = u.searchParams.get('countryCode')
    calls.push({ name, count, countryCode: cc })
    let results = DB[name.toLowerCase()] ?? []
    if (cc) results = results.filter((r) => r.country_code === cc)
    results = results.slice(0, count)
    return new Response(JSON.stringify(results.length ? { results } : {}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    return await fn()
  } finally {
    globalThis.fetch = previous
  }
}

const labels = (rs) => rs.map((r) => r.label)
async function search(q) {
  calls.length = 0
  return withGeocoder(() => searchPlaces(q))
}

// ---- parser -------------------------------------------------------------
assertEqual('parse "Florence, OR"', (({ city, form }) => ({ city, form }))(parsePlaceQuery('Florence, OR')), { city: 'Florence', form: 'comma' })
assertEqual('parse "Florence Oregon"', (({ city, form }) => ({ city, form }))(parsePlaceQuery('Florence Oregon')), { city: 'Florence', form: 'trailing' })
assertEqual('parse "florence or"', parsePlaceQuery('florence or').qualifiers[0].states, ['Oregon'])
assertEqual('parse "New York" stays plain', parsePlaceQuery('New York').form, 'plain')
assertEqual('parse "Oregon City" stays plain', parsePlaceQuery('Oregon City').form, 'plain')
assertEqual('parse "Salt Lake City, UT"', parsePlaceQuery('Salt Lake City, UT').city, 'Salt Lake City')
assertEqual('parse "Charlotte North Carolina"', parsePlaceQuery('Charlotte North Carolina').qualifiers[0].states, ['North Carolina'])
assertEqual('"CA" is California or Canada', resolveQualifier('CA'), { states: ['California'], countryCodes: ['CA'] })
assertEqual('"France" resolves to FR', resolveQualifier('France'), { states: [], countryCodes: ['FR'] })
assertEqual('hint US for Oregon', countryCodeHint(parsePlaceQuery('Florence, Oregon').qualifiers), 'US')
assertEqual('no hint for ambiguous CA', countryCodeHint(parsePlaceQuery('Paris, CA').qualifiers), null)

// ---- searchPlaces with mocked geocoder -------------------------------------
{
  const rs = await search('Florence, OR')
  assertEqual('"Florence, OR" → Florence, Oregon only', labels(rs), ['Florence, Oregon, United States'])
  assertEqual('"Florence, OR" searches city with countryCode=US, wide count', calls, [{ name: 'Florence', count: 100, countryCode: 'US' }])
}
{
  const rs = await search('Florence Oregon')
  assertEqual('"Florence Oregon" → Florence, Oregon first', labels(rs)[0], 'Florence, Oregon, United States')
  assertEqual('"Florence Oregon" excludes Oregon, Illinois', labels(rs).includes('Oregon, Illinois, United States'), false)
}
{
  const rs = await search('florence or')
  assertEqual('"florence or" → Florence, Oregon first', labels(rs)[0], 'Florence, Oregon, United States')
}
{
  const rs = await search('Florence, Oregon, US')
  assertEqual('"Florence, Oregon, US" → Florence, Oregon', labels(rs), ['Florence, Oregon, United States'])
}
{
  const rs = await search('Paris, France')
  assertEqual('"Paris, France" → Paris, FR only', labels(rs), ['Paris, Île-de-France Region, France'])
}
{
  const rs = await search('Paris, TX')
  assertEqual('"Paris, TX" → Paris, Texas', labels(rs), ['Paris, Texas, United States'])
}
{
  const rs = await search('New York')
  assertEqual('"New York" plain search', labels(rs)[0], 'New York, New York, United States')
  assertEqual('"New York" unfiltered query', calls.map((c) => c.name), ['New York'])
}
{
  const rs = await search('Oregon City')
  assertEqual('"Oregon City" plain search', labels(rs), ['Oregon City, Oregon, United States'])
}
{
  const rs = await search('Salt Lake City, UT')
  assertEqual('"Salt Lake City, UT" → Utah', labels(rs), ['Salt Lake City, Utah, United States'])
}
{
  const rs = await search('Florence')
  assertEqual(`bare "Florence" shows ${SEARCH_RESULT_LIMIT} incl. Oregon`, [rs.length, labels(rs).includes('Florence, Oregon, United States')], [SEARCH_RESULT_LIMIT, true])
  assertEqual('result shape unchanged', Object.keys(rs[0]).sort(), ['admin1', 'country', 'countryCode', 'id', 'label', 'latitude', 'longitude', 'name'])
}
{
  const rs = await search('Nowhere, OR')
  assertEqual('no match → empty list', rs, [])
  assertEqual('one-letter query → empty', await search('F'), [])
}

console.log(`\n${failed === 0 ? 'All passed.' : `${failed} failed.`}`)
if (failed) process.exit(1)
