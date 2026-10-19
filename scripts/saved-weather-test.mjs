/**
 * Product seam: saved-location weather comparison through rendered controls,
 * persistence, unit conversion, current-only provider failures, and mobile layout.
 * All weather providers are mocked. Run after npm run build.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
const PORT = 4187
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

await page.route('**/api/forecast*', r => {
 const url = new URL(r.request().url())
 const metric = url.searchParams.get('units') === 'metric'
 const london = Number(url.searchParams.get('lat')) > 50
 const payload = structuredClone(FORECAST)
 payload.current.temperature_2m = metric ? (london ? 10 : 20) : (london ? 50 : 68)
 payload.current.apparent_temperature = payload.current.temperature_2m - 2
 payload.current.weather_code = london ? 61 : 0
 payload.current.precipitation = london ? 1 : 0
 payload.current.rain = london ? 1 : 0
 return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)})
})
await page.route('**/geocoding-api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GEOCODE) }))

const results = []
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ name, pass, actual, expected })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}


const places = [
  { name: 'Chicago', latitude: 41.88, longitude: -87.63 },
  { name: 'London', latitude: 51.5085, longitude: -0.1257 },
  { name: 'Denver', latitude: 39.74, longitude: -104.99 },
  { name: 'Missing', latitude: 30, longitude: -90 },
].map(p => ({...p, label: p.name, key: `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`}))
let requests = 0
let concurrent = 0
let peakConcurrent = 0
await page.route('https://api.open-meteo.com/v1/forecast?**', async r => {
  requests++
  concurrent++
  peakConcurrent = Math.max(peakConcurrent, concurrent)
  await new Promise(resolve => setTimeout(resolve, 40))
  const lat = Number(new URL(r.request().url()).searchParams.get('latitude'))
  const current = { time: Math.floor(Date.now()/1000), temperature_2m: 20, precipitation: 0, rain: 0, showers: 0, snowfall: 0 }
  if (lat === 51.5085) Object.assign(current, {temperature_2m: 10, precipitation: 1, rain: 1})
  if (lat === 39.74) Object.assign(current, {temperature_2m: -5, precipitation: 2, snowfall: 0.2})
  if (lat === 30) Object.assign(current, {temperature_2m: null, precipitation: null, rain: null, showers: null, snowfall: null})
  concurrent--
  await r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({current}) })
})
await page.goto(`http://localhost:${PORT}`)
await page.evaluate(places => {
 localStorage.setItem('stormlogic:v1:favorites', JSON.stringify(places))
 localStorage.setItem('stormlogic:v1:lastPlace', JSON.stringify(places[0]))
 localStorage.setItem('stormlogic:v1:hasOnboarded', 'true')
}, places)
await page.reload({waitUntil:'networkidle'})
check('saved locations expose a unified weather strip', await page.locator('.saved-weather').count(), 1)
if (!await page.locator('.saved-weather').count()) {
 
await page.route(/api\.rainviewer\.com/, r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:'2.0',host:'https://tilecache.rainviewer.com',radar:{past:[{time:1786401900,path:'/v2/radar/1786401900'},{time:1786409700,path:'/v2/radar/1786409700'}],nowcast:[]}})}))
await page.route(/tilecache\.rainviewer\.com|basemaps\.cartocdn\.com/, r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64')}))
await page.route('**/api/severeDesk/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}))
await page.setViewportSize({width:393,height:850})
await page.getByRole('tab',{name:'Radar',exact:true}).click()
await page.waitForSelector('.radar__play')
check('radar retains saved strip', await page.locator('.saved-weather button').count(),4)
check('radar playback within mobile viewport', await page.locator('.radar__play').evaluate(el=>el.getBoundingClientRect().bottom <= innerHeight),true)
check('radar remains dominant', await page.locator('.radar__map').evaluate(el=>el.getBoundingClientRect().height >= 500),true)
await page.screenshot({path:'/tmp/stormlogic-saved-weather-radar.png',fullPage:false})
await page.getByRole('tab',{name:'Forecast',exact:true}).click()
await page.setViewportSize({width:1440,height:1000})

// A removed favorite must not return when its in-flight response resolves.
let releasePending
const pending = new Promise(resolve => { releasePending = resolve })
await page.route('https://api.open-meteo.com/v1/forecast?**', async r => {
  if (Number(new URL(r.request().url()).searchParams.get('latitude')) === 30) await pending
  await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({current:{time:Math.floor(Date.now()/1000),temperature_2m:20,precipitation:0}})}).catch(() => {})
})
const pendingRequest = page.waitForRequest(r => r.url().includes('api.open-meteo.com') && new URL(r.url()).searchParams.get('latitude') === '30')
await page.reload({waitUntil:'domcontentloaded'})
await pendingRequest
await page.locator('.location-toggle').click()
await page.getByRole('button',{name:'Remove Missing from saved locations',exact:true}).click()
releasePending()
await page.waitForTimeout(100)
check('late response cannot restore removed favorite', await page.locator('.saved-weather button').count(),3)
check('removed favorite absent', (await page.locator('.saved-weather').innerText()).includes('Missing'),false)
// Cached observations must age out even when no tab or unit change renders them.
await page.clock.install()
const nearExpiry = Math.floor(Date.now()/1000) - 29 * 60 - 45
await page.route('https://api.open-meteo.com/v1/forecast?**', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({current:{time:nearExpiry,temperature_2m:20,precipitation:0}})}))
await page.reload({waitUntil:'networkidle'})
check('recent model data is usable', (await page.locator('.saved-weather').innerText()).includes('Dry'),true)
await page.clock.fastForward(31_000)
check('cached conditions expire without interaction', (await page.locator('.saved-weather').innerText()).includes('Unavailable'),true)
// Provider error and stale model data must never look dry.
await page.route('https://api.open-meteo.com/v1/forecast?**', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ current: {time:1,temperature_2m:20,precipitation:0} })}))
await page.reload({waitUntil:'networkidle'})
check('stale model data is unavailable', await page.locator('.saved-weather').innerText().then(t=>!t.includes('Dry') && t.includes('Unavailable')), true)
await page.route('https://api.open-meteo.com/v1/forecast?**', r => r.fulfill({status:503,contentType:'application/json',body:'{}'}))
await page.reload({waitUntil:'networkidle'})
check('provider failure is unavailable', await page.locator('.saved-weather').innerText().then(t=>!t.includes('Dry') && t.includes('Unavailable')), true)
await page.locator('.location-toggle').click()
await page.locator('.chip[data-kind="saved"] .chip__remove').first().click()
check('removing favorite updates summary', await page.locator('.saved-weather button').count(),2)
await page.reload({waitUntil:'networkidle'})
check('removal persists in summary', await page.locator('.saved-weather button').count(),2)
await browser.close(); server.close(); process.exit(1)
}
for (const [name, temp, condition] of [['Chicago','68°F','Dry'],['London','50°F','Rain'],['Denver','23°F','Snow'],['Missing','—','Precip unavailable']]) {
 const pill = page.getByRole('button', {name: new RegExp(`^${name},`)})
 check(`${name} temperature and current precipitation`, (await pill.textContent()).includes(temp) && (await pill.textContent()).includes(condition), true)
}
await page.getByRole('button', {name:'°C', exact:true}).click()
check('unit conversion is immediate', await page.locator('.saved-weather').innerText().then(t => t.includes('20°C') && t.includes('10°C')), true)
check('units do not refetch current-only data', requests, 4)
check('current-weather request concurrency bounded', peakConcurrent <= 2, true)
await page.route('**/api/alerts*', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({features:[]})}))
await page.getByRole('tab', {name:'Alerts', exact:true}).click()
await page.getByRole('button', {name:/^London,/}).click()
check('selection preserves view', await page.getByRole('tab',{name:'Alerts',exact:true}).getAttribute('aria-selected'), 'true')
check('selection announced', await page.getByRole('button',{name:/^London,/}).getAttribute('aria-pressed'), 'true')
await page.getByRole('tab',{name:'Forecast',exact:true}).click()
await page.reload({waitUntil:'networkidle'})
check('favorites restore', await page.locator('.saved-weather button').count(), 4)
check('units restore', (await page.locator('.saved-weather').innerText()).includes('10°C'), true)
check('active place restores', await page.getByRole('button',{name:/^London,/}).getAttribute('aria-pressed'), 'true')
for (const width of [320,393,430,768]) {
 await page.setViewportSize({width,height:850})
 check(`${width}px strip owns horizontal overflow`, await page.locator('.saved-weather').evaluate(el => el.getBoundingClientRect().right <= innerWidth && (innerWidth >= 768 || el.scrollWidth > el.clientWidth)), true)
}
await page.setViewportSize({width:393,height:850})
check('weather pills meet touch target', await page.locator('.saved-weather__pill').first().evaluate(el => el.getBoundingClientRect().height >= 48), true)
await page.screenshot({path:'/tmp/stormlogic-saved-weather-mobile.png',fullPage:false})
await page.setViewportSize({width:1440,height:1000})
await page.screenshot({path:'/tmp/stormlogic-saved-weather-desktop.png',fullPage:false})

