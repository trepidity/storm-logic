import { summariseDay } from '../lib/daySummary.js'
import {
  formatTemp,
  formatDayName,
  formatShortDate,
  formatClock,
  formatWind,
  formatPrecip,
  compassPoint,
  cloudLabel,
  roundTemp,
  clamp,
} from '../lib/format.js'
import ConditionBadges from './ConditionBadges.jsx'

/** Position the day's high/low as a segment of the whole 10-day range. */
function rangeStyle(day, scaleMin, scaleMax) {
  const span = scaleMax - scaleMin
  if (!Number.isFinite(span) || span <= 0) return { left: '0%', width: '100%' }
  const left = clamp(((day.tempMin - scaleMin) / span) * 100, 0, 100)
  const right = clamp(((day.tempMax - scaleMin) / span) * 100, 0, 100)
  return { left: `${left}%`, width: `${Math.max(right - left, 4)}%` }
}

export default function DayRow({ day, index, units, scaleMin, scaleMax, expanded, onToggle }) {
  // Derived from the day's numbers, not from Open-Meteo's daily weather_code —
  // see src/lib/daySummary.js for why the raw code cannot be trusted here.
  const summary = summariseDay(day)
  const rainTotal = (day.rainSum || 0) + (day.showersSum || 0)
  const cloud = Number.isFinite(day.cloudCoverDay) ? day.cloudCoverDay : day.cloudCoverMean
  const panelId = `day-detail-${index}`

  return (
    <li className={`day ${expanded ? 'day--open' : ''}`}>
      <button
        type="button"
        className="day__summary"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <span className="day__name">
          <strong>{formatDayName(day.date, index)}</strong>
          <small>{formatShortDate(day.date)}</small>
        </span>

        <span className="day__icon" aria-hidden="true">
          {summary.icon}
        </span>

        <span className="day__condition">{summary.short}</span>

        <span className="day__chance" title="Chance of precipitation">
          {Number.isFinite(day.precipChance) && day.precipChance > 0 ? `${day.precipChance}%` : '—'}
        </span>

        <span className="day__temps">
          <span className="day__low">{roundTemp(day.tempMin)}°</span>
          <span className="day__track">
            <span className="day__fill" style={rangeStyle(day, scaleMin, scaleMax)} />
          </span>
          <span className="day__high">{roundTemp(day.tempMax)}°</span>
        </span>

        <span className="day__chevron" aria-hidden="true">
          ⌄
        </span>
      </button>

      <div className="day__detail" id={panelId} hidden={!expanded}>
        <ConditionBadges
          code={day.weatherCode}
          rain={rainTotal}
          showers={0}
          snow={day.snowSum}
          units={units}
          size="sm"
          precip={summary.precip}
        />

        <div className="day__grid">
          <div className="metric">
            <span className="metric__label">Cloud cover</span>
            <span className="metric__value">{Number.isFinite(cloud) ? `${cloud}%` : '—'}</span>
            <span className="metric__note">{cloudLabel(cloud)} · daylight avg</span>
          </div>

          <div className="metric">
            <span className="metric__label">Wind</span>
            <span className="metric__value">{formatWind(day.windMax, units)}</span>
            <span className="metric__note">
              from {compassPoint(day.windDirection)} · gusts {formatWind(day.gustMax, units)}
            </span>
          </div>

          <div className="metric">
            <span className="metric__label">Rain</span>
            <span className="metric__value">{formatPrecip(rainTotal, units) ?? 'None'}</span>
            <span className="metric__note">
              {Number.isFinite(day.precipHours) && day.precipHours > 0
                ? `${Math.round(day.precipHours)} h of precip`
                : 'Dry day'}
            </span>
          </div>

          <div className="metric">
            <span className="metric__label">Snow</span>
            <span className="metric__value">{formatPrecip(day.snowSum, units) ?? 'None'}</span>
            <span className="metric__note">
              {summary.hail ? 'Hail possible in storms' : 'No hail signal'}
            </span>
          </div>

          <div className="metric">
            <span className="metric__label">Sunrise</span>
            <span className="metric__value">{formatClock(day.sunrise)}</span>
            <span className="metric__note">Sunset {formatClock(day.sunset)}</span>
          </div>

          <div className="metric">
            <span className="metric__label">Feels like</span>
            <span className="metric__value">{formatTemp(day.feelsMax, units)}</span>
            <span className="metric__note">Low {formatTemp(day.feelsMin, units)}</span>
          </div>
        </div>
      </div>
    </li>
  )
}
