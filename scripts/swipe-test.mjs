/**
 * Saved-location swipe navigation.
 *
 * Unit checks for the pure gesture rules in src/lib/swipe.js, then a mobile
 * browser run against the built app (touch gestures through CDP) covering:
 * next/previous with wrap-around, the 50px threshold, vertical scrolls and the
 * hourly scroller being ignored, the dots/"n of N" cue, the existing pill
 * selector, reduced motion, and that desktop and <2 saved stay unchanged.
 * All providers are mocked. Run after npm run build.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { classifySwipe, lockAxis, stepIndex, SWIPE_THRESHOLD_PX } from '../src/lib/swipe.js'

const results = []
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

// ---- pure rules ------------------------------------------------------------
check('threshold is 50px', SWIPE_THRESHOLD_PX, 50)
check('swipe left = next', classifySwipe(-80, 5), 'next')
check('swipe right = previous', classifySwipe(80, -5), 'previous')
check('short swipe ignored', classifySwipe(-49, 0), null)
check('exactly threshold counts', classifySwipe(-50, 0), 'next')
check('mostly vertical ignored', classifySwipe(-80, 70), null)
check('diagonal under 1.5x ignored', classifySwipe(90, 61), null)
check('NaN ignored', classifySwipe(Number.NaN, 0), null)
check('axis undecided under 10px', lockAxis(6, 4), null)
check('axis locks horizontal', lockAxis(-15, 2), 'x')
check('axis locks vertical', lockAxis(8, 14), 'y')
check('next steps forward', stepIndex(0, 3, 'next'), 1)
check('next wraps to first', stepIndex(2, 3, 'next'), 0)
check('previous wraps to last', stepIndex(0, 3, 'previous'), 2)
check('unsaved place: next starts at first', stepIndex(-1, 3, 'next'), 0)
check('unsaved place: previous starts at last', stepIndex(-1, 3, 'previous'), 2)
check('single saved place does not cycle', stepIndex(0, 1, 'next'), -1)
check('unknown direction', stepIndex(0, 3, 'up'), -1)

// ---- browser ---------------------------------------------------------------
const ROOT = new URL('../dist/', import.meta.url).pathname
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' }
const dates = Array.from({ length: 11 }, (_, i) => `2026-08-${String(9 + i).padStart(2, '0')}`)
const hourlyTime = []
for (const d of dates) for (let h = 0; h < 24; h += 1) hourlyTime.push(`${d}T${String(h).padStart(2, '0')}:00`)
const fill = (v) => dates.map(() => v)
const hourly = (v) => hourlyTime.map(() => v)
function forecast(lat) {
  const t = lat > 50 ? 50 : lat < 40 ? 23 : 68
  return {
    latitude: lat, longitude: 0, timezone: 'America/Chicago',
    current: { time: '2026-08-09T14:30', temperature_2m: t, relative_humidity_2m: 62, apparent_temperature: t,
      is_day: 1, precipitation: 0, rain: 0, showers: 0, snowfall: 0, weather_code: 0, cloud_cover: 44,
      pressure_msl: 1008, wind_speed_10m: 16, wind_direction_10m: 180, wind_gusts_10m: 31 },
    daily: { time: dates, weather_code: fill(0), temperature_2m_max: fill(84), temperature_2m_min: fill(66),
      apparent_temperature_max: fill(88), apparent_temperature_min: fill(64),
      sunrise: dates.map((d) => `${d}T06:24`), sunset: dates.map((d) => `${d}T20:19`),
      daylight_duration: fill(50100), sunshine_duration: fill(30000), uv_index_max: fill(8),
      precipitation_sum: fill(0), rain_sum: fill(0), showers_sum: fill(0), snowfall_sum: fill(0),
      precipitation_hours: fill(0), precipitation_probability_max: fill(10),
      wind_speed_10m_max: fill(16), wind_gusts_10m_max: fill(31), wind_direction_10m_dominant: fill(180) },
    hourly: { time: hourlyTime, cloud_cover: hourly(40), temperature_2m: hourly(t), precipitation_probability: hourly(10), weather_code: hourly(2) },
  }
}
const places = [
  { name: 'Chicago', latitude: 41.88, longitude: -87.63 },
  { name: 'Denver', latitude: 39.74, longitude: -104.99 },
  { name: 'London', latitude: 51.5085, longitude: -0.1257 },
].map((p) => ({ ...p, label: p.name, key: `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}` }))

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
await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}/`
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
})
const consoleErrors = []

async function openApp(contextOptions, favorites = places) {
  const context = await browser.newContext(contextOptions)
  await context.addInitScript(({ favorites, first }) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('stormlogic:v1:favorites', JSON.stringify(favorites))
    localStorage.setItem('stormlogic:v1:lastPlace', JSON.stringify(first))
    localStorage.setItem('stormlogic:v1:onboarded', 'true')
  }, { favorites, first: favorites[0] })
  const page = await context.newPage()
  page.on('pageerror', (e) => consoleErrors.push(e.message))
  // Mocked 503s for optional widgets surface as resource errors; anything else counts.
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && consoleErrors.push(m.text()))
  await page.route('**/api/forecast*', (r) => {
    const lat = Number(new URL(r.request().url()).searchParams.get('lat'))
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(forecast(lat)) })
  })
  await page.route('**/api/air*', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/confidence*', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.route('https://api.open-meteo.com/v1/forecast?**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ current: { time: Math.floor(Date.now() / 1000), temperature_2m: 20, precipitation: 0 } }) }))
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForSelector('.current__place')
  return { context, page }
}

