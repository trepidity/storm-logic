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
 * Dev-only. Requires: npm i -D playwright pngjs
 * Run: node scripts/contrast-check.mjs
 */
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
const PORT = 4174
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

const TARGETS = [
  ['.current__meta', 'location timezone line'],
  ['.current__feels', 'feels-like'],
  ['.current__range', 'high/low'],
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
  ['.forecast__hint', 'forecast hint'],
  ['.day__name small', 'day date'],
  ['.day__condition', 'day condition'],
  ['.day__chance', 'precip chance'],
  ['.day__low', 'daily low'],
  ['.badge', 'badge text'],
  ['.footer p', 'footer attribution'],
  ['.footer__note', 'footer hail note'],
]

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
  const dates = Array.from({ length: 10 }, (_, i) => `2026-08-${String(9 + i).padStart(2, '0')}`)
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
      hourlyCode.push(code)
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
      weather_code: hourlyCode,
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

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})

const failures = []
let checked = 0

for (const theme of THEMES) {
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } })
  await page.route('**/api/forecast*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeFixture(theme.code, theme.isDay)) }),
  )
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.current__temp')

  const rows = []
  for (const [selector, label] of TARGETS) {
    const el = page.locator(selector).first()
    if (!(await el.count())) continue

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

  const worst = [...rows].sort((a, b) => a.ratio - b.ratio).slice(0, 3)
  console.log(
    `${rows.every((r) => r.pass) ? 'PASS' : 'FAIL'}  ${theme.name.padEnd(12)} ` +
      `${rows.length} roles · worst: ${worst.map((w) => `${w.label} ${w.ratio}`).join(', ')}`,
  )
  await page.close()
}

await browser.close()
server.close()

console.log(`\n${checked} contrast checks across ${THEMES.length} themes.`)
if (failures.length) {
  console.error(`\n${failures.length} BELOW AA:\n` + failures.join('\n'))
  process.exit(1)
}
console.log('All roles meet WCAG AA.')
