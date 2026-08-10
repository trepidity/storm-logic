import { formatClock, formatDuration, parseLocalIso, clamp } from '../lib/format.js'

/**
 * Compact sun panel.
 *
 * This was a large arc, which spent most of its height on empty sky. The same
 * information — sunrise, sunset, and where the current moment sits between them
 * — fits in a single track, leaving room for the hourly strip.
 */
export default function SunArc({ sunrise, sunset, daylightSeconds, sunshineSeconds, nowMinutes }) {
  const rise = parseLocalIso(sunrise)
  const set = parseLocalIso(sunset)

  let progress = null
  if (rise && set && set.minutesOfDay > rise.minutesOfDay && Number.isFinite(nowMinutes)) {
    progress = (nowMinutes - rise.minutesOfDay) / (set.minutesOfDay - rise.minutesOfDay)
  }

  const daytime = progress !== null && progress >= 0 && progress <= 1
  const position = daytime ? clamp(progress, 0, 1) * 100 : null

  const sunshineRatio =
    Number.isFinite(sunshineSeconds) && Number.isFinite(daylightSeconds) && daylightSeconds > 0
      ? clamp(sunshineSeconds / daylightSeconds, 0, 1)
      : null

  return (
    <div className="sun">
      <div
        className="sun__track"
        role="img"
        aria-label={`Sunrise ${formatClock(sunrise)}, sunset ${formatClock(sunset)}`}
      >
        <span className="sun__rail" />
        {position !== null ? (
          <>
            <span className="sun__elapsed" style={{ width: `${position}%` }} />
            <span className="sun__dot" style={{ left: `${position}%` }} />
          </>
        ) : null}
      </div>

      <div className="sun__times">
        <div>
          <span className="sun__value">{formatClock(sunrise)}</span>
          <span className="sun__label">Sunrise</span>
        </div>
        <div className="sun__middle">
          <span className="sun__value">{formatDuration(daylightSeconds)}</span>
          <span className="sun__label">
            {sunshineRatio !== null ? `${Math.round(sunshineRatio * 100)}% sun` : 'Daylight'}
          </span>
        </div>
        <div className="sun__right">
          <span className="sun__value">{formatClock(sunset)}</span>
          <span className="sun__label">Sunset</span>
        </div>
      </div>
    </div>
  )
}
