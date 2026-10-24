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
const hourlyDewPoint = []
const hourlyApparent = []
const hourlyHumidity = []
const hourlyWind = []
const hourlyGust = []
const hourlyUv = []
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
    // A complete current event: 0.24 in has fallen through 14:00, 0.04 in is
    // forecast in the next two hours, then 17:00 is the first dry hour.
    const eventStillForecast = date === START && (h === 15 || h === 16)
    hourlyPrecip.push(inLookback ? 0.01 : eventStillForecast ? 0.02 : 0)
    hourlyDewPoint.push(h >= 16 ? 72 : 54)
    hourlyApparent.push(1000 + Math.max(forecastIndex, 0) * 100 + h)
    hourlyHumidity.push(55)
    hourlyWind.push(10)
    hourlyGust.push(18)
    hourlyUv.push(h >= 11 && h <= 15 ? 6 : 1)
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
    dew_point_2m: hourlyDewPoint,
    apparent_temperature: hourlyApparent,
    relative_humidity_2m: hourlyHumidity,
    wind_speed_10m: hourlyWind,
    wind_gusts_10m: hourlyGust,
    uv_index: hourlyUv,
  },
}

const airFixture = {
  latitude: 41.88,
  longitude: -87.63,
  timezone: 'America/Chicago',
  current: {
    time: '2026-08-09T14:00',
    interval: 3600,
    us_aqi: 42,
  },
  hourly: {
    time: hourlyTime,
    us_aqi: hourlyTime.map(() => 42),
  },
}

// NCEP GEFS returns the ensemble mean plus 30 individual members. The middle
// 80% range below is deliberately independent of the implementation: member
// highs span 80.2°–86° and 16 of 30 members carry 0.01 in/h tomorrow.
const confidenceTimes = Array.from(
  { length: 24 },
  (_, hour) => `2026-08-10T${String(hour).padStart(2, '0')}:00`,
)
const confidenceFixture = {
  latitude: 41.88,
  longitude: -87.63,
  timezone: 'America/Chicago',
  hourly: {
    time: confidenceTimes,
    temperature_2m: confidenceTimes.map(() => 83),
    precipitation: confidenceTimes.map(() => 0.01),
    ...Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => {
        const member = String(index + 1).padStart(2, '0')
        return [
          `temperature_2m_member${member}`,
          confidenceTimes.map(() => 80 + (index + 1) * 0.2),
        ]
      }),
    ),
    ...Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => {
        const member = String(index + 1).padStart(2, '0')
        return [
          `precipitation_member${member}`,
          confidenceTimes.map(() => (index < 14 ? 0 : 0.01)),
        ]
      }),
    ),
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

