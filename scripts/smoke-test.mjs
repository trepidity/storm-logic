/**
 * Render smoke test. The container can't reach api.open-meteo.com, so this
 * intercepts /api/forecast with a fixture in Open-Meteo's exact response shape
 * and asserts the UI renders, expands, and reports zero console errors.
 *
 * Run: npm run build && npm run test:smoke
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
// Let the OS choose a free port so parallel/local test runs never collide.
const PORT = 0
const SCREENSHOT_DIR = await mkdtemp(join(tmpdir(), 'stormlogic-smoke-'))

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
}

// ---- fixture -------------------------------------------------------------

const START = '2026-08-09'
// past_days=1 prepends yesterday to daily + hourly (mirrors the live API).
const PAST = '2026-08-08'
const CODES = [0, 96, 0, 2, 63, 3, 73, 1, 80, 99, 45, 2] // past + 11 forward; hail in series
const dates = Array.from({ length: 11 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 9 + i))
  return d.toISOString().slice(0, 10)
})
const allDates = [PAST, ...dates]

const hourlyTime = []
const hourlyCloud = []
const hourlyTemp = []
const hourlyChance = []
const hourlyCode = []
const hourlyPrecip = []
// Temperature: forecast day i, hour h → 1000 + i*100 + h (today 14:00 = 1014°).
// Precip lookback: at current 14:30, last 24h ends at 14:00 and is 24×0.01 = 0.24 in
// (PAST 15:00–23:00 and START 00:00–14:00).
for (let di = 0; di < allDates.length; di += 1) {
  const date = allDates[di]
  const forecastIndex = di - 1 // -1 for past day
  for (let h = 0; h < 24; h += 1) {
    hourlyTime.push(`${date}T${String(h).padStart(2, '0')}:00`)
    hourlyCloud.push((h * 7 + date.charCodeAt(9) * 3) % 101)
    hourlyTemp.push(forecastIndex < 0 ? 900 + h : 1000 + forecastIndex * 100 + h)
    hourlyChance.push((h * 7) % 60)
    hourlyCode.push(2)
    const inLookback =
      (date === PAST && h >= 15) || (date === START && h <= 14)
    hourlyPrecip.push(inLookback ? 0.01 : 0)
  }
}

const fill12 = (values11, pastValue) => [pastValue, ...values11]

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
    time: allDates,
    weather_code: CODES,
    temperature_2m_max: fill12([84, 88, 81, 76, 79, 34, 71, 74, 83, 68, 77], 80),
    temperature_2m_min: fill12([66, 69, 63, 59, 61, 22, 55, 58, 64, 52, 60], 62),
    apparent_temperature_max: fill12([88, 92, 84, 78, 82, 28, 73, 77, 87, 69, 80], 82),
    apparent_temperature_min: fill12([64, 68, 61, 57, 60, 14, 53, 56, 63, 50, 58], 60),
    sunrise: allDates.map((d) => `${d}T05:52`),
    sunset: allDates.map((d) => `${d}T20:03`),
    daylight_duration: allDates.map(() => 51060),
    sunshine_duration: allDates.map((_, i) => 51060 * (0.3 + (i % 5) * 0.15)),
    uv_index_max: fill12([8.4, 9.1, 6.2, 4.8, 5.5, 1.9, 6.7, 5.1, 8.8, 3.2, 6.0], 7),
    precipitation_sum: fill12([0.32, 0, 0.04, 0.91, 0, 0.55, 0, 0.24, 0.78, 0, 0], 0.1),
    rain_sum: fill12([0.32, 0, 0.04, 0.91, 0, 0.05, 0, 0.24, 0.78, 0, 0], 0.1),
    showers_sum: fill12([0.08, 0, 0, 0.12, 0, 0, 0, 0.06, 0.15, 0, 0], 0),
    snowfall_sum: fill12([0, 0, 0, 0, 0, 3.4, 0, 0, 0, 0, 0], 0),
    precipitation_hours: fill12([4, 0, 1, 9, 0, 7, 0, 3, 6, 0, 0], 2),
    precipitation_probability_max: fill12([70, 5, 20, 90, 10, 85, 5, 45, 80, 15, 12], 40),
    wind_speed_10m_max: fill12([16, 9, 11, 22, 8, 27, 10, 14, 19, 7, 12], 12),
    wind_gusts_10m_max: fill12([34, 18, 21, 41, 15, 52, 19, 28, 44, 13, 22], 20),
    wind_direction_10m_dominant: fill12([215, 180, 90, 270, 45, 315, 135, 200, 250, 20, 180], 200),
  },
  hourly: {
    time: hourlyTime,
    cloud_cover: hourlyCloud,
    temperature_2m: hourlyTemp,
    precipitation_probability: hourlyChance,
    precipitation: hourlyPrecip,
    weather_code: hourlyCode,
  },
}

const alertsFixture = {
  type: 'FeatureCollection',
  features: [
    {
      id: 'https://api.weather.gov/alerts/fixture-warning',
      properties: {
        '@id': 'https://api.weather.gov/alerts/fixture-warning',
        event: 'Severe Thunderstorm Warning',
        headline: 'Severe Thunderstorm Warning issued for Cook County',
        severity: 'Severe',
        urgency: 'Immediate',
        certainty: 'Observed',
        effective: '2030-08-09T14:00:00-05:00',
        expires: '2030-08-09T15:00:00-05:00',
        areaDesc: 'Cook County',
        description: 'Damaging wind and large hail are possible.',
        instruction: 'Move indoors and stay away from windows.',
      },
    },
    {
      id: 'https://api.weather.gov/alerts/fixture-cancelled',
      properties: {
        event: 'Severe Thunderstorm Warning',
        headline: 'Cancelled warning must not render',
        messageType: 'Cancel',
        expires: '2030-08-09T15:00:00-05:00',
      },
    },
    {
      id: 'https://api.weather.gov/alerts/fixture-expired',
      properties: {
        event: 'Flood Advisory',
        headline: 'Expired advisory must not render',
        expires: '2020-08-09T15:00:00-05:00',
      },
    },
  ],
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
const serverPort = server.address().port

// ---- run -----------------------------------------------------------------

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
})
const failures = []

for (const [name, viewport] of [
  ['desktop', { width: 1180, height: 1400 }],
  ['mobile', { width: 400, height: 1180 }],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  const consoleErrors = []
  let alertMode = 'active'
  let alertRequests = 0
  page.on('console', (m) => {
    // The coverage fixture intentionally returns 422. Chromium reports that
    // expected HTTP response as a console error even though the UI asserts its
    // dedicated recovery state below; retain every other console error.
    if (m.type() === 'error' && !(alertMode === 'coverage' && m.text().includes('422'))) {
      consoleErrors.push(m.text())
    }
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

  await page.route('**/api/forecast*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }),
  )
  await page.route('**/api/alerts*', (route) => {
    alertRequests += 1
    if (alertMode === 'none') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
      })
    }
    if (alertMode === 'coverage') {
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'NWS alerts are unavailable for this location.' }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(alertsFixture) })
  })

  await page.goto(`http://localhost:${serverPort}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.current__temp', { timeout: 10000 })
  if (alertRequests !== 0) failures.push(`${name}: Alerts fetched before its tab was opened`)

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
    firstDayLabel: document.querySelector('.forecast .day__name strong')?.textContent,
    hasTodayRow: [...document.querySelectorAll('.forecast .day__name strong')].some((n) => n.textContent === 'Today'),
    locationDisclosure: document.querySelector('#location-disclosure')?.textContent?.trim(),
    geoLabel: document.querySelector('.search__geo')?.getAttribute('aria-label'),
    geoDescribedBy: document.querySelector('.search__geo')?.getAttribute('aria-describedby'),
    geoTextVisible: Boolean(document.querySelector('.search__geo-text')),
    precipLast24h: [...document.querySelectorAll('.stat')]
      .find((s) => s.querySelector('dt')?.textContent?.includes('Last 24'))
      ?.querySelector('dd')
      ?.textContent?.trim(),
    hailDays: [...document.querySelectorAll('.forecast .day')]
      .map((d, i) => (d.textContent.includes('Hail risk') ? i : null))
      .filter((v) => v !== null),
  }))

  // Guard against stylesheet loss. A CSS section can be deleted without any
  // behavioural test noticing — every assertion here passed once while the
  // tabs, radar and favourite-toggle rules were gone from the build.
  const styling = await page.evaluate(() => {
    const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor
    const title = document.querySelector('.current__title')
    const h1 = document.querySelector('.current__place').getBoundingClientRect()
    const star = document.querySelector('.star').getBoundingClientRect()
    const geo = document.querySelector('.search__geo')
    const disclosure = document.querySelector('#location-disclosure')
    const geoBox = geo?.getBoundingClientRect()
    return {
      tabsHaveSurface: bg('.tabs') !== 'rgba(0, 0, 0, 0)',
      activeTabHighlighted: bg('.tabs button.is-active') !== 'rgba(0, 0, 0, 0)',
      titleIsFlexRow: getComputedStyle(title).display === 'flex',
      // The star sits beside the location name, not wrapped underneath it.
      starOnSameLine: Math.abs(star.top - h1.top) < h1.height,
      cardHasBackground: bg('.current') !== 'rgba(0, 0, 0, 0)',
      // Icon-only: compact square control, not a wide labeled pill.
      geoIsCompact: Boolean(geoBox) && geoBox.width <= 56,
      // Steady state keeps privacy collapsed so the header stays quiet.
      locationDisclosureCollapsed:
        Boolean(disclosure) && disclosure.getBoundingClientRect().height < 2,
    }
  })
  for (const [key, ok] of Object.entries(styling)) {
    if (!ok) failures.push(`${name}: styling check failed — ${key}`)
  }

  // Focus the geo control — disclosure must expand and stay linked for a11y.
  // max-height is transitioned, so wait for the open state rather than reading mid-animation.
  await page.locator('.search__geo').focus()
  await page.waitForFunction(
    () => {
      const d = document.querySelector('#location-disclosure')
      return d && d.getBoundingClientRect().height >= 8
    },
    { timeout: 2000 },
  ).catch(() => {
    /* assertion below records the failure */
  })
  const disclosureOnFocus = await page.evaluate(() => {
    const disclosure = document.querySelector('#location-disclosure')
    const geo = document.querySelector('.search__geo')
    const box = disclosure?.getBoundingClientRect()
    return {
      height: box?.height ?? 0,
      text: disclosure?.textContent?.trim() ?? '',
      geoFocused: document.activeElement === geo,
    }
  })
  if (!disclosureOnFocus.geoFocused) {
    failures.push(`${name}: geo control did not retain focus for disclosure reveal`)
  }
  if (disclosureOnFocus.height < 8) {
    failures.push(
      `${name}: location disclosure should expand on geo focus (height ${disclosureOnFocus.height})`,
    )
  }
  if (!disclosureOnFocus.text.includes('BigDataCloud')) {
    failures.push(`${name}: focused location disclosure must name BigDataCloud`)
  }
  await page.locator('.search__geo').evaluate((n) => n.blur())

  // The list starts at tomorrow; today lives in the card above it.
  if (report.hasTodayRow) failures.push(`${name}: forecast list still contains a Today row`)
  if (report.firstDayLabel !== 'Tomorrow') {
    failures.push(`${name}: forecast list starts at "${report.firstDayLabel}", expected Tomorrow`)
  }
  if (report.dayCount !== 10) failures.push(`${name}: expected 10 forecast rows, got ${report.dayCount}`)
  if (!report.locationDisclosure?.includes('BigDataCloud')) {
    failures.push(`${name}: location disclosure is missing or does not name BigDataCloud`)
  }
  if (report.geoLabel !== 'Use my location') {
    failures.push(`${name}: geo control needs accessible name "Use my location", got ${report.geoLabel}`)
  }
  if (report.geoDescribedBy !== 'location-disclosure') {
    failures.push(`${name}: geo control must be described by location-disclosure`)
  }
  if (report.geoTextVisible) {
    failures.push(`${name}: geo control should be icon-only (no visible "My location" text)`)
  }
  // 24 lookback hours × 0.01 in — proves past_days precip is summed, not today's daily total.
  if (report.precipLast24h !== '0.24 in') {
    failures.push(
      `${name}: last 24h precip should be 0.24 in from fixture lookback, got ${report.precipLast24h}`,
    )
  }
  console.log('styling:', JSON.stringify(styling))

  // Tomorrow is open by default (openIndex 0). Its hourly strip must use that
  // local calendar day (00–23), not the card's rolling next-24 from 14:30 today.
  // Fixture: day i hour h → 1000 + i*100 + h  → tomorrow midnight = 1100°, today 14:00 = 1014°.
  const hourlyProbe = await page.evaluate(() => {
    const cardTemps = [...document.querySelectorAll('.current .hour__temp')].map((n) =>
      n.textContent.trim(),
    )
    const dayTemps = [...document.querySelectorAll('.day--open .hour__temp')].map((n) =>
      n.textContent.trim(),
    )
    const dayTimes = [...document.querySelectorAll('.day--open .hour__time')].map((n) =>
      n.textContent.trim(),
    )
    return {
      cardCount: cardTemps.length,
      dayCount: dayTemps.length,
      cardFirst: cardTemps[0] ?? null,
      dayFirst: dayTemps[0] ?? null,
      dayLast: dayTemps[dayTemps.length - 1] ?? null,
      dayHasNow: [...document.querySelectorAll('.day--open .hour--now')].length > 0,
      cardHasNow: [...document.querySelectorAll('.current .hour--now')].length > 0,
      dayFirstTime: dayTimes[0] ?? null,
      dayLastTime: dayTimes[dayTimes.length - 1] ?? null,
      // Closed rows must not mount their hourly strips (only the open day + card).
      mountedDayStrips: document.querySelectorAll('.day .day__hourly').length,
    }
  })
  if (hourlyProbe.cardCount !== 24) {
    failures.push(`${name}: current card expected 24 next hours, got ${hourlyProbe.cardCount}`)
  }
  if (hourlyProbe.dayCount !== 24) {
    failures.push(`${name}: expanded day expected 24 local hours, got ${hourlyProbe.dayCount}`)
  }
  if (hourlyProbe.cardFirst !== '1014°') {
    failures.push(
      `${name}: current next-24 should start at today's 14:00 (1014°), got ${hourlyProbe.cardFirst}`,
    )
  }
  if (hourlyProbe.dayFirst !== '1100°') {
    failures.push(
      `${name}: tomorrow's strip should start at local midnight (1100°), got ${hourlyProbe.dayFirst}`,
    )
  }
  if (hourlyProbe.dayLast !== '1123°') {
    failures.push(
      `${name}: tomorrow's strip should end at 23:00 (1123°), got ${hourlyProbe.dayLast}`,
    )
  }
  if (hourlyProbe.dayFirstTime !== '12am') {
    failures.push(
      `${name}: tomorrow's strip should start at 12am (00:00), got ${hourlyProbe.dayFirstTime}`,
    )
  }
  if (hourlyProbe.dayLastTime !== '11pm') {
    failures.push(
      `${name}: tomorrow's strip should end at 11pm (23:00), got ${hourlyProbe.dayLastTime}`,
    )
  }
  if (hourlyProbe.dayHasNow) {
    failures.push(`${name}: expanded future day must not mark a column as Now`)
  }
  if (!hourlyProbe.cardHasNow) {
    failures.push(`${name}: current card next-24 should mark the first column as Now`)
  }
  if (hourlyProbe.cardFirst === hourlyProbe.dayFirst) {
    failures.push(`${name}: day strip temperatures must differ from the rolling next-24 window`)
  }
  if (hourlyProbe.mountedDayStrips !== 1) {
    failures.push(
      `${name}: only the expanded day should mount an hourly strip, got ${hourlyProbe.mountedDayStrips}`,
    )
  }
  console.log('hourly probe:', JSON.stringify(hourlyProbe))

  // Expand the snow day. It was index 5 of the full series; the list now
  // starts at tomorrow, so it sits one row earlier.
  await page.locator('.forecast .day').nth(4).locator('.day__summary').click()
  await page.waitForTimeout(250)
  const snowDetail = await page.locator('.forecast .day').nth(4).locator('.day__detail').innerText()

  // Snow day is full-series index 5 → temps 1000+5*100+h = 1500+h
  const snowHourly = await page.evaluate(() => {
    const temps = [...document.querySelectorAll('.day--open .hour__temp')].map((n) =>
      n.textContent.trim(),
    )
    return { count: temps.length, first: temps[0] ?? null, last: temps[temps.length - 1] ?? null }
  })
  if (snowHourly.first !== '1500°' || snowHourly.last !== '1523°') {
    failures.push(
      `${name}: snow-day strip should be day-5 hours (1500°–1523°), got ${snowHourly.first}–${snowHourly.last}`,
    )
  }

  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: true })

  console.log(`\n=== ${name} ===`)
  console.log(JSON.stringify(report, null, 1))
  console.log('snow day detail:\n' + snowDetail.replace(/\n+/g, ' | '))
  console.log('snow hourly:', JSON.stringify(snowHourly))

  // Alerts are a third, lazy top-level view. The forecast does not fetch or
  // render them; after opening, cover the active, none, and out-of-coverage
  // states against real NWS GeoJSON-shaped fixtures.
  await page.locator('.tabs button', { hasText: 'Alerts' }).click()
  await page.waitForSelector('.alerts .alert', { timeout: 10000 })
  const activeAlert = await page.evaluate(() => ({
    forecastVisible: Boolean(document.querySelector('.forecast')),
    count: document.querySelectorAll('.alert').length,
    headline: document.querySelector('.alert__head h2')?.textContent?.trim(),
    effective: document.querySelector('.alert__times dd')?.textContent?.trim(),
    hasDetails: Boolean(document.querySelector('.alert__details summary')),
  }))
  if (activeAlert.forecastVisible) failures.push(`${name}: Forecast content remained mounted in Alerts`)
  if (activeAlert.count !== 1) failures.push(`${name}: expired or cancelled NWS alerts were rendered`)
  if (activeAlert.headline !== 'Severe Thunderstorm Warning issued for Cook County') {
    failures.push(`${name}: active NWS alert headline was not rendered`)
  }
  if (activeAlert.effective !== 'Aug 9, 2:00pm') {
    failures.push(`${name}: active NWS alert effective time was not rendered`)
  }
  if (!activeAlert.hasDetails) failures.push(`${name}: active NWS alert is missing expandable details`)

  await page.locator('.tabs button', { hasText: 'Forecast' }).click()
  alertMode = 'none'
  await page.locator('.tabs button', { hasText: 'Alerts' }).click()
  await page.waitForSelector('.alerts__empty', { timeout: 10000 })
  if (!(await page.locator('.alerts__empty').innerText()).includes('No active NWS')) {
    failures.push(`${name}: no-alert NWS state was not rendered`)
  }

  await page.locator('.tabs button', { hasText: 'Forecast' }).click()
  alertMode = 'coverage'
  await page.locator('.tabs button', { hasText: 'Alerts' }).click()
  await page.waitForSelector('.alerts__unavailable', { timeout: 10000 })
  if (!(await page.locator('.alerts__unavailable').innerText()).includes('U.S. coverage')) {
    failures.push(`${name}: out-of-coverage NWS state was not rendered`)
  }
  if (alertRequests !== 3) {
    failures.push(`${name}: Alerts should fetch once per opened surface state, got ${alertRequests}`)
  }
  console.log('alerts:', JSON.stringify({ activeAlert, requests: alertRequests }))

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
