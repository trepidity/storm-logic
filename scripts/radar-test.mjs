/**
 * Radar tab: pure frame logic, then the tab behaviour in a browser.
 *
 * RainViewer and CARTO are both mocked, so this runs with no network.
 *
 * Dev-only. Requires: npm ci && npx playwright install chromium
 * Run: npm run build && node scripts/radar-test.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { normaliseFrames, tileUrlTemplate, TILE_SIZE } from '../src/lib/radar.js'

const results = []
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

// ---- pure ------------------------------------------------------------------

const INDEX = {
  version: '2.0',
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [
      { time: 1786394700, path: '/v2/radar/1786394700' },
      { time: 1786401900, path: '/v2/radar/1786401900' },
      { time: 1786409700, path: '/v2/radar/1786409700' },
    ],
    nowcast: [
      { time: 1786410300, path: '/v2/radar/nowcast_1' },
      { time: 1786410900, path: '/v2/radar/nowcast_2' },
    ],
  },
}

// Exact NWS GeoJSON fixture. The browser seam below must take this official
// geometry from the alert card into the lazy Radar surface; it must not invent
// a boundary when NWS has none.
const ALERTS = {
  type: 'FeatureCollection',
  features: [
    {
      id: 'https://api.weather.gov/alerts/fixture-polygon',
      geometry: {
        type: 'Polygon',
        coordinates: [[[-87.75, 41.82], [-87.56, 41.82], [-87.56, 41.95], [-87.75, 41.95], [-87.75, 41.82]]],
      },
      properties: {
        '@id': 'https://api.weather.gov/alerts/fixture-polygon',
        event: 'Severe Thunderstorm Warning',
        headline: 'Severe Thunderstorm Warning for Cook County',
        severity: 'Severe',
        effective: '2030-08-09T14:00:00-05:00',
        expires: '2030-08-09T15:00:00-05:00',
      },
    },
    {
      id: 'https://api.weather.gov/alerts/fixture-no-geometry',
      geometry: null,
      properties: {
        '@id': 'https://api.weather.gov/alerts/fixture-no-geometry',
        event: 'Flood Advisory',
        headline: 'Flood Advisory without a mappable boundary',
        severity: 'Moderate',
        effective: '2030-08-09T14:00:00-05:00',
        expires: '2030-08-09T15:00:00-05:00',
      },
    },
  ],
}

// Provider-shaped IEM fixtures for the L0 Radar seam. They deliberately use
// one report at the oldest frame and one attribute scan at the latest observed
// frame, so scrubbing proves the independent report/scan clocks rather than a
// shared "current" timestamp.
const IEM_LSR = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature', id: 'fixture-report',
    properties: { typetext: 'HAIL', qualifier: 'M', valid: '2026-08-10T20:45:00Z' },
    geometry: { type: 'Point', coordinates: [-87.63, 41.88] },
  }],
}
const IEM_ATTRIBUTES = {
  type: 'FeatureCollection', generated_at: '2026-08-11T00:55:00Z',
  features: [{
    type: 'Feature', id: 'fixture-cell',
    properties: {
      nexrad: 'LOT', storm_id: 'A1', azimuth: 280, range: 18, tvs: 'NONE', meso: 'NONE',
      posh: 30, poh: 70, max_size: 0.75, vil: 35, max_dbz: 57, max_dbz_height: 19,
      top: 42, drct: 245, sknt: 32, valid: '2026-08-11T00:55:00Z',
    },
    geometry: { type: 'Point', coordinates: [-87.63, 41.88] },
  }],
}

const deskNow = Date.now()
const deskIso = (offsetMs) => new Date(deskNow + offsetMs).toISOString()
const spcStamp = (offsetMs) => {
  const date = new Date(deskNow + offsetMs)
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}`
}

// These recorded-shape provider responses are routed through the real regional
// clients and adapters. The browser only observes their LayerState projection
// in Radar; it never receives provider field names.
const DESK_WARNINGS = {
  type: 'FeatureCollection',
  updated: deskIso(-60_000),
  features: [{
    id: 'https://api.weather.gov/alerts/radar-desk-fixture',
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-88.02, 41.78], [-87.58, 41.78], [-87.58, 42.08], [-88.02, 42.08], [-88.02, 41.78]]],
    },
    properties: {
      '@id': 'https://api.weather.gov/alerts/radar-desk-fixture',
      event: 'Severe Thunderstorm Warning',
      headline: 'Fixture warning for official desk composition',
      severity: 'Severe',
      status: 'Actual',
      messageType: 'Alert',
      sent: deskIso(-120_000),
      effective: deskIso(-90_000),
      expires: deskIso(60 * 60_000),
    },
  }],
}

const DESK_SPC = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    id: 'radar-desk-spc-fixture',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-90.8, 39.2], [-87.1, 39.2], [-87.1, 42.8], [-90.8, 42.8], [-90.8, 39.2]]],
    },
    properties: {
      objectid: 1,
      issue: spcStamp(-5 * 60_000),
      valid: spcStamp(-60_000),
      expire: spcStamp(6 * 60 * 60_000),
      label: '0.05',
      label2: '5% Hail Risk',
    },
  }],
}

const norm = normaliseFrames(INDEX)
check('past and nowcast are flattened in order', norm.frames.length, 5)
check('nowcast frames are tagged as forecast', norm.frames.map((f) => f.future), [false, false, false, true, true])
check('loop starts on the latest observation, not two hours ago', norm.nowIndex, 2)
check('malformed entries are dropped', normaliseFrames({ host: 'h', radar: { past: [{ time: 1 }, { path: '/p' }] } }).frames, [])
check('an empty payload does not throw', normaliseFrames(undefined).frames, [])

// The size in the path must match Leaflet's tileSize, or radar renders at the
// wrong scale over the basemap. This is the mistake worth a regression test.
check(
  'tile template embeds the same size the map is configured with',
  tileUrlTemplate('https://h', '/v2/radar/1', { size: TILE_SIZE }),
  'https://h/v2/radar/1/256/{z}/{x}/{y}/4/1_1.png',
)
check('tile size constant is 256', TILE_SIZE, 256)

// ---- browser ---------------------------------------------------------------

const ROOT = new URL('../dist/', import.meta.url).pathname
const PORT = 0
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' }

const dates = Array.from({ length: 11 }, (_, i) => `2026-08-${String(9 + i).padStart(2, '0')}`)
const hourlyTime = []
const hourlyCloud = []
const hourlyTemp = []
const hourlyChance = []
const hourlyCode = []
for (const d of dates) {
  for (let h = 0; h < 24; h += 1) {
    hourlyTime.push(`${d}T${String(h).padStart(2, '0')}:00`)
    hourlyCloud.push((h * 11) % 101)
    hourlyTemp.push(60 + (h % 12) * 2)
    hourlyChance.push((h * 7) % 60)
    hourlyCode.push(2)
  }
}
const fill = (v) => dates.map(() => v)
const FORECAST = {
  latitude: 41.88,
  longitude: -87.63,
  timezone: 'America/Chicago',
  current: {
    time: '2026-08-09T14:30', temperature_2m: 78, relative_humidity_2m: 62,
    apparent_temperature: 81, is_day: 1, precipitation: 0, rain: 0, showers: 0, snowfall: 0,
    weather_code: 0, cloud_cover: 44, pressure_msl: 1008,
    wind_speed_10m: 16, wind_direction_10m: 180, wind_gusts_10m: 31,
  },
  daily: {
    time: dates, weather_code: fill(0),
    temperature_2m_max: fill(84), temperature_2m_min: fill(66),
    apparent_temperature_max: fill(88), apparent_temperature_min: fill(64),
    sunrise: dates.map((d) => `${d}T06:24`), sunset: dates.map((d) => `${d}T20:19`),
    daylight_duration: fill(50100), sunshine_duration: fill(30000), uv_index_max: fill(8),
    precipitation_sum: fill(0), rain_sum: fill(0), showers_sum: fill(0), snowfall_sum: fill(0),
    precipitation_hours: fill(0), precipitation_probability_max: fill(10),
    wind_speed_10m_max: fill(16), wind_gusts_10m_max: fill(31), wind_direction_10m_dominant: fill(180),
  },
  hourly: {
    time: hourlyTime, cloud_cover: hourlyCloud, temperature_2m: hourlyTemp,
    precipitation_probability: hourlyChance, weather_code: hourlyCode,
  },
}

// 1x1 transparent PNG — the tab's behaviour is under test, not the imagery.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

const server = createServer(async (req, res) => {
  const p = normalize(req.url.split('?')[0])
  const file = join(ROOT, p === '/' ? 'index.html' : p)
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(await readFile(join(ROOT, 'index.html')))
  }
})
await new Promise((r) => server.listen(PORT, r))
const serverPort = server.address().port

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } })
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(e.stack || e.message))
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))

let radarRequests = 0
const officialRequests = []
await page.route('**/api/forecast*', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORECAST) }))
await page.route('https://geocoding-api.open-meteo.com/v1/search*', (r) =>
  r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ results: [{
      id: 4393217, name: 'Kansas City', latitude: 39.1142, longitude: -94.5786,
      country: 'United States', country_code: 'US', admin1: 'Missouri',
    }] }),
  }))
