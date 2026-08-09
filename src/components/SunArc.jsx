import { formatClock, formatDuration, parseLocalIso, clamp } from '../lib/format.js'

const W = 240
const H = 104
const PAD = 18
const BASE = 88

function arcPoint(progress) {
  // Quadratic bezier evaluated at t for the sun marker.
  const t = clamp(progress, 0, 1)
  const p0 = { x: PAD, y: BASE }
  const p1 = { x: W / 2, y: 2 }
  const p2 = { x: W - PAD, y: BASE }
  const inv = 1 - t
  return {
    x: inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
    y: inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y,
  }
}

export default function SunArc({ sunrise, sunset, daylightSeconds, sunshineSeconds, nowMinutes }) {
  const rise = parseLocalIso(sunrise)
  const set = parseLocalIso(sunset)

  let progress = null
  if (rise && set && set.minutesOfDay > rise.minutesOfDay && Number.isFinite(nowMinutes)) {
    progress = (nowMinutes - rise.minutesOfDay) / (set.minutesOfDay - rise.minutesOfDay)
  }

  const daytime = progress !== null && progress >= 0 && progress <= 1
  const marker = daytime ? arcPoint(progress) : null
  const sunshareRatio =
    Number.isFinite(sunshineSeconds) && Number.isFinite(daylightSeconds) && daylightSeconds > 0
      ? clamp(sunshineSeconds / daylightSeconds, 0, 1)
      : null

  return (
    <div className="sun">
      <svg className="sun__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sunrise ${formatClock(sunrise)}, sunset ${formatClock(sunset)}`}>
        <defs>
          <linearGradient id="sunArcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sun-glow)" stopOpacity="0.42" />
            <stop offset="100%" stopColor="var(--sun-glow)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path
          className="sun__fill"
          d={`M${PAD} ${BASE} Q${W / 2} 2 ${W - PAD} ${BASE} Z`}
          fill="url(#sunArcFill)"
        />
        <path className="sun__horizon" d={`M6 ${BASE} H${W - 6}`} />
        <path className="sun__path" d={`M${PAD} ${BASE} Q${W / 2} 2 ${W - PAD} ${BASE}`} />

        {marker ? (
          <g className="sun__marker" transform={`translate(${marker.x} ${marker.y})`}>
            <circle className="sun__marker-halo" r="11" />
            <circle className="sun__marker-core" r="6" />
          </g>
        ) : null}
      </svg>

      <div className="sun__times">
        <div>
          <span className="sun__label">Sunrise</span>
          <span className="sun__value">{formatClock(sunrise)}</span>
        </div>
        <div className="sun__middle">
          <span className="sun__label">Daylight</span>
          <span className="sun__value">{formatDuration(daylightSeconds)}</span>
          {sunshareRatio !== null ? (
            <span className="sun__sunshine">{Math.round(sunshareRatio * 100)}% sunshine</span>
          ) : null}
        </div>
        <div className="sun__right">
          <span className="sun__label">Sunset</span>
          <span className="sun__value">{formatClock(sunset)}</span>
        </div>
      </div>
    </div>
  )
}
