/**
 * Radar tab: pure frame logic, then the tab behaviour in a browser.
 *
 * RainViewer and CARTO are both mocked, so this runs with no network.
 *
 * Dev-only. Requires: npm i -D playwright
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
      { time: 1786000000, path: '/v2/radar/1786000000' },
      { time: 1786000600, path: '/v2/radar/1786000600' },
      { time: 1786001200, path: '/v2/radar/1786001200' },
    ],
    nowcast: [
      { time: 1786001800, path: '/v2/radar/nowcast_1' },
      { time: 1786002400, path: '/v2/radar/nowcast_2' },
    ],
  },
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
const PORT = 4176
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

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } })
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(e.message))
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))

let radarRequests = 0
await page.route('**/api/forecast*', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORECAST) }))
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

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
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

// Same stylesheet-loss guard as the smoke test: the radar section can vanish
// without a single behavioural assertion noticing.
const mapStyled = await page.evaluate(() => {
  const map = document.querySelector('.radar__map').getBoundingClientRect()
  const tick = document.querySelector('.radar__tick')
  return map.height > 200 && getComputedStyle(tick).backgroundColor !== 'rgba(0, 0, 0, 0)'
})
check('radar styles are present (map has height, ticks have a surface)', mapStyled, true)

// Pause, then scrub to a forecast frame.
await page.locator('.radar__play').click()
await page.waitForTimeout(150)
check('play toggles to paused', await page.locator('.radar__play').getAttribute('aria-pressed'), 'false')

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

await browser.close()
server.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} assertions passed.`)
if (consoleErrors.length) console.error(`\nCONSOLE ERRORS:\n${consoleErrors.join('\n')}`)
if (failed || consoleErrors.length) process.exit(1)
console.log('No console errors.')