await page.route('**/api/alerts*', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALERTS) }))
await page.route('**/api/severeDesk/iemLsr*', (r) =>
  r.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(IEM_LSR) }))
await page.route('**/api/severeDesk/iemAttributes', (r) =>
  r.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(IEM_ATTRIBUTES) }))
await page.route('**/api/nws-warnings*', (r) => {
  officialRequests.push(r.request().url())
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DESK_WARNINGS) })
})
await page.route('**/api/severe-desk-spc*', (r) => {
  officialRequests.push(r.request().url())
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DESK_SPC) })
})
// Regexes, not globs: CARTO serves from a.basemaps.cartocdn.com and friends,
// and a glob's host segment won't match across the subdomain.
await page.route(/api\.rainviewer\.com/, (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(INDEX) }))
await page.route(/tilecache\.rainviewer\.com/, (r) => {
  radarRequests += 1
  return r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
})
await page.route(/basemaps\.cartocdn\.com/, (r) =>
  r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }))

await page.goto(`http://localhost:${serverPort}/`, { waitUntil: 'networkidle' })
await page.waitForSelector('.current__temp')

check('forecast is the landing tab', await page.locator('.tabs button.is-active').textContent(), 'Forecast')
check('radar is not mounted before the tab is opened', await page.locator('.radar__map').count(), 0)
check('no radar tiles fetched on the forecast tab', radarRequests, 0)

