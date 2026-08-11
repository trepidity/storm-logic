/**
 * WCAG contrast audit across every sky theme.
 *
 * Reads the *rendered* pixels rather than the declared colours, because almost
 * every surface here is translucent — the effective background is the sky
 * gradient composited through two or three layers of glass, which you cannot
 * get from computed styles alone.
 *
 * Method: screenshot each text element's box twice — once normally, once with
 * all text set to `color: transparent` — and take the average pixel of the
 * second as the true background behind that text.
 *
 * Dev-only. Requires: npm ci && npx playwright install chromium
 * Run: node scripts/contrast-check.mjs
 */
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
// Let the OS choose a free port so parallel/local test runs never collide.
const PORT = 0
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' }

// AA: 4.5 for body text, 3.0 for large text (>=24px, or >=18.66px bold).
const AA_NORMAL = 4.5
const AA_LARGE = 3.0

const THEMES = [
  { name: 'clear', code: 0, isDay: 1 },
  { name: 'cloudy', code: 3, isDay: 1 },
  { name: 'rain', code: 63, isDay: 1 },
  { name: 'snow', code: 73, isDay: 1 },
  { name: 'fog', code: 45, isDay: 1 },
  { name: 'storm', code: 95, isDay: 1 },
  { name: 'night', code: 0, isDay: 0 },
  { name: 'night-storm', code: 95, isDay: 0 },
]
const requestedThemeNames = new Set(process.argv.slice(2))
const themesToCheck = requestedThemeNames.size
  ? THEMES.filter((theme) => requestedThemeNames.has(theme.name))
  : THEMES

if (requestedThemeNames.size && themesToCheck.length !== requestedThemeNames.size) {
  throw new Error(`Unknown contrast theme: ${[...requestedThemeNames].join(', ')}`)
}

const TARGETS = [
  ['.current__meta', 'location timezone line'],
  ['.current__feels', 'feels-like'],
  ['.current__range', 'high/low'],
  ['.current__precip-timing', 'precip timing'],
  ['.current__precip-event', 'precip event story'],
  ['.metric__label', 'panel caption'],
  ['.cloud__desc', 'cloud description'],
  ['.wind__from', 'wind direction'],
  ['.wind__gusts', 'gusts'],
  ['.sun__label', 'sun caption'],
  ['.sun__value', 'sun time'],
  ['.hourly__hint', 'hourly hint'],
  ['.hour__time', 'hour label'],
  ['.hour__temp', 'hour temperature'],
  ['.hour__chance--on', 'hour precip chance'],
  ['.stat dt', 'stat caption'],
  ['.stat dd', 'stat value'],
  ['.stat__note', 'US AQI category'],
  ['.forecast__hint', 'forecast hint'],
  ['.day__name small', 'day date'],
  ['.day__condition', 'day condition'],
  ['.day__explanation', 'selected day explanation'],
  ['.outdoor-plan__title', 'outdoor plan title'],
  ['.outdoor-plan__window', 'outdoor dry daylight window'],
  ['.outdoor-plan__gusts', 'outdoor gust evidence'],
  ['.outdoor-plan__uv', 'outdoor UV evidence'],
  ['.outdoor-plan__storm', 'outdoor thunder evidence'],
  ['.confidence__title', 'ensemble spread title'],
  ['.confidence__temperature', 'ensemble temperature range'],
  ['.confidence__precipitation', 'ensemble precipitation range'],
  ['.confidence__note', 'ensemble provenance'],
  ['.day__chance', 'precip chance'],
  ['.day__low', 'daily low'],
  ['.badge', 'badge text'],
  ['.footer p', 'footer attribution'],
  ['.footer__note', 'footer hail note'],
  ['.tabs button.is-active', 'active tab'],
  ['.chip--saved .chip__main', 'saved chip'],
  ['.chip--muted .chip__main', 'recent chip'],
  ['.tabs button:not(.is-active)', 'inactive tab'],
  ['.search__privacy', 'location privacy disclosure'],
]

// Only present once the Radar tab is open, so they're measured in a second pass.
const RADAR_TARGETS = [
  ['.radar__stamp', 'radar timestamp'],
  ['.radar__scale span', 'radar time scale'],
  ['.radar__legend span', 'radar legend'],
  ['.radar__provenance', 'radar product provenance'],
  ['.radar__official-layers-head p', 'official layers description'],
  ['.radar__layer-toggle', 'official layer control'],
  ['.radar__layer-pill-label', 'layer pill name'],
  ['.radar__layer-pill-state', 'layer pill on/off state'],
  ['.radar__layer-pill-count', 'layer pill count'],
  ['.radar__layer-info', 'layer detail control'],
  ['.radar__credit', 'radar attribution'],
]

