import { useMemo } from 'react'
import { iconFor } from '../lib/weatherCodes.js'
import { parseLocalIso, roundTemp, clamp } from '../lib/format.js'

/**
 * Next 24 hours, horizontally scrollable.
 *
 * The temperature line is drawn as a single SVG polyline behind the columns
 * rather than per-cell bars, so the shape of the day reads at a glance. Its
 * vertical scale is the window's own min/max — an absolute scale would flatten
 * a mild day into a straight line.
 */

const CHART_H = 34

function hourLabel(iso, isNow) {
  if (isNow) return 'Now'
  const parsed = parseLocalIso(iso)
  if (!parsed) return '—'
  return parsed.asLocalDate
    .toLocaleTimeString(undefined, { hour: 'numeric' })
    .replace(/\s?([AP])M/i, (_, m) => m.toLowerCase() + 'm')
}

export default function HourlyStrip({ hours, units }) {
  const temps = useMemo(() => hours.map((h) => h.temperature).filter(Number.isFinite), [hours])

  const { min, span } = useMemo(() => {
    if (!temps.length) return { min: 0, span: 1 }
    const lo = Math.min(...temps)
    const hi = Math.max(...temps)
    return { min: lo, span: Math.max(hi - lo, 1) }
  }, [temps])

  if (!hours.length) return null

  const y = (t) => CHART_H - clamp((t - min) / span, 0, 1) * (CHART_H - 8) - 4

  return (
    <section className="hourly" aria-label="Hourly forecast for the next 24 hours">
      <div className="hourly__head">
        <span className="metric__label">Next 24 hours</span>
        <span className="hourly__hint">Scroll for more</span>
      </div>

      <div className="hourly__scroller">
        <div className="hourly__inner" style={{ '--hour-count': hours.length }}>
        <ol className="hourly__list">
          {hours.map((h) => {
            const chance = Number.isFinite(h.precipChance) ? h.precipChance : 0
            return (
              <li key={h.time} className={`hour ${h.isNow ? 'hour--now' : ''}`}>
                <span className="hour__time">{hourLabel(h.time, h.isNow)}</span>
                <span className="hour__icon" aria-hidden="true">
                  {iconFor(h.weatherCode, h.isDay)}
                </span>
                <span className="hour__temp">
                  {roundTemp(h.temperature) ?? '—'}
                  {units.tempSuffix}
                </span>
                <span className={`hour__chance ${chance >= 20 ? 'hour__chance--on' : ''}`}>
                  {chance >= 20 ? `${chance}%` : ''}
                </span>
              </li>
            )
          })}
        </ol>

        {/* Its own band rather than a backdrop behind the columns: overlapping
            text put the precip percentages below WCAG AA on dark themes.
            Decorative — the same temperatures are read out per column above. */}
        <svg
          className="hourly__spark"
          viewBox={`0 0 ${hours.length * 10} ${CHART_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            className="hourly__line"
            points={hours
              .map((h, i) => (Number.isFinite(h.temperature) ? `${i * 10 + 5},${y(h.temperature)}` : null))
              .filter(Boolean)
              .join(' ')}
          />
        </svg>
        </div>
      </div>
    </section>
  )
}