await page.locator('.tabs button', { hasText: 'Radar' }).click()
await page.waitForSelector('.radar__tick', { timeout: 15000 })
await page.waitForTimeout(600)

check('forecast card is gone while radar is open', await page.locator('.current__temp').count(), 0)
check('one tick per frame', await page.locator('.radar__tick').count(), 5)
check('forecast frames are marked', await page.locator('.radar__tick--future').count(), 2)
check('exactly one frame is active', await page.locator('.radar__tick--on').count(), 1)
check('radar tiles were requested once the tab opened', radarRequests > 0, true)
check(
  'radar identifies its composite-reflectivity source and limits',
  await page.locator('.radar__provenance').textContent(),
  'RainViewer composite reflectivity · radar observation, not an official warning or a hail/tornado report.',
)
check('official desk exposes independent SPC and warning layer controls', [
  await page.locator('.radar__layer[data-layer-id="spc-outlooks"]').count(),
  await page.locator('.radar__layer[data-layer-id="warnings"]').count(),
], [1, 1])
await page.waitForSelector('.radar__official-polygon--outlook', { timeout: 10000 })
await page.waitForSelector('.radar__official-polygon--warning', { timeout: 10000 })
check('opening Radar fetches exactly one state-scale official desk region', officialRequests.length, 2)
check(
  'the selected Illinois place resolves to one NWS state code',
  officialRequests.some((url) => url.endsWith('/api/nws-warnings?area=IL')),
  true,
)
check(
  'the selected Illinois place resolves to the fixed SPC state envelope',
  officialRequests.some((url) => url.includes('/api/severe-desk-spc?day=1&hazard=hail&bbox=-91.513079%2C36.970298%2C-87.495199%2C42.508481')),
  true,
)
check(
  'SPC source/product is explicit instead of inventing an outlook',
  await page.locator('.radar__layer[data-layer-id="spc-outlooks"] .radar__layer-source').textContent(),
  'NOAA Storm Prediction Center · Day 1 hail probability outlook',
)
check(
  'SPC issued time remains visible at the Radar consumer seam',
  (await page.locator('.radar__layer[data-layer-id="spc-outlooks"] .radar__layer-time').textContent()).startsWith('Issued · '),
  true,
)
check(
  'NWS source/product is explicit instead of inventing an alert boundary',
  await page.locator('.radar__layer[data-layer-id="warnings"] .radar__layer-source').textContent(),
  'NWS API · watches-warnings-advisories',
)
check(
  'NWS source update time remains visible at the Radar consumer seam',
  (await page.locator('.radar__layer[data-layer-id="warnings"] .radar__layer-time').textContent()).startsWith('Source update · '),
  true,
)
const mapBox = await page.locator('.radar__map').boundingBox()
if (mapBox) {
  await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(mapBox.x + mapBox.width / 2 + 90, mapBox.y + mapBox.height / 2 + 30, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(1_000)
}
check('panning the map does not turn the fixed desk region into another provider request', officialRequests.length, 2)
await page.locator('.radar__layer[data-layer-id="spc-outlooks"] .radar__layer-toggle').click()
check(
  'official layer controls expose their independent visibility state',
  await page.locator('.radar__layer[data-layer-id="spc-outlooks"] .radar__layer-toggle').getAttribute('aria-pressed'),
  'false',
)

// The L0 tracking seam is deliberately driven by the rendered Radar timeline,
// not direct adapter calls. The latest observed frame can show both a report
// and a scan; the older frame retains the report but must not borrow a future
// scan or draw a plausible cell there.
await page.locator('.radar__tick').nth(2).click()
await page.waitForSelector('.radar__layer[data-layer-id="storm-reports"]')
await page.waitForSelector('.radar__tracking-marker--report')
await page.waitForSelector('.radar__tracking-marker--signature')
check('tracking desk exposes separate report and storm-attribute layers', await page.locator('.radar__layer').count(), 4)
check(
  'storm reports retain report authority in the Radar layer stack',
  await page.locator('.radar__layer[data-layer-id="storm-reports"] .radar__layer-source').textContent(),
  'Iowa Environmental Mesonet · Local Storm Reports',
)
check(
  'storm attributes disclose the bounded client-side scope',
  await page.locator('.radar__layer[data-layer-id="storm-attributes"] .radar__layer-scope').textContent(),
  'IEM provides no recorded regional filter; markers are limited to this map view in your browser.',
)
check('latest observed frame renders both independently timed marker classes', [
  await page.locator('.radar__tracking-marker--report').count(),
  await page.locator('.radar__tracking-marker--signature').count(),
], [1, 1])

await page.locator('.radar__tick').nth(0).click()
await page.waitForSelector('.radar__layer[data-layer-id="storm-attributes"] .radar__layer-status')
check('an older report stays visible without borrowing a future attribute scan', [
  await page.locator('.radar__tracking-marker--report').count(),
  await page.locator('.radar__tracking-marker--signature').count(),
], [1, 0])
check(
  'out-of-window attributes render an explicit absence rather than a fabricated cell track',
  await page.locator('.radar__layer[data-layer-id="storm-attributes"] .radar__layer-status').textContent(),
  'Storm attributes unavailable.',
)

await page.locator('.radar__tick').nth(2).click()
await page.waitForTimeout(100)
check('hiding SPC removes only its projected geometry', await page.locator('.radar__official-polygon--outlook').count(), 0)
check('hiding SPC preserves the higher-z official warning geometry', await page.locator('.radar__official-polygon--warning').count(), 1)
const officialPaneOrder = await page.evaluate(() => [
  document.querySelector('.leaflet-radar-official-spc-outlooks-pane')?.style.zIndex,
  document.querySelector('.leaflet-radar-official-warnings-pane')?.style.zIndex,
])
check('official pane z-order is deterministic: SPC beneath NWS warnings', officialPaneOrder, ['430', '440'])

// Same stylesheet-loss guard as the smoke test: the radar section can vanish
// without a single behavioural assertion noticing.
const mapStyled = await page.evaluate(() => {
  const map = document.querySelector('.radar__map').getBoundingClientRect()
  const tick = document.querySelector('.radar__tick')
  return map.height > 200 && getComputedStyle(tick).backgroundColor !== 'rgba(0, 0, 0, 0)'
})
check('radar styles are present (map has height, ticks have a surface)', mapStyled, true)

// The time-selection clicks above paused animation; scrub to a forecast frame.
await page.locator('.radar__tick').nth(4).click()
await page.waitForTimeout(200)
const stamp = await page.locator('.radar__stamp').textContent()
check('scrubbing to a nowcast frame labels it as forecast', stamp.startsWith('Forecast · '), true)
const activeIsLast = await page
  .locator('.radar__tick')
  .nth(4)
  .evaluate((n) => n.classList.contains('radar__tick--on'))
check('the scrubbed tick becomes the active one', activeIsLast, true)

// Back to forecast and the map is torn down.
await page.locator('.tabs button', { hasText: 'Forecast' }).click()
await page.waitForSelector('.current__temp')
check('returning to forecast restores the card', await page.locator('.current__temp').count(), 1)
check('the map is unmounted on leaving the tab', await page.locator('.radar__map').count(), 0)

// L0: an active alert must open the lazy Radar view with the official NWS
// polygon. A second alert without geometry must still open Radar but never
// create a plausible-looking substitute boundary.
await page.locator('.tabs button', { hasText: 'Alerts' }).click()
await page.waitForSelector('.alerts .alert', { timeout: 10000 })
check('both active alert fixtures render', await page.locator('.alert').count(), 2)
check(
  'alerts identify NWS cards as official alert products',
  await page.locator('.alerts__eyebrow').textContent(),
  'National Weather Service · official watches, warnings, and advisories',
)

const alertRadarActions = page.locator('.alert__radar')
check('active alerts offer a Radar handoff', await alertRadarActions.count(), 2)
if ((await alertRadarActions.count()) === 2) {
  await alertRadarActions.nth(0).click()
  await page.waitForSelector('.radar__map', { timeout: 10000 })
  await page.waitForSelector('.radar__alert-polygon', { timeout: 10000 })
  check('polygon alert opens Radar with one official boundary', await page.locator('.radar__alert-polygon').count(), 1)
  check(
    'Radar identifies the selected official alert area',
    await page.locator('.radar__alert-note').textContent(),
    'Official NWS alert area · Severe Thunderstorm Warning',
  )

  await page.locator('.tabs button', { hasText: 'Alerts' }).click()
  await page.waitForSelector('.alert__radar', { timeout: 10000 })
  await page.locator('.alert__radar').nth(1).click()
  await page.waitForSelector('.radar__map', { timeout: 10000 })
  check('geometry-free alert leaves Radar without a fabricated boundary', await page.locator('.radar__alert-polygon').count(), 0)
  check(
    'geometry-free alert explains the absent official boundary',
    await page.locator('.radar__alert-note').textContent(),
    'NWS did not provide a mappable boundary for this alert. Radar is centered on Chicago.',
  )
}

// L0 place-change proof: keyed map recreation alone cannot be allowed to
// inherit the prior Illinois geometry before Missouri's settled request returns.
const requestCountBeforePlaceSwitch = officialRequests.length
await page.locator('input[type="search"]').fill('Kansas City')
await page.waitForSelector('.search__results button', { timeout: 10000 })
await page.locator('.search__results button').click()
await page.waitForSelector('.radar__official-layers', { timeout: 10000 })
check(
  'a state change clears prior official geometry during the 750 ms settle',
  [await page.locator('.radar__official-polygon--outlook').count(), await page.locator('.radar__official-polygon--warning').count()],
  [0, 0],
)
await page.waitForSelector('.radar__official-polygon--outlook', { timeout: 10000 })
const settledMissouriRequests = officialRequests.slice(requestCountBeforePlaceSwitch)
check('the settled state change ends at the Missouri NWS request', settledMissouriRequests.slice(-2).some((url) => url.endsWith('/api/nws-warnings?area=MO')), true)
check('the settled state change ends at the Missouri SPC envelope', settledMissouriRequests.slice(-2).some((url) => url.includes('bbox=-95.774704%2C35.995683%2C-89.098843%2C40.61364')), true)

// Kansas City exists in two state-scale desk regions. The selected Place.admin1
// alone chooses the canonical state code and Census-derived envelope; a map
// position is never used to infer or expand either request.
for (const { label, admin1, longitude, expectedArea, expectedBbox } of [
  { label: 'Kansas City, Missouri', admin1: 'Missouri', longitude: -94.5786, expectedArea: 'MO', expectedBbox: '-95.774704%2C35.995683%2C-89.098843%2C40.61364' },
  { label: 'Kansas City, Kansas', admin1: 'Kansas', longitude: -94.6275, expectedArea: 'KS', expectedBbox: '-102.051744%2C36.993016%2C-94.588413%2C40.003162' },
]) {
  const requestCountBeforeKansasCity = officialRequests.length
  await page.evaluate(({ label: cityLabel, state, lng }) => {
    localStorage.setItem('stormlogic:v1:lastPlace', JSON.stringify({
      key: `39.1142,${lng}`, name: 'Kansas City', label: cityLabel,
      latitude: 39.1142, longitude: lng, admin1: state, country: 'United States', isGeo: false,
    }))
  }, { label, state: admin1, lng: longitude })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.tabs button', { hasText: 'Radar' }).click()
  await page.waitForSelector('.radar__official-polygon--outlook', { timeout: 10000 })
  const kansasCityRequests = officialRequests.slice(requestCountBeforeKansasCity)
  check(`${label} makes one state-scale official desk request pair`, kansasCityRequests.length, 2)
  check(`${label} resolves its selected state for NWS`, kansasCityRequests.some((url) => url.endsWith(`/api/nws-warnings?area=${expectedArea}`)), true)
  check(`${label} resolves its selected state for SPC`, kansasCityRequests.some((url) => url.includes(`bbox=${expectedBbox}`)), true)
}

// L0 fail-closed proof: the initial official desk only has an approved
// contiguous-state mapping. A stored non-U.S. place must render explicit
// unavailable states and must not make an unbounded provider request.
const officialRequestCountBeforeUnsupportedPlace = officialRequests.length
await page.evaluate(() => {
  localStorage.setItem('stormlogic:v1:lastPlace', JSON.stringify({
    key: '51.5074,-0.1278', name: 'London', label: 'London, England, United Kingdom',
    latitude: 51.5074, longitude: -0.1278, admin1: 'England', country: 'United Kingdom', isGeo: false,
  }))
  localStorage.setItem('stormlogic:v1:onboarded', 'true')
})
await page.reload({ waitUntil: 'networkidle' })
await page.locator('.tabs button', { hasText: 'Radar' }).click()
await page.waitForSelector('.radar__official-layers', { timeout: 10000 })
await page.waitForTimeout(850)
check('an unsupported place fails closed without official-provider requests', officialRequests.length, officialRequestCountBeforeUnsupportedPlace)
check(
  'an unsupported place exposes typed unavailable official layers',
  await page.locator('.radar__layer-status').allTextContents(),
  ['SPC outlooks unavailable.', 'Official alerts unavailable.', 'Storm attributes unavailable.'],
)

await browser.close()
server.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} assertions passed.`)
if (consoleErrors.length) console.error(`\nCONSOLE ERRORS:\n${consoleErrors.join('\n')}`)
if (failed || consoleErrors.length) process.exit(1)
console.log('No console errors.')
