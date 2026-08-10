/**
 * Behavioural test for saved locations, recents and restore-on-reload.
 *
 * Uses one browser context throughout so localStorage survives page.reload(),
 * which is the whole point of the feature. Both Open-Meteo endpoints (forecast
 * and geocoding) are mocked, so this runs with no network.
 *
 * Dev-only. Requires: npm ci && npx playwright install chromium
 * Run: npm run build && node scripts/persistence-test.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
const PORT = 4175
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
    time: hourlyTime,
    cloud_cover: hourlyCloud,
    temperature_2m: hourlyTemp,
    precipitation_probability: hourlyChance,
    weather_code: hourlyCode,
  },
}

const GEOCODE = {
  results: [
    { id: 2643743, name: 'London', latitude: 51.5085, longitude: -0.1257, country: 'United Kingdom', country_code: 'GB', admin1: 'England' },
  ],
}

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
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
})

// One context for the whole run — localStorage must survive reloads.
const context = await browser.newContext({ viewport: { width: 1180, height: 1000 } })
const page = await context.newPage()
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(e.message))
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))

await page.route('**/api/forecast*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORECAST) }))
await page.route('**/geocoding-api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GEOCODE) }))

const results = []
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ name, pass, actual, expected })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

// Saved and recent share one row now, distinguished by data-kind rather than
// by a labelled group heading.
const chips = (kind) =>
  page.$$eval(`.chip[data-kind="${kind}"] .chip__main`, (ns) =>
    ns.map((n) => n.textContent.replace('★', '').trim()))

const placeName = () => page.locator('.current__place').textContent()
const starred = () => page.locator('.star').evaluate((n) => n.classList.contains('star--on'))

// 1. First visit, geolocation not granted -> default city.
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForSelector('.current__place')
check('first visit falls back to default city', await placeName(), 'Chicago, Illinois, United States')
check('nothing saved yet', await chips('saved'), [])
check('nothing recent yet', await chips('recent'), [])
check('star starts off', await starred(), false)

// 2. Star it, switch units.
await page.locator('.star').click()
await page.locator('.unit-toggle button', { hasText: '°C' }).click()
await page.waitForTimeout(200)
check('starring adds to saved', await chips('saved'), ['Chicago'])
check('star reflects state', await starred(), true)

// 3. Reload -> location, favourite and units all restored.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.current__place')
check('location survives reload', await placeName(), 'Chicago, Illinois, United States')
check('favourite survives reload', await chips('saved'), ['Chicago'])
check('star still on after reload', await starred(), true)
check(
  'units survive reload',
  await page.locator('.unit-toggle button[aria-pressed="true"]').textContent(),
  '°C',
)

// 4. Search a new city -> becomes active, lands in recents.
await page.locator('.search__field input').fill('London')
await page.waitForSelector('.search__results button')
await page.locator('.search__results button').first().click()
await page.waitForTimeout(400)
check('searched city becomes active', await placeName(), 'London, England, United Kingdom')
check('searched city goes to recents', await chips('recent'), ['London'])
check('saved list untouched', await chips('saved'), ['Chicago'])
check('star off for unsaved city', await starred(), false)

// 5. Reload -> the *last viewed* place is restored, not the favourite.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.current__place')
check('last viewed city restored over favourite', await placeName(), 'London, England, United Kingdom')
check('recents survive reload', await chips('recent'), ['London'])

// 6. Starring a recent promotes it out of recents.
await page.locator('.star').click()
await page.waitForTimeout(200)
check('starring promotes out of recents', await chips('recent'), [])
check('both cities now saved', await chips('saved'), ['Chicago', 'London'])

// 7. Unstarring demotes back to recents rather than losing it.
await page.locator('.star').click()
await page.waitForTimeout(200)
check('unstarring demotes to recents', await chips('recent'), ['London'])
check('saved list shrinks', await chips('saved'), ['Chicago'])

// 8. Explicit removal from each list.
await page.locator('.chip[data-kind="recent"] .chip__remove').first().click()
await page.waitForTimeout(200)
check('recent can be dismissed', await chips('recent'), [])

await page.locator('.chip[data-kind="saved"] .chip__remove').first().click()
await page.waitForTimeout(200)
check('saved can be removed', await chips('saved'), [])

// 9. Removals persist.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.current__place')
check('removals survive reload', await chips('saved'), [])

await context.close()
await browser.close()
server.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} assertions passed.`)
if (consoleErrors.length) console.error(`\nCONSOLE ERRORS:\n${consoleErrors.join('\n')}`)
if (failed.length || consoleErrors.length) process.exit(1)
console.log('No console errors.')