await new Promise((resolve, reject) => {
  const onError = (error) => reject(error)
  server.once('error', onError)
  server.listen(PORT, () => {
    server.off('error', onError)
    resolve()
  })
})
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
  let airRequests = 0
  let confidenceRequests = 0
  page.on('console', (m) => {
    // The coverage fixture intentionally returns 422. Chromium reports that
    // expected HTTP response as a console error even though the UI asserts its
    // dedicated recovery state below; retain every other console error.
    if (
      m.type() === 'error' &&
      !(alertMode === 'coverage' && m.text().includes('422'))
    ) {
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
  await page.route('**/api/air*', (route) => {
    airRequests += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(airFixture) })
  })
  await page.route('**/api/confidence*', (route) => {
    confidenceRequests += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(confidenceFixture) })
  })

  await page.goto(`http://localhost:${serverPort}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.current__temp', { timeout: 10000 })
  if (alertRequests !== 0) failures.push(`${name}: Alerts fetched before its tab was opened`)
  // US AQI is now a compact current-card stat, so it loads with Forecast.
  await page.waitForSelector('.stat--aqi .stat__value', { timeout: 10000 })

  const tabLabels = await page.locator('.tabs button').allTextContents()
  if (tabLabels.includes('Air')) failures.push(`${name}: Air should be a current-card widget, not a tab`)

  const report = await page.evaluate(() => ({
    temp: document.querySelector('.current__temp')?.textContent?.trim(),
    condition: document.querySelector('.current__condition')?.textContent,
    badges: [...document.querySelectorAll('.current .badge')].map((b) => b.textContent.trim()),
    dayCount: document.querySelectorAll('.forecast .day').length,
    openDayCount: document.querySelectorAll('.forecast .day--open').length,
    dayDetailLabels: [...document.querySelectorAll('.day__detail-toggle')].map((n) => n.textContent?.replace('⌄', '').trim()),
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
    precipTiming: document.querySelector('.current__precip-timing')?.textContent?.trim(),
    precipEvent: document.querySelector('.current__precip-event')?.textContent?.trim(),
    aqi: {
      label: document.querySelector('.stat--aqi dt')?.textContent?.trim(),
      value: document.querySelector('.stat--aqi .stat__value')?.textContent?.trim(),
      category: document.querySelector('.stat--aqi .stat__note')?.textContent?.trim(),
      count: document.querySelectorAll('.stat').length,
    },
    currentHailBadge: document.querySelector('.current .badge--hail')?.textContent?.trim() ?? null,
    hailDisclosure: [...document.querySelectorAll('.footer__note')]
      .map((note) => note.textContent?.trim())
      .find((note) => note?.includes('WMO codes 96 and 99')) ?? null,
    hailDays: [...document.querySelectorAll('.forecast .day')]
      .map((d, i) => (d.textContent.includes('Hail risk') ? i : null))
      .filter((v) => v !== null),
    runWindowPresent: Boolean(document.querySelector('.current .run-windows')),
  }))

  // Location controls are progressively disclosed on compact screens.
  const locationToggle = page.getByRole('button', { name: 'Change location', exact: true })
  if (await locationToggle.isVisible()) await locationToggle.click()

  // Guard against stylesheet loss. A CSS section can be deleted without any
  // behavioural test noticing — every assertion here passed once while the
  // tabs, radar and favourite-toggle rules were gone from the build.
  const styling = await page.evaluate(() => {
    const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor
    const head = document.querySelector('.current__head').getBoundingClientRect()
    const h1 = document.querySelector('.current__place').getBoundingClientRect()
    const save = document.querySelector('.save-toggle')
    const saveBox = save.getBoundingClientRect()
    const geo = document.querySelector('.search__geo')
    const disclosure = document.querySelector('#location-disclosure')
    const geoBox = geo?.getBoundingClientRect()
    return {
      tabsHaveSurface: bg('.tabs') !== 'rgba(0, 0, 0, 0)',
      activeTabHighlighted: bg('.tabs button.is-active') !== 'rgba(0, 0, 0, 0)',
      // The save toggle is a labeled pill in the card header's top-right
      // corner, beside the title; the weather glyph lives with the condition.
      saveToggleTopRight:
        Boolean(save.closest('.current__head')) &&
        saveBox.left >= h1.right - 1 &&
        head.right - saveBox.right <= 2 &&
        saveBox.top - head.top <= 8,
      weatherIconWithCondition: Boolean(document.querySelector('.current__condition .current__icon')) &&
        !document.querySelector('.current__head .current__icon'),
      saveToggleLabeled: /^Saved?$/.test(save.textContent.trim()) && save.hasAttribute('aria-pressed'),
      saveToggleTapTarget: saveBox.height >= 44 && saveBox.width >= 44,
      saveToggleHasSurface: bg('.save-toggle') !== 'rgba(0, 0, 0, 0)',
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
  const closeLocations = page.getByRole('button', { name: 'Close locations', exact: true })
  if (await closeLocations.isVisible()) await closeLocations.click()

  // Every forecast day is immediately reachable, with a named row-level action
  // rather than a second disclosure that hides both the remaining days and their details.
  if (report.hasTodayRow) failures.push(`${name}: forecast list still contains a Today row`)
  if (report.firstDayLabel !== 'Tomorrow') {
    failures.push(`${name}: forecast list starts at "${report.firstDayLabel}", expected Tomorrow`)
  }
  if (report.dayCount !== 10) failures.push(`${name}: expected 10 forecast rows, got ${report.dayCount}`)
  if (report.dayDetailLabels.length !== 10 || report.dayDetailLabels.some((label) => label !== 'Details')) {
    failures.push(`${name}: every forecast day needs a visible Details action, got ${JSON.stringify(report.dayDetailLabels)}`)
  }
  if (report.openDayCount !== 0) {
    failures.push(`${name}: forecast should not force an open day, got ${report.openDayCount}`)
  }
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
  if (report.aqi.label !== 'US AQI' || report.aqi.value !== '42' || report.aqi.category !== 'Good') {
    failures.push(`${name}: US AQI current-card widget was not rendered, got ${JSON.stringify(report.aqi)}`)
  }
  if (report.aqi.count !== 6 || airRequests !== 1) {
    failures.push(
      `${name}: only the compact US AQI stat should request air data, got ${report.aqi.count} stats / ${airRequests} requests`,
    )
  }
  if (report.runWindowPresent) {
    failures.push(`${name}: Run Window must be removed; dew point belongs in the next-24-hours strip`)
  }
  // L0: code 96 is the current fixture. It can be a risk signal, never a
  // measured-hail observation or a tracking claim.
  if (report.currentHailBadge !== '🧊Hail risk') {
    failures.push(`${name}: current WMO 96 hail signal must remain labelled as a risk, got ${report.currentHailBadge}`)
  }
  if (report.hailDisclosure !== 'Hail is reported only via WMO codes 96 and 99 (thunderstorm with hail) — Open-Meteo has no measured hail variable.') {
    failures.push(`${name}: WMO hail disclosure must state that Open-Meteo has no measured hail variable, got ${report.hailDisclosure}`)
  }
  // 24 lookback hours × 0.01 in — proves past_days precip is summed, not today's daily total.
  if (report.precipLast24h !== '0.24 in') {
    failures.push(
      `${name}: last 24h precip should be 0.24 in from fixture lookback, got ${report.precipLast24h}`,
    )
  }
  if (!report.precipTiming?.startsWith('Rain ending ~')) {
    failures.push(
      `${name}: current-card precip timing must render the fixture's ongoing event, got ${report.precipTiming}`,
    )
  }
  if (
    !report.precipEvent?.includes('0.24 in so far') ||
    !report.precipEvent.includes('~0.04 in more expected') ||
    !report.precipEvent.includes('~0.28 in event total') ||
    !report.precipEvent.includes('Drying ~')
  ) {
    failures.push(
      `${name}: current-card event story must show complete so-far, remaining, total, and dry-time evidence, got ${JSON.stringify(report.precipEvent)}`,
    )
  }

  await page.locator('.forecast .day').first().locator('.day__summary').click()
  await page.waitForSelector('.day--open .day__detail:not([hidden])', { timeout: 2000 })
  const dayExplanation = await page.locator('.day--open .day__explanation').textContent()
  const openDetailLabel = await page.locator('.day--open .day__detail-toggle').textContent()
  // The selected-day explanation is a bounded, numbers-only reading of the
  // already-rendered tomorrow data. This literal fixture assertion catches a
  // missing explanation, a stale day selection, or an explanation that ignores
  // the normalised day/hour values.
  if (dayExplanation?.trim() !== 'Partly cloudy, high near 88°.') {
    failures.push(
      `${name}: selected-day explanation should describe fixture tomorrow, got ${dayExplanation}`,
    )
  }
  if (openDetailLabel?.replace('⌄', '').trim() !== 'Hide details') {
    failures.push(`${name}: opened day should offer Hide details, got ${openDetailLabel}`)
  }
  // Outdoor planning is contextual to the selected day, not a separate tab.
  // The fixture's Tomorrow is dry from its 5am sunrise through 8pm, with the
  // next hour at 9pm ending that 16-hour daylight window.
  await page.waitForSelector('.outdoor-plan', { timeout: 10000 })
  const outdoorPlan = await page.evaluate(() => ({
    title: document.querySelector('.outdoor-plan__title')?.textContent?.trim(),
    window: document.querySelector('.outdoor-plan__window')?.textContent?.trim(),
    gusts: document.querySelector('.outdoor-plan__gusts')?.textContent?.trim(),
    uv: document.querySelector('.outdoor-plan__uv')?.textContent?.trim(),
    storm: document.querySelector('.outdoor-plan__storm')?.textContent?.trim(),
    count: document.querySelectorAll('.outdoor-plan').length,
  }))
  if (outdoorPlan.title !== 'Outdoor plan') {
    failures.push(`${name}: outdoor helper title is missing, got ${outdoorPlan.title}`)
  }
  if (outdoorPlan.window !== 'Best dry daylight: 5am–9pm · 16 h') {
    failures.push(`${name}: outdoor dry daylight window was not rendered, got ${outdoorPlan.window}`)
  }
  if (outdoorPlan.gusts !== 'Gusts up to 18 mph' || outdoorPlan.uv !== 'UV index 9.1') {
    failures.push(`${name}: outdoor gust/UV evidence was not rendered, got ${JSON.stringify(outdoorPlan)}`)
  }
  if (outdoorPlan.storm !== 'No thunder signal' || outdoorPlan.count !== 1) {
    failures.push(`${name}: outdoor thunder evidence or contextual mount is wrong, got ${JSON.stringify(outdoorPlan)}`)
  }
  // Forecast confidence belongs only to Tomorrow's already-expanded detail.
  // This direct consumer assertion catches a missing lazy fetch, a stale date,
  // or a range assembled from the provider mean instead of its members.
  await page.waitForSelector('.confidence--ready', { timeout: 10000 })
  const confidence = await page.evaluate(() => ({
    title: document.querySelector('.confidence__title')?.textContent?.trim(),
    temperature: document.querySelector('.confidence__temperature')?.textContent?.trim(),
    precipitation: document.querySelector('.confidence__precipitation')?.textContent?.trim(),
    memberNote: document.querySelector('.confidence__note')?.textContent?.trim(),
    blocks: document.querySelectorAll('.confidence').length,
  }))
  if (confidence.title !== 'Ensemble spread') {
    failures.push(`${name}: missing confidence title, got ${confidence.title}`)
  }
  if (confidence.temperature !== 'High 81°–85°') {
    failures.push(`${name}: member-derived tomorrow high spread was not rendered, got ${confidence.temperature}`)
  }
  if (confidence.precipitation !== 'Rain 0.00–0.24 in') {
    failures.push(`${name}: member-derived tomorrow rain spread was not rendered, got ${confidence.precipitation}`)
  }
  if (confidence.memberNote !== 'Middle 80% of 30 NCEP GEFS members') {
    failures.push(`${name}: confidence provenance must remain explicit, got ${confidence.memberNote}`)
  }
  if (confidence.blocks !== 1 || confidenceRequests !== 1) {
    failures.push(
      `${name}: Tomorrow should mount and fetch exactly one confidence block, got ${confidence.blocks} blocks / ${confidenceRequests} requests`,
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
    const cardDewpoints = [...document.querySelectorAll('.current .hour__dewpoint')].map((n) =>
      n.textContent.trim(),
    )
    return {
      cardCount: cardTemps.length,
      dayCount: dayTemps.length,
      cardDewpointCount: cardDewpoints.length,
      cardFirstDewpoint: cardDewpoints[0] ?? null,
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
  if (hourlyProbe.cardDewpointCount !== 24 || hourlyProbe.cardFirstDewpoint !== 'Dew 54°') {
    failures.push(
      `${name}: next-24 must show a dew point for every hour alongside temperature, got ${hourlyProbe.cardDewpointCount} / ${hourlyProbe.cardFirstDewpoint}`,
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

// ---- saved-location pills on a phone ----------------------------------------
// The saved row must wrap (never scroll sideways), cap itself at two rows behind
// a "+N more" pill, and always keep the active location visible.
{
  const name = 'saved-pills-390'
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const consoleErrors = []
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  await page.route('**/api/forecast*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }),
  )
  await page.route('**/api/air*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(airFixture) }))
  await page.route('**/api/confidence*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(confidenceFixture) }))
  await page.route('**/api/alerts*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(alertsFixture) }))
  await page.route('https://api.open-meteo.com/v1/forecast?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ current: { time: Math.floor(Date.now() / 1000), temperature_2m: 21, precipitation: 0, rain: 0, showers: 0, snowfall: 0 } }),
    }),
  )
  const mk = (n, lat, lon) => ({ name: n, label: n, latitude: lat, longitude: lon, key: `${lat.toFixed(3)},${lon.toFixed(3)}` })
  const two = [mk('Oak Grove', 39.005, -94.1291), mk('Worland', 44.0169, -107.9554)]
  const many = [
    ...two,
    mk('Kansas City', 39.0997, -94.5786),
    mk('Colorado Springs', 38.8339, -104.8214),
    mk('Minneapolis', 44.9778, -93.265),
    mk('Albuquerque', 35.0844, -106.6504),
    mk('Chicago', 41.8781, -87.6298),
    mk('Sioux Falls', 43.5446, -96.7311),
  ]
  const seed = async (favorites, active) => {
    await page.goto(`http://localhost:${serverPort}/`)
    await page.evaluate(({ favorites, active }) => {
      localStorage.setItem('stormlogic:v1:favorites', JSON.stringify(favorites))
      localStorage.setItem('stormlogic:v1:lastPlace', JSON.stringify(active))
      localStorage.setItem('stormlogic:v1:hasOnboarded', 'true')
    }, { favorites, active })
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('.saved-weather > button', { timeout: 10000 })
  }
  const probe = () =>
    page.locator('.saved-weather').evaluate((el) => {
      const box = el.getBoundingClientRect()
      const buttons = [...el.querySelectorAll(':scope > button')]
      const pills = buttons.filter((b) => !b.classList.contains('saved-weather__more'))
      const more = el.querySelector(':scope > .saved-weather__more')
      return {
        overflow: el.scrollWidth > el.clientWidth + 1 || box.right > innerWidth + 0.5,
        pillsInside: buttons.every((b) => b.getBoundingClientRect().right <= box.right + 0.5 && b.getBoundingClientRect().left >= box.left - 0.5),
        rows: new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size,
        pills: pills.length,
        names: pills.map((p) => p.querySelector('.saved-weather__name')?.textContent),
        active: pills.filter((p) => p.getAttribute('aria-pressed') === 'true').map((p) => p.querySelector('.saved-weather__name')?.textContent),
        conditionShown: pills.some((p) => getComputedStyle(p.querySelector('.saved-weather__condition')).display !== 'none'),
        labelsCarryCondition: pills.every((p) => {
          const condition = p.querySelector('.saved-weather__condition')?.textContent
          return Boolean(condition) && /, -?\d+°[CF], /.test(p.getAttribute('aria-label') || '') && p.getAttribute('aria-label').includes(condition) && p.title.includes(condition)
        }),
        minHeight: Math.min(...buttons.map((b) => b.getBoundingClientRect().height)),
        more: more && { text: more.textContent.trim(), expanded: more.getAttribute('aria-expanded'), label: more.getAttribute('aria-label') },
      }
    })

  // Two places: one row, no overflow, no "+N more".
  await seed(two, two[0])
  const small = await probe()
  if (small.overflow || !small.pillsInside) failures.push(`${name}: saved row overflows horizontally with 2 places ${JSON.stringify(small)}`)
  if (small.more) failures.push(`${name}: "+N more" should not appear for 2 places`)
  if (small.pills !== 2) failures.push(`${name}: expected 2 saved pills, got ${small.pills}`)
  if (small.conditionShown) failures.push(`${name}: condition text should be hidden on phones (kept in aria-label)`)
  if (!small.labelsCarryCondition) failures.push(`${name}: pill aria-labels must still include temperature and condition`)
  if (small.minHeight < 44) failures.push(`${name}: saved pills below 44px tap target (${small.minHeight})`)

  // Eight places with the LAST one active: collapsed to two rows, active still shown.
  await seed(many, many[many.length - 1])
  const collapsed = await probe()
  if (collapsed.overflow || !collapsed.pillsInside) failures.push(`${name}: saved row overflows horizontally when collapsed ${JSON.stringify(collapsed)}`)
  if (collapsed.rows > 2) failures.push(`${name}: collapsed saved row uses ${collapsed.rows} rows, expected ≤ 2`)
  if (!collapsed.more || !/^\+\d+ more$/.test(collapsed.more.text) || collapsed.more.expanded !== 'false') {
    failures.push(`${name}: expected a collapsed "+N more" pill, got ${JSON.stringify(collapsed.more)}`)
  } else if (Number(collapsed.more.text.match(/\d+/)[0]) !== many.length - collapsed.pills) {
    failures.push(`${name}: "+N more" count ${collapsed.more.text} does not match hidden places (${many.length - collapsed.pills})`)
  }
  if (JSON.stringify(collapsed.active) !== JSON.stringify(['Sioux Falls'])) {
    failures.push(`${name}: active location must stay visible when collapsed, got ${JSON.stringify(collapsed.active)}`)
  }
  if (collapsed.minHeight < 44) failures.push(`${name}: collapsed pills below 44px tap target (${collapsed.minHeight})`)

  await page.locator('.saved-weather > button.saved-weather__more').click()
  const expanded = await probe()
  if (expanded.pills !== many.length) failures.push(`${name}: expanded row should show all ${many.length} places, got ${expanded.pills}`)
  if (expanded.overflow || !expanded.pillsInside) failures.push(`${name}: expanded saved row overflows horizontally`)
  if (!expanded.more || expanded.more.text !== 'Show less' || expanded.more.expanded !== 'true') {
    failures.push(`${name}: expanded row needs a "Show less" pill, got ${JSON.stringify(expanded.more)}`)
  }
  if (JSON.stringify(expanded.names) !== JSON.stringify(many.map((p) => p.name))) {
    failures.push(`${name}: expanded row should keep saved order, got ${JSON.stringify(expanded.names)}`)
  }

  await page.locator('.saved-weather > button.saved-weather__more').click()
  const recollapsed = await probe()
  if (recollapsed.pills !== collapsed.pills || recollapsed.rows > 2 || recollapsed.more?.expanded !== 'false') {
    failures.push(`${name}: "Show less" should restore the collapsed row, got ${JSON.stringify(recollapsed)}`)
  }
  console.log('saved pills 390:', JSON.stringify({ small: small.pills, collapsed: { pills: collapsed.pills, rows: collapsed.rows, more: collapsed.more?.text }, expanded: expanded.pills }))
  if (consoleErrors.length) failures.push(`${name}: ${consoleErrors.join('; ')}`)
  await page.close()
}

// ---- compact current card on a phone ---------------------------------------
// Save sits top-right in the card header, cloud cover and wind share a row as
// compact tiles, unit/refresh share a row with the precip badge, and nothing
// overflows horizontally.
{
  const name = 'compact-current-390'
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const consoleErrors = []
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  await page.route('**/api/forecast*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }),
  )
  await page.route('**/api/air*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(airFixture) }))
  await page.route('**/api/confidence*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(confidenceFixture) }))
  await page.route('**/api/alerts*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(alertsFixture) }))
  await page.goto(`http://localhost:${serverPort}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.current__temp', { timeout: 10000 })
  const m = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel)?.getBoundingClientRect()
    const card = r('.current')
    const head = r('.current__head')
    const save = r('.save-toggle')
    const h1 = r('.current__place')
    const cloud = r('.panel--cloud')
    const wind = r('.panel--wind')
    const sun = r('.panel--sun')
    const unit = r('.forecast-controls')
    const badge = r('.current__toolbar .badges')
    // The hourly strip scrolls sideways by design; check the card's own blocks.
    const overflowing = [...document.querySelectorAll('.current__head, .current__head *, .current__hero, .current__hero *, .current__panels > .panel, .panel--hourly, .stats')]
      .filter((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 0.5 })
      .map((n) => n.className?.baseVal ?? n.className)
    return {
      saveInHeaderTopRight: Boolean(save && head) && save.right > card.left + card.width * 0.6 && head.right - save.right <= 2 && save.top - head.top <= 8 && save.left >= h1.right - 1,
      saveTapTarget: save.height >= 44 && save.width >= 44,
      cloudWindShareRow: Math.abs(cloud.top - wind.top) < 2 && cloud.right <= wind.left && cloud.width < card.width * 0.6,
      sunBelowFullWidth: sun.top >= cloud.bottom && sun.width > cloud.width * 1.8,
      // Controls share the badge row whenever both fit; they only wrap when the
      // badges themselves need the width (e.g. rain + hail on a storm day).
      controlsInlineWithBadge:
        unit.top < badge.bottom ||
        badge.width + unit.width + 12 > r('.current__toolbar').width,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth && overflowing.length === 0,
      ...(() => {
        // Cloud + wind tiles: one-line labels on a shared baseline, equal heights,
        // graphic on the left with the reading vertically centred beside it.
        const lab = (p) => document.querySelector(`${p} .metric__label`)?.getBoundingClientRect()
        const cl = lab('.panel--cloud'), wl = lab('.panel--wind')
        const ring = r('.panel--cloud .cloud__ring'), desc = r('.panel--cloud .cloud__desc')
        const dial = r('.panel--wind .wind__dial'), wtext = r('.panel--wind .wind__readout')
        const mid = (b) => b.top + b.height / 2
        return {
          tileLabelsOneLineSameTop: Boolean(cl && wl) && cl.height < 24 && wl.height < 24 && Math.abs(cl.top - wl.top) < 1.5,
          tilesEqualHeight: Math.abs(cloud.height - wind.height) < 1,
          cloudGraphicLeftReadingCentred: Boolean(ring && desc) && desc.left >= ring.right && Math.abs(mid(desc) - mid(ring)) < 4,
          windGraphicLeftReadingCentred: Boolean(dial && wtext) && wtext.left >= dial.right && Math.abs(mid(wtext) - mid(dial)) < 4,
        }
      })(),
      overflowing,
    }
  })
  await page.setViewportSize({ width: 320, height: 700 })
  m.tilesFitAt320 = await page.evaluate(() => [...document.querySelectorAll('.panel--cloud, .panel--cloud *, .panel--wind, .panel--wind *')]
    .every((n) => { const b = n.getBoundingClientRect(); const t = n.closest('.panel').getBoundingClientRect(); return b.width === 0 || (b.right <= t.right + 0.5 && b.left >= t.left - 0.5) }))
  for (const [key, ok] of Object.entries(m)) {
    if (key !== 'overflowing' && !ok) failures.push(`${name}: ${key} failed ${key === 'noHorizontalOverflow' ? JSON.stringify(m.overflowing) : ''}`)
  }
  const tapTargets = await page.$$eval('.forecast-controls button', (ns) => ns.map((n) => { const b = n.getBoundingClientRect(); return [b.width, b.height] }))
  if (tapTargets.some(([w, h]) => w < 44 || h < 44)) failures.push(`${name}: unit/refresh tap targets under 44px ${JSON.stringify(tapTargets)}`)
  console.log('compact current 390:', JSON.stringify(m))
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
