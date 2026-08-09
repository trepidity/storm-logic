/**
 * Render smoke test. The container can't reach api.open-meteo.com, so this
 * intercepts /api/forecast with a fixture in Open-Meteo's exact response shape
 * and asserts the UI renders, expands, and reports zero console errors.
 *
 * Run: npx playwright ... (dev-only; not part of the Netlify build)
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
const PORT = 4173

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
}

// ---- fixture -------------------------------------------------------------

const START = '2026-08-09'
const CODES = [96, 0, 2, 63, 3, 73, 1, 80, 99, 45] // includes both hail codes
const dates = Array.from({ length: 10 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 9 + i))
  return d.toISOString().slice(0, 10)
})

const hourlyTime = []
const hourlyCloud = []
for (const date of dates) {
  for (let h = 0; h < 24; h += 1) {
    hourlyTime.push(`${date}T${String(h).padStart(2, '0')}:00`)
    hourlyCloud.push((h * 7 + date.charCodeAt(9) * 3) % 101)
  }
}

const fixture = {
  latitude: 41.88,
  longitude: -87.63,
  timezone: 'America/Chicago',
  timezone_abbreviation: 'CDT',
  elevation: 180,
  current: {
    time: `${START}T14:30`,
    temperature_2m: 78.4,
    relative_humidity_2m: 62,
    apparent_temperature: 81.2,
    is_day: 1,
    precipitation: 0.02,
    rain: 0.02,
    showers: 0,
    snowfall: 0,
    weather_code: 96,
    cloud_cover: 74,
    pressure_msl: 1009.4,
    wind_speed_10m: 12.6,
    wind_direction_10m: 215,
    wind_gusts_10m: 28.9,
  },
  daily: {
    time: dates,
    weather_code: CODES,
    temperature_2m_max: [84, 88, 81, 76, 79, 34, 71, 74, 83, 68],
    temperature_2m_min: [66, 69, 63, 59, 61, 22, 55, 58, 64, 52],
    apparent_temperature_max: [88, 92, 84, 78, 82, 28, 73, 77, 87, 69],
    apparent_temperature_min: [64, 68, 61, 57, 60, 14, 53, 56, 63, 50],
    sunrise: dates.map((d) => `${d}T05:52`),
    sunset: dates.map((d) => `${d}T20:03`),
    daylight_duration: dates.map(() => 51060),
    sunshine_duration: dates.map((_, i) => 51060 * (0.3 + (i % 5) * 0.15)),
    uv_index_max: [8.4, 9.1, 6.2, 4.8, 5.5, 1.9, 6.7, 5.1, 8.8, 3.2],
    precipitation_sum: [0.32, 0, 0.04, 0.91, 0, 0.55, 0, 0.24, 0.78, 0],
    rain_sum: [0.32, 0, 0.04, 0.91, 0, 0.05, 0, 0.24, 0.78, 0],
    showers_sum: [0.08, 0, 0, 0.12, 0, 0, 0, 0.06, 0.15, 0],
    snowfall_sum: [0, 0, 0, 0, 0, 3.4, 0, 0, 0, 0],
    precipitation_hours: [4, 0, 1, 9, 0, 7, 0, 3, 6, 0],
    precipitation_probability_max: [70, 5, 20, 90, 10, 85, 5, 45, 80, 15],
    wind_speed_10m_max: [16, 9, 11, 22, 8, 27, 10, 14, 19, 7],
    wind_gusts_10m_max: [34, 18, 21, 41, 15, 52, 19, 28, 44, 13],
    wind_direction_10m_dominant: [215, 180, 90, 270, 45, 315, 135, 200, 250, 20],
  },
  hourly: { time: hourlyTime, cloud_cover: hourlyCloud },
}

// ---- static server -------------------------------------------------------

const server = createServer(async (req, res) => {
  const path = normalize(req.url.split('?')[0])
  const file = join(ROOT, path === '/' ? 'index.html' : path)
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(await readFile(join(ROOT, 'index.html')))
  }
})

await new Promise((resolve) => server.listen(PORT, resolve))

// ---- run -----------------------------------------------------------------

// The container ships a pinned Chromium that may not match the npm package's
// expected build number, so point at it explicitly instead of downloading.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})
const failures = []

for (const [name, viewport] of [
  ['desktop', { width: 1180, height: 1400 }],
  ['mobile', { width: 400, height: 1180 }],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

  await page.route('**/api/forecast*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }),
  )

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.current__temp', { timeout: 10000 })

  const report = await page.evaluate(() => ({
    temp: document.querySelector('.current__temp')?.textContent?.trim(),
    condition: document.querySelector('.current__condition')?.textContent,
    badges: [...document.querySelectorAll('.current .badge')].map((b) => b.textContent.trim()),
    dayCount: document.querySelectorAll('.forecast .day').length,
    cloudNow: document.querySelector('.cloud__percent')?.textContent,
    wind: document.querySelector('.wind__speed')?.textContent,
    windFrom: document.querySelector('.wind__from')?.textContent,
    sunTimes: [...document.querySelectorAll('.sun__value')].map((n) => n.textContent),
    sunMarker: Boolean(document.querySelector('.sun__marker')),
    hailDays: [...document.querySelectorAll('.forecast .day')]
      .map((d, i) => (d.textContent.includes('Hail risk') ? i : null))
      .filter((v) => v !== null),
  }))

  // Expand the snow day (index 5) to confirm detail panels populate.
  await page.locator('.forecast .day').nth(5).locator('.day__summary').click()
  await page.waitForTimeout(250)
  const snowDetail = await page.locator('.forecast .day').nth(5).locator('.day__detail').innerText()

  await page.screenshot({ path: `/home/claude/shots/${name}.png`, fullPage: true })

  console.log(`\n=== ${name} ===`)
  console.log(JSON.stringify(report, null, 1))
  console.log('snow day detail:\n' + snowDetail.replace(/\n+/g, ' | '))
  if (consoleErrors.length) failures.push(`${name}: ${consoleErrors.join('; ')}`)
  await page.close()
}

await browser.close()
server.close()

if (failures.length) {
  console.error('\nCONSOLE ERRORS:\n' + failures.join('\n'))
  process.exit(1)
}
console.log('\nNo console errors.')