async function touchDrag(page, from, dx, dy = 0) {
  const cdp = await page.context().newCDPSession(page)
  const steps = 8
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await page.waitForTimeout(250)
}

const placeName = (page) => page.locator('.current__place').textContent()
const count = (page) => page.locator('.swipe-indicator__count').textContent()
// A point on the current card's reading, clear of any scroller.
async function cardPoint(page) {
  const box = await page.locator('.current__reading').boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
{
  const { context, page } = await openApp(mobile)
  check('mobile shows indicator', await page.locator('.swipe-indicator').count(), 1)
  check('indicator starts at 1 of 3', await count(page), '1 of 3')
  check('three dots, first active', await page.locator('.swipe-indicator__dot').evaluateAll((d) => d.map((n) => n.classList.contains('is-active'))), [true, false, false])
  check('indicator announces position', (await page.locator('.swipe-indicator [aria-live]').textContent()).includes('saved location 1 of 3'), true)

  await touchDrag(page, await cardPoint(page), -120)
  check('swipe left moves to next saved', await placeName(page), 'Denver')
  check('indicator follows', await count(page), '2 of 3')
  check('saved pill follows swipe', await page.getByRole('button', { name: /^Denver,/ }).getAttribute('aria-pressed'), 'true')

  await touchDrag(page, await cardPoint(page), -30)
  check('30px swipe is ignored', await placeName(page), 'Denver')

  await touchDrag(page, await cardPoint(page), -60, -160)
  check('vertical gesture is ignored', await placeName(page), 'Denver')

  await page.locator('.hourly__scroller').scrollIntoViewIfNeeded()
  const sb = await page.locator('.hourly__scroller').boundingBox()
  await touchDrag(page, { x: sb.x + sb.width - 40, y: sb.y + sb.height / 2 }, -150)
  check('hourly scroller drag does not change location', await placeName(page), 'Denver')
  await page.evaluate(() => window.scrollTo(0, 0))

  await touchDrag(page, await cardPoint(page), -120)
  check('second swipe left', await placeName(page), 'London')
  await touchDrag(page, await cardPoint(page), -120)
  check('swipe left wraps to first', await placeName(page), 'Chicago')
  await touchDrag(page, await cardPoint(page), 120)
  check('swipe right wraps to last', await placeName(page), 'London')
  await touchDrag(page, await cardPoint(page), 120)
  check('swipe right moves to previous', await placeName(page), 'Denver')

  await page.getByRole('button', { name: /^Chicago,/ }).click()
  await page.waitForTimeout(200)
  check('pill selector still works', await placeName(page), 'Chicago')
  check('indicator tracks pill selection', await count(page), '1 of 3')
  check('swipe does not add saved places to recents', await page.evaluate(() => JSON.parse(localStorage.getItem('stormlogic:v1:recents') || '[]').length), 0)

  await page.getByRole('tab', { name: 'Alerts', exact: true }).click().catch(() => {})
  check('indicator only on forecast view', await page.locator('.swipe-indicator').count(), 0)
  await page.getByRole('tab', { name: 'Forecast', exact: true }).click()
  await page.waitForSelector('.swipe-indicator')
  await touchDrag(page, await cardPoint(page), -120)
  check('swipe re-attaches after returning to forecast', await placeName(page), 'Denver')
  await page.screenshot({ path: '/tmp/stormlogic-swipe-mobile.png' })
  await context.close()
}

{
  const { context, page } = await openApp({ ...mobile, reducedMotion: 'reduce' })
  const cdp = await context.newCDPSession(page)
  const p = await cardPoint(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
  for (let i = 1; i <= 6; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x - i * 20, y: p.y }] })
  check('reduced motion: no slide while dragging', await page.locator('.swipe-stage').evaluate((n) => getComputedStyle(n).transform), 'none')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(250)
  check('reduced motion: swipe still navigates', await placeName(page), 'Denver')
  await context.close()
}

{
  const { context, page } = await openApp({ ...mobile }, places.slice(0, 1))
  check('one saved place: no indicator', await page.locator('.swipe-indicator').count(), 0)
  await touchDrag(page, await cardPoint(page), -120)
  check('one saved place: swipe does nothing', await placeName(page), 'Chicago')
  await context.close()
}

{
  const { context, page } = await openApp({ viewport: { width: 1280, height: 900 } })
  check('desktop: no indicator', await page.locator('.swipe-indicator').count(), 0)
  check('desktop: panel not swipeable', await page.locator('#panel-forecast').evaluate((n) => n.classList.contains('panelgroup--swipeable')), false)
  await context.close()
}

check('no console errors', consoleErrors, [])
await browser.close()
server.close()
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
