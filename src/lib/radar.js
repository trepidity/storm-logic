/**
 * RainViewer radar frames.
 *
 * Keyless, like Open-Meteo — one JSON index listing the frames currently
 * available, then a tile pyramid per frame. Attribution is required and the
 * free tier is non-commercial, which matches the ceiling Open-Meteo already
 * puts on this project.
 */

const INDEX_URL = 'https://api.rainviewer.com/public/weather-maps.json'

/**
 * Tile size is a trap. RainViewer serves 256 and 512 pyramids, and the size in
 * the path must agree with Leaflet's `tileSize`. Using 512 additionally needs
 * `zoomOffset: -1`, or the radar renders at double scale against the basemap.
 * We use 256 and keep the two in lockstep via this constant.
 */
export const TILE_SIZE = 256

/** 0–8. 4 (Universal Blue) stays legible over a dark basemap. */
export const COLOR_SCHEME = 4

export function tileUrlTemplate(host, path, { size = TILE_SIZE, color = COLOR_SCHEME, smooth = 1, snow = 1 } = {}) {
  return `${host}${path}/${size}/{z}/{x}/{y}/${color}/${smooth}_${snow}.png`
}

/** Flatten the index into one ordered list, tagging which frames are forecast. */
export function normaliseFrames(payload) {
  const past = (payload?.radar?.past ?? []).map((f) => ({ time: f.time, path: f.path, future: false }))
  const nowcast = (payload?.radar?.nowcast ?? []).map((f) => ({ time: f.time, path: f.path, future: true }))
  const frames = [...past, ...nowcast].filter((f) => typeof f.path === 'string' && Number.isFinite(f.time))

  return {
    host: payload?.host ?? '',
    frames,
    // Index of the most recent observation — where the loop should start, so
    // the first thing shown is now rather than two hours ago.
    nowIndex: Math.max(past.length - 1, 0),
  }
}

export async function fetchRadarFrames(signal) {
  const res = await fetch(INDEX_URL, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Radar service returned ${res.status}`)

  const data = normaliseFrames(await res.json())
  if (!data.host || !data.frames.length) throw new Error('No radar frames available')
  return data
}

/**
 * Choose which frame stays selected when the index window shifts.
 *
 * The index is a moving window: a refresh publishes a newer frame and drops
 * the oldest, so the same array position is a different moment afterwards.
 * Selection therefore survives by frame identity (`path`), never by index.
 *
 * Three cases, in priority order:
 *   1. First load, or the previous selection aged out of the window entirely —
 *      land on the latest observation.
 *   2. The viewer was sitting on the live edge — follow it forward, which is
 *      the whole point of refreshing.
 *   3. The viewer deliberately scrubbed back — stay exactly where they put
 *      themselves.
 *
 * @returns {number} an index into `next`; 0 when `next` is empty.
 */
export function reconcileFrameSelection({ previous = [], previousPath = null, next = [] } = {}) {
  if (next.length === 0) return 0

  const latestIndex = next.reduce((latest, frame, at) => (frame.future ? latest : at), 0)
  if (previous.length === 0 || previousPath === null) return latestIndex

  const previousLatest = [...previous].reverse().find((frame) => !frame.future)?.path ?? null
  if (previousPath === previousLatest) return latestIndex

  const kept = next.findIndex((frame) => frame.path === previousPath)
  return kept < 0 ? latestIndex : kept
}

export function frameClock(unix) {
  if (!Number.isFinite(unix)) return '—'
  return new Date(unix * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