// Source, timing, health, and frame coupling moved into a panel revealed on
// hover/focus. That is where this product's provenance now lives, so it still
// has to meet contrast — measured in the revealed state, against the panel's
// own surface, rather than skipped because it starts hidden.
const RADAR_DETAIL_TARGETS = [
  ['.radar__layer-source', 'layer source'],
  ['.radar__layer-time', 'layer time'],
  ['.radar__layer-health', 'layer source health'],
  ['.radar__layer-frame', 'layer frame coupling'],
  ['.radar__layer-scope', 'layer scope note'],
  ['.radar__layer-status', 'layer unavailable state'],
]

// Present only after an alert hands the user to Radar with an official area.
const RADAR_ALERT_TARGETS = [
  ['.radar__alert-note', 'official alert area note'],
]

// Like Radar, Alert cards are lazy-tab content and need their own contrast pass.
const ALERT_TARGETS = [
  ['.alerts__eyebrow', 'alerts provider label'],
  ['.alert__event', 'alert event'],
  ['.alert__meta', 'alert metadata'],
  ['.alert__severity', 'alert severity'],
  ['.alert__times dt', 'alert time caption'],
  ['.alert__times dd', 'alert time value'],
  ['.alert__area', 'alert area'],
  ['.alert__radar', 'alert radar handoff'],
  ['.alert__details summary', 'alert details control'],
]

const RADAR_INDEX = {
  version: '2.0',
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [1786000000, 1786000600, 1786001200].map((t) => ({ time: t, path: '/v2/radar/' + t })),
    nowcast: [{ time: 1786001800, path: '/v2/radar/nowcast_1' }],
  },
}
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

const ALERTS = {
  type: 'FeatureCollection',
  features: [
    {
      id: 'https://api.weather.gov/alerts/contrast-fixture',
      geometry: {
        type: 'Polygon',
        coordinates: [[[-87.75, 41.82], [-87.56, 41.82], [-87.56, 41.95], [-87.75, 41.95], [-87.75, 41.82]]],
      },
      properties: {
        '@id': 'https://api.weather.gov/alerts/contrast-fixture',
        event: 'Severe Thunderstorm Warning',
        headline: 'Severe Thunderstorm Warning issued for Cook County',
        severity: 'Severe',
        urgency: 'Immediate',
        certainty: 'Observed',
        effective: '2030-08-09T14:00:00-05:00',
        expires: '2030-08-09T15:00:00-05:00',
        areaDesc: 'Cook County',
        description: 'Damaging wind and large hail are possible.',
      },
    },
  ],
}

const AIR = {
  latitude: 41.88,
  longitude: -87.63,
  timezone: 'America/Chicago',
  current: { time: '2026-08-09T14:00', interval: 3600, us_aqi: 42 },
}

// ---- colour maths ---------------------------------------------------------

const toLinear = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

function contrast(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

function parseRgb(str) {
  const n = str.match(/[\d.]+/g)?.map(Number) ?? []
  return { rgb: [n[0], n[1], n[2]], alpha: n[3] ?? 1 }
}

/** Flatten a translucent foreground onto its measured background. */
const composite = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha))

function averagePixel(buffer) {
  const png = PNG.sync.read(buffer)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue
    r += png.data[i]
    g += png.data[i + 1]
    b += png.data[i + 2]
    n += 1
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0]
}

// ---- fixture --------------------------------------------------------------

