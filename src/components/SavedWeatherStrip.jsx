import { useLayoutEffect, useRef, useState } from 'react'
import useSavedWeather from '../hooks/useSavedWeather.js'
import { SAVED_WEATHER_MAX_AGE_MS } from '../lib/savedWeather.js'
import BookmarkIcon from './BookmarkIcon.jsx'

const GAP = 8 // keep in step with .saved-weather { gap }

/**
 * Simulate flex-wrap for a list of pill widths and return how many rows it needs.
 * Widths come from the hidden measuring row, so this matches real layout.
 */
function rowsNeeded(widths, available) {
  let rows = 0
  let used = Infinity
  for (const w of widths) {
    if (used + GAP + w > available) {
      rows += 1
      used = w
    } else {
      used += GAP + w
    }
  }
  return rows
}

/**
 * Pick which pills stay visible when collapsed: favorites in their saved order,
 * stopping before the "+N more" pill would push past `maxRows`. The active
 * location is reserved first so it is always on screen.
 */
function pickVisible(places, widths, moreWidth, activeKey, available, maxRows) {
  const all = places.map((p) => widths[p.key] ?? 0)
  if (rowsNeeded(all, available) <= maxRows) return null // everything fits

  const keep = new Set(activeKey && widths[activeKey] != null ? [activeKey] : [])
  const fits = (keys) => {
    const list = places.filter((p) => keys.has(p.key)).map((p) => widths[p.key])
    return rowsNeeded([...list, moreWidth], available) <= maxRows
  }
  for (const p of places) {
    if (keep.has(p.key)) continue
    const next = new Set(keep).add(p.key)
    if (!fits(next)) break
    keep.add(p.key)
  }
  return keep
}

export default function SavedWeatherStrip({ favorites, activeKey, unitId, onSelect, maxRows = 2 }) {
  const weather = useSavedWeather(favorites)
  const [expanded, setExpanded] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState(null)
  const [width, setWidth] = useState(0)
  const sectionRef = useRef(null)
  const measureRef = useRef(null)

  const pills = favorites.map((place) => {
    const entry = weather[place.key]
    const ready = entry?.status === 'ready' && Date.now() - entry.time <= SAVED_WEATHER_MAX_AGE_MS
    const temperature = ready && Number.isFinite(entry.temperature)
      ? `${Math.round(unitId === 'metric' ? entry.temperature : entry.temperature * 9 / 5 + 32)}°${unitId === 'metric' ? 'C' : 'F'}`
      : '—'
    const condition = ready ? entry.condition : entry ? 'Unavailable' : 'Loading…'
    const detail = ready
      ? `Open-Meteo model conditions · ${new Date(entry.time).toLocaleString()}. Refreshes every 10 minutes.`
      : entry ? 'Weather unavailable. Retrying automatically every 10 minutes.' : 'Loading current weather.'
    return { place, temperature, condition, detail }
  })

  // Track the strip's own width; pills wrap within it rather than scrolling.
  useLayoutEffect(() => {
    const el = sectionRef.current
    if (!el) return undefined
    const read = () => setWidth(el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight))
    read()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [favorites.length > 0])

  // Measure every pill (hidden copies, same styles) and decide what fits in maxRows.
  const signature = pills.map((p) => `${p.place.key}|${p.place.name}|${p.temperature}|${p.condition}`).join('§')
  useLayoutEffect(() => {
    const box = measureRef.current
    if (!box || !width) return
    const widths = {}
    box.querySelectorAll('[data-measure-key]').forEach((n) => {
      widths[n.dataset.measureKey] = n.getBoundingClientRect().width
    })
    const moreWidth = box.querySelector('[data-measure-more]')?.getBoundingClientRect().width ?? 0
    const next = pickVisible(favorites, widths, moreWidth, activeKey, width, maxRows)
    setVisibleKeys((prev) => {
      const same = prev === next || (prev && next && prev.size === next.size && [...next].every((k) => prev.has(k)))
      return same ? prev : next
    })
  }, [signature, activeKey, width, maxRows, favorites])

  if (!favorites.length) return null

  const collapsible = visibleKeys !== null
  const shown = collapsible && !expanded ? pills.filter((p) => visibleKeys.has(p.place.key)) : pills
  const hiddenCount = pills.length - shown.length

  const pillContent = (p) => (
    <>
      <BookmarkIcon filled className="saved-weather__icon" />
      <span className="saved-weather__name">{p.place.name}</span>
      <strong>{p.temperature}</strong>
      <span className="saved-weather__condition">{p.condition}</span>
    </>
  )

  return (
    <section
      ref={sectionRef}
      id="saved-weather"
      className={`saved-weather ${collapsible && expanded ? 'saved-weather--expanded' : ''}`}
      aria-label="Saved locations — current model weather"
    >
      {shown.map((p) => (
        <button type="button" key={p.place.key} className="saved-weather__pill"
          aria-pressed={activeKey === p.place.key}
          aria-label={`${p.place.label || p.place.name}, ${p.temperature}, ${p.condition}. ${p.detail}`}
          title={`${p.place.label || p.place.name} · ${p.condition} · ${p.detail}`} onClick={() => onSelect(p.place)}>
          {pillContent(p)}
        </button>
      ))}
      {collapsible ? (
        <button
          type="button"
          className="saved-weather__pill saved-weather__more"
          aria-expanded={expanded}
          aria-controls="saved-weather"
          aria-label={expanded ? 'Show fewer saved locations' : `Show ${hiddenCount} more saved location${hiddenCount === 1 ? '' : 's'}`}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : `+${hiddenCount} more`}
        </button>
      ) : null}

      {/* Off-screen copies used only to measure pill widths for the 2-row fit. */}
      <div ref={measureRef} className="saved-weather__measure" aria-hidden="true">
        {pills.map((p) => (
          <span key={p.place.key} data-measure-key={p.place.key} className="saved-weather__pill">
            {pillContent(p)}
          </span>
        ))}
        <span data-measure-more="" className="saved-weather__pill saved-weather__more">
          +{Math.max(pills.length, 10)} more
        </span>
      </div>
    </section>
  )
}
