/**
 * L0 rendered-product proof for the live local Netlify runtime.
 *
 * Requires `npm run dev:netlify` first. No routes are intercepted: the page,
 * redirects, functions, adapters, and live providers must all work together.
 */

import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.LOCAL_RUNTIME_URL ?? 'http://127.0.0.1:8888').replace(/\/$/, '')
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
})

try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.locator('.tabs button', { hasText: 'Radar' }).click()
  await page.waitForSelector('.radar__layer[data-layer-id="storm-reports"]', { timeout: 30_000 })
  await page.waitForFunction(
    () => [...document.querySelectorAll('.radar__layer')].every((element) => !element.classList.contains('radar__layer--unavailable')),
    { timeout: 30_000 },
  )

  const layers = await page.locator('.radar__layer').evaluateAll((elements) => elements.map((element) => ({
    id: element.getAttribute('data-layer-id'),
    source: element.querySelector('.radar__layer-source')?.textContent?.trim(),
    time: element.querySelector('.radar__layer-time')?.textContent?.trim(),
    unavailable: element.classList.contains('radar__layer--unavailable'),
  })))

  assert.equal(layers.length, 4, 'Radar must render all four Severe Desk layer controls')
  assert.equal(layers.some((layer) => layer.unavailable), false, `live local runtime cannot leave a source unavailable: ${JSON.stringify(layers)}`)
  assert.equal(layers.every((layer) => layer.source && layer.time && !layer.time.includes('unavailable')), true, `each live layer must disclose source and source time: ${JSON.stringify(layers)}`)
  assert.deepEqual(errors, [], `live local Radar must have no page errors: ${errors.join('; ')}`)

  console.log(`Severe Desk rendered local-runtime proof: ${layers.length}/4 live layers passed (${baseUrl})`)
} finally {
  await browser.close()
}