function makeFixture(code, isDay) {
  const dates = Array.from({ length: 11 }, (_, i) => `2026-08-${String(9 + i).padStart(2, '0')}`)
  const hourlyTime = []
  const hourlyCloud = []
  const hourlyTemp = []
  const hourlyChance = []
  const hourlyCode = []
  const hourlyPrecip = []
  for (const d of dates) {
    for (let h = 0; h < 24; h += 1) {
      hourlyTime.push(`${d}T${String(h).padStart(2, '0')}:00`)
      hourlyCloud.push((h * 11) % 101)
      hourlyTemp.push(60 + (h % 12) * 2)
      hourlyChance.push((h * 7) % 60)
      hourlyCode.push(code)
      // Current hour is wet and the following hour is dry, ensuring the
      // user-facing timing line is present for the pixel check.
      hourlyPrecip.push(h === 14 ? 0.01 : 0)
    }
  }
  const fill = (v) => dates.map(() => v)
  return {
    latitude: 41.88,
    longitude: -87.63,
    timezone: 'America/Chicago',
    current: {
      time: '2026-08-09T14:30',
      temperature_2m: 78.4,
      relative_humidity_2m: 62,
      apparent_temperature: 81.2,
      is_day: isDay,
      precipitation: 0.02,
      rain: 0.02,
      showers: 0,
      snowfall: 0,
      weather_code: code,
      cloud_cover: 44,
      pressure_msl: 1008,
      wind_speed_10m: 16,
      wind_direction_10m: 180,
      wind_gusts_10m: 31,
    },
    daily: {
      time: dates,
      weather_code: fill(code),
      temperature_2m_max: dates.map((_, i) => 80 + i),
      temperature_2m_min: dates.map((_, i) => 60 + i),
      apparent_temperature_max: fill(88),
      apparent_temperature_min: fill(58),
      sunrise: dates.map((d) => `${d}T06:24`),
      sunset: dates.map((d) => `${d}T20:19`),
      daylight_duration: fill(50100),
      sunshine_duration: fill(30000),
      uv_index_max: fill(8),
      precipitation_sum: fill(0.01),
      rain_sum: fill(0.01),
      showers_sum: fill(0),
      snowfall_sum: fill(code >= 71 && code <= 86 ? 2.1 : 0),
      precipitation_hours: fill(1),
      precipitation_probability_max: fill(24),
      wind_speed_10m_max: fill(16),
      wind_gusts_10m_max: fill(31),
      wind_direction_10m_dominant: fill(180),
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
}

function makeConfidenceFixture() {
  const date = '2026-08-10'
  const time = Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, '0')}:00`)
  return {
    hourly: {
      time,
      temperature_2m: time.map(() => 82),
      precipitation: time.map(() => 0.01),
      ...Object.fromEntries(
        Array.from({ length: 30 }, (_, index) => [
          `temperature_2m_member${String(index + 1).padStart(2, '0')}`,
          time.map(() => 80 + index * 0.2),
        ]),
      ),
      ...Object.fromEntries(
        Array.from({ length: 30 }, (_, index) => [
          `precipitation_member${String(index + 1).padStart(2, '0')}`,
          time.map(() => (index < 15 ? 0 : 0.01)),
        ]),
      ),
    },
  }
}

// ---- run ------------------------------------------------------------------

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

const failures = []
let checked = 0

// Seed storage so the saved/recent chips exist to be measured — a fresh
// context has none, and the targets would silently skip.
const SEED = `(() => {
  const p = (name, lat, lon) => ({ key: lat.toFixed(3) + ',' + lon.toFixed(3), name, label: name,
    latitude: lat, longitude: lon, admin1: '', country: '', isGeo: false })
  localStorage.setItem('stormlogic:v1:favorites', JSON.stringify([p('Chicago', 41.878, -87.630)]))
  localStorage.setItem('stormlogic:v1:recents', JSON.stringify([p('Denver', 39.740, -104.980)]))
  localStorage.setItem('stormlogic:v1:onboarded', 'true')
})()`

for (const theme of themesToCheck) {
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } })
  await page.addInitScript(SEED)
  await page.route('**/api/forecast*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeFixture(theme.code, theme.isDay)) }),
  )
  await page.route('**/api/alerts*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALERTS) }),
  )
  await page.route('**/api/air*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(AIR) }),
  )
  await page.route('**/api/confidence*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeConfidenceFixture()) }),
  )
  // Regexes, not globs: CARTO serves from a.basemaps.cartocdn.com and friends.
  await page.route(/api\.rainviewer\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RADAR_INDEX) }))
  await page.route(/tilecache\.rainviewer\.com|basemaps\.cartocdn\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }))

  await page.goto(`http://localhost:${serverPort}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.current__temp')
  await page.waitForSelector('.stat--aqi .stat__value', { timeout: 10000 })
  // Ensemble spread is deliberately lazy inside Tomorrow's detail. Open the
  // consumer seam before waiting for it; otherwise this audit times out while
  // the component is correctly unmounted.
  await page.locator('.forecast .day').first().locator('.day__summary').click()
  await page.waitForSelector('.confidence--ready', { timeout: 10000 })

  // Privacy copy is collapsed until the locate control is active; focus it so
  // the disclosure is painted for the pixel AA pass.
  await page.locator('.search__geo').focus()

  // Kill transitions for the whole run. Measuring injects `color: transparent`
  // and removes it again in quick succession; any element with a colour
  // transition gets read mid-animation at a fractional alpha, which reports a
  // false ~1:1. Tabs were the first elements here with a colour transition.
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  })

  const rows = []

  async function measure(selector, label) {
    await measureLocator(page.locator(selector).first(), label)
  }

  async function measureLocator(el, label) {
    if (!(await el.count())) return
    // A target that exists but is not painted cannot be measured, and silently
    // skipping it would let hidden text drift out of contrast unnoticed.
    if (!(await el.isVisible())) {
      failures.push(`${theme.name} · ${label}: present but not visible, so contrast could not be measured`)
      return
    }

    const style = await el.evaluate((n) => {
      const cs = getComputedStyle(n)
      return { color: cs.color, fontSize: parseFloat(cs.fontSize), fontWeight: Number(cs.fontWeight) || 400 }
    })

    // Hide every glyph, then the element's own box is pure background.
    const hide = await page.addStyleTag({ content: '*, *::before, *::after { color: transparent !important; }' })
    const bg = averagePixel(await el.screenshot())
    await hide.evaluate((n) => n.remove())

    const { rgb, alpha } = parseRgb(style.color)
    const fg = composite(rgb, alpha, bg)
    const ratio = contrast(fg, bg)
    const large = style.fontSize >= 24 || (style.fontWeight >= 700 && style.fontSize >= 18.66)
    const threshold = large ? AA_LARGE : AA_NORMAL
    const pass = ratio >= threshold

    checked += 1
    rows.push({ label, ratio: ratio.toFixed(2), need: threshold, pass })
    if (!pass) failures.push(`${theme.name} · ${label}: ${ratio.toFixed(2)}:1 (needs ${threshold}:1)`)
  }

  for (const [selector, label] of TARGETS) await measure(selector, label)
  if (!(await page.locator('.confidence--ready').count())) {
    failures.push(`${theme.name} · ensemble spread: fixture did not render the confidence surface`)
  }
  if (!(await page.locator('.current__precip-timing').count())) {
    failures.push(`${theme.name} · precip timing: fixture did not render the timing surface`)
  }

  // Second pass with the Radar tab open — its chrome only exists there.
  await page.locator('.tabs button', { hasText: 'Radar' }).click()
  await page.waitForSelector('.radar__tick', { timeout: 15000 })
  await page.waitForTimeout(400)
  for (const [selector, label] of RADAR_TARGETS) await measure(selector, label)

  // Reveal each layer's detail panel and measure it in that state. Scoping to
  // the hovered layer matters: an unhovered sibling's panel is still hidden,
  // and a bare `.first()` would land on it.
  const layerIds = await page.locator('.radar__layer').evaluateAll(
    (elements) => elements.map((element) => element.getAttribute('data-layer-id')),
  )
  for (const layerId of layerIds) {
    const layer = page.locator(`.radar__layer[data-layer-id="${layerId}"]`)
    await layer.hover()
    for (const [child, label] of RADAR_DETAIL_TARGETS) {
      await measureLocator(layer.locator(child).first(), `${label} (${layerId})`)
    }
  }
  // Leave the hover state so later passes measure their own chrome unobscured.
  await page.mouse.move(0, 0)

  await page.locator('.tabs button', { hasText: 'Alerts' }).click()
  await page.waitForSelector('.alert', { timeout: 10000 })
  for (const [selector, label] of ALERT_TARGETS) await measure(selector, label)

  await page.locator('.alert__radar').click()
  await page.waitForSelector('.radar__alert-note', { timeout: 10000 })
  for (const [selector, label] of RADAR_ALERT_TARGETS) await measure(selector, label)

  const worst = [...rows].sort((a, b) => a.ratio - b.ratio).slice(0, 3)
  console.log(
    `${rows.every((r) => r.pass) ? 'PASS' : 'FAIL'}  ${theme.name.padEnd(12)} ` +
      `${rows.length} roles · worst: ${worst.map((w) => `${w.label} ${w.ratio}`).join(', ')}`,
  )
  await page.close()
}

await browser.close()
server.close()

console.log(`\n${checked} contrast checks across ${themesToCheck.length} themes.`)
if (failures.length) {
  console.error(`\n${failures.length} BELOW AA:\n` + failures.join('\n'))
  process.exit(1)
}
console.log('All roles meet WCAG AA.')