await page.route(/api\.rainviewer\.com/, r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:'2.0',host:'https://tilecache.rainviewer.com',radar:{past:[{time:1786401900,path:'/v2/radar/1786401900'},{time:1786409700,path:'/v2/radar/1786409700'}],nowcast:[]}})}))
await page.route(/tilecache\.rainviewer\.com|basemaps\.cartocdn\.com/, r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64')}))
await page.route('**/api/severeDesk/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}))
await page.setViewportSize({width:393,height:850})
await page.getByRole('tab',{name:'Radar',exact:true}).click()
await page.waitForSelector('.radar__play')
check('radar retains saved strip', await page.locator('.saved-weather button').count(),4)
check('radar playback within mobile viewport', await page.locator('.radar__play').evaluate(el=>el.getBoundingClientRect().bottom <= innerHeight),true)
check('radar remains dominant', await page.locator('.radar__map').evaluate(el=>el.getBoundingClientRect().height >= 500),true)
await page.screenshot({path:'/tmp/stormlogic-saved-weather-radar.png',fullPage:false})
await page.getByRole('tab',{name:'Forecast',exact:true}).click()
await page.setViewportSize({width:1440,height:1000})

// A removed favorite must not return when its in-flight response resolves.
let releasePending
const pending = new Promise(resolve => { releasePending = resolve })
await page.route('https://api.open-meteo.com/v1/forecast?**', async r => {
  if (Number(new URL(r.request().url()).searchParams.get('latitude')) === 30) await pending
  await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({current:{time:Math.floor(Date.now()/1000),temperature_2m:20,precipitation:0}})}).catch(() => {})
})
const pendingRequest = page.waitForRequest(r => r.url().includes('api.open-meteo.com') && new URL(r.url()).searchParams.get('latitude') === '30')
await page.reload({waitUntil:'domcontentloaded'})
await pendingRequest
await page.locator('.location-toggle').click()
await page.getByRole('button',{name:'Remove Missing from saved locations',exact:true}).click()
releasePending()
await page.waitForTimeout(100)
check('late response cannot restore removed favorite', await page.locator('.saved-weather button').count(),3)
check('removed favorite absent', (await page.locator('.saved-weather').innerText()).includes('Missing'),false)
// Cached observations must age out even when no tab or unit change renders them.
await page.clock.install()
const nearExpiry = Math.floor(Date.now()/1000) - 29 * 60 - 45
await page.route('https://api.open-meteo.com/v1/forecast?**', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({current:{time:nearExpiry,temperature_2m:20,precipitation:0}})}))
await page.reload({waitUntil:'networkidle'})
check('recent model data is usable', (await page.locator('.saved-weather').innerText()).includes('Dry'),true)
await page.clock.fastForward(31_000)
check('cached conditions expire without interaction', (await page.locator('.saved-weather').innerText()).includes('Unavailable'),true)
// Provider error and stale model data must never look dry.
await page.route('https://api.open-meteo.com/v1/forecast?**', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ current: {time:1,temperature_2m:20,precipitation:0} })}))
await page.reload({waitUntil:'networkidle'})
check('stale model data is unavailable', await page.locator('.saved-weather').innerText().then(t=>!t.includes('Dry') && t.includes('Unavailable')), true)
await page.route('https://api.open-meteo.com/v1/forecast?**', r => r.fulfill({status:503,contentType:'application/json',body:'{}'}))
await page.reload({waitUntil:'networkidle'})
check('provider failure is unavailable', await page.locator('.saved-weather').innerText().then(t=>!t.includes('Dry') && t.includes('Unavailable')), true)
await page.locator('.location-toggle').click()
await page.locator('.chip[data-kind="saved"] .chip__remove').first().click()
check('removing favorite updates summary', await page.locator('.saved-weather button').count(),2)
await page.reload({waitUntil:'networkidle'})
check('removal persists in summary', await page.locator('.saved-weather button').count(),2)
await browser.close(); server.close()
const failed = results.filter(r=>!r.pass)
console.log(`${results.length-failed.length}/${results.length} passed`)
if(failed.length) process.exit(1)
