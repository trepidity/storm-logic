/**
 * Location-search query parsing for the Open-Meteo geocoder.
 *
 * Open-Meteo only matches the place *name*, so "Florence, OR" or
 * "Florence Oregon" return nothing, and a bare "Florence" buries smaller
 * towns below the first handful of results. We split an optional qualifier
 * (US state, country, or — after a comma — any region text) off the city,
 * search the city alone, then filter the results by that qualifier.
 *
 * Pure functions only; searchPlaces() in api.js does the fetching.
 */

export const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
}

const STATE_BY_NAME = new Map(
  Object.values(US_STATES).map((name) => [name.toLowerCase(), name]),
)
STATE_BY_NAME.set('washington dc', 'District of Columbia')
STATE_BY_NAME.set('d.c.', 'District of Columbia')

// ISO 3166-1 alpha-2 codes; English names come from Intl.DisplayNames.
const ISO2 = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ ' +
  'BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM ' +
  'DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS ' +
  'GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN ' +
  'KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ ' +
  'MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM ' +
  'PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV ' +
  'SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI ' +
  'VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

const COUNTRY_BY_NAME = new Map()
;(() => {
  let names = null
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    /* very old runtime — codes and aliases below still work */
  }
  for (const code of ISO2) {
    const name = names?.of(code)
    if (name && name !== code) COUNTRY_BY_NAME.set(name.toLowerCase(), code)
  }
  const aliases = {
    usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', america: 'US', 'united states of america': 'US',
    uk: 'GB', 'u.k.': 'GB', britain: 'GB', 'great britain': 'GB',
    'south korea': 'KR', korea: 'KR', 'north korea': 'KP', russia: 'RU',
    'czech republic': 'CZ', holland: 'NL', vietnam: 'VN', 'ivory coast': 'CI',
  }
  for (const [alias, code] of Object.entries(aliases)) COUNTRY_BY_NAME.set(alias, code)
})()
const ISO2_SET = new Set(ISO2)

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Interpret one qualifier string. Returns null when it is not a known US state
 * or country. Two-letter codes like "CA" or "IN" can be both a state and a
 * country, so both readings are kept.
 *
 * @returns {{ states: string[], countryCodes: string[] } | null}
 */
export function resolveQualifier(text) {
  const key = norm(text)
  if (!key) return null
  const states = new Set()
  const countryCodes = new Set()

  const upper = key.toUpperCase()
  if (/^[a-z]{2}$/.test(key)) {
    if (US_STATES[upper]) states.add(US_STATES[upper])
    if (ISO2_SET.has(upper)) countryCodes.add(upper)
  }
  if (STATE_BY_NAME.has(key)) states.add(STATE_BY_NAME.get(key))
  if (COUNTRY_BY_NAME.has(key)) countryCodes.add(COUNTRY_BY_NAME.get(key))

  if (!states.size && !countryCodes.size) return null
  return { states: [...states], countryCodes: [...countryCodes] }
}

/**
 * Split a search box query into a city and qualifiers.
 *
 *   "Florence, OR"         → { city: 'Florence', qualifiers: [Oregon], form: 'comma' }
 *   "Florence Oregon"      → { city: 'Florence', qualifiers: [Oregon], form: 'trailing' }
 *   "Salt Lake City, UT"   → { city: 'Salt Lake City', ... }
 *   "New York" / "Oregon City" → { city: <full>, qualifiers: [], form: 'plain' }
 *
 * Comma qualifiers that aren't a known state/country (e.g. "London, Ontario")
 * are kept as free text and matched loosely against admin1/admin2/country.
 */
export function parsePlaceQuery(query) {
  const text = String(query ?? '').trim().replace(/\s+/g, ' ')
  const plain = { city: text, qualifiers: [], form: 'plain' }

  if (text.includes(',')) {
    const [city, ...rest] = text.split(',').map((p) => p.trim())
    const parts = rest.filter(Boolean)
    if (!city) return plain
    if (!parts.length) return { ...plain, city }
    return {
      city,
      qualifiers: parts.map((raw) => ({ raw, ...(resolveQualifier(raw) ?? { states: [], countryCodes: [], free: true }) })),
      form: 'comma',
    }
  }

  // No comma: try the longest trailing run (up to 3 words, e.g. "New South
  // Wales" isn't covered but "North Carolina" / "United Kingdom" are) that is
  // a known state or country, leaving at least one word for the city.
  const words = text.split(' ')
  for (let n = Math.min(3, words.length - 1); n >= 1; n -= 1) {
    const raw = words.slice(-n).join(' ')
    const resolved = resolveQualifier(raw)
    if (resolved) {
      return {
        city: words.slice(0, -n).join(' '),
        qualifiers: [{ raw, ...resolved }],
        form: 'trailing',
      }
    }
  }
  return plain
}

function matchesQualifier(result, q) {
  const admin1 = norm(result.admin1)
  const country = norm(result.country)
  const cc = String(result.country_code ?? '').toUpperCase()
  if (q.free) {
    const want = norm(q.raw)
    return [admin1, norm(result.admin2), country].some((v) => v && (v === want || v.startsWith(want)))
  }
  if (cc === 'US' && q.states.some((s) => norm(s) === admin1)) return true
  if (q.countryCodes.includes(cc)) return true
  return false
}

/** Keep only raw Open-Meteo results that satisfy every qualifier. */
export function filterResults(results, qualifiers) {
  if (!qualifiers?.length) return results ?? []
  return (results ?? []).filter((r) => qualifiers.every((q) => matchesQualifier(r, q)))
}

/**
 * Country code to send to Open-Meteo so it narrows the search server-side.
 * Only set when every qualifier agrees on a single country; ambiguous ones
 * like "CA" (California or Canada) are filtered client-side instead.
 */
export function countryCodeHint(qualifiers) {
  let hint = null
  for (const q of qualifiers ?? []) {
    if (q.free) continue
    const codes = new Set(q.countryCodes)
    if (q.states.length) codes.add('US')
    if (codes.size !== 1) continue
    const [code] = codes
    if (hint && hint !== code) return null
    hint = code
  }
  return hint
}
