import { describeCode, iconFor } from '../lib/weatherCodes.js'
import { formatTemp, formatClock, parseLocalIso } from '../lib/format.js'
import ConditionBadges from './ConditionBadges.jsx'
import CloudMeter from './CloudMeter.jsx'
import WindDial from './WindDial.jsx'
import SunArc from './SunArc.jsx'

export default function CurrentCard({
  place,
  current,
  today,
  units,
  timezone,
  isFavorite,
  onToggleFavorite,
}) {
  const condition = describeCode(current.weatherCode)
  const nowMinutes = parseLocalIso(current.time)?.minutesOfDay ?? null

  return (
    <section className="current" aria-label="Current conditions">
      <header className="current__head">
        <div className="current__identity">
          <div className="current__title">
            <h1 className="current__place">{place.label}</h1>
            <button
              type="button"
              className={`star ${isFavorite ? 'star--on' : ''}`}
              onClick={onToggleFavorite}
              aria-pressed={isFavorite}
              title={isFavorite ? 'Remove from saved locations' : 'Save this location'}
            >
              <span aria-hidden="true">{isFavorite ? '★' : '☆'}</span>
              <span className="visually-hidden">
                {isFavorite ? `Remove ${place.name} from saved locations` : `Save ${place.name}`}
              </span>
            </button>
          </div>
          <p className="current__meta">
            Local time {formatClock(current.time)}
            {timezone ? <span className="current__tz"> · {timezone.replace(/_/g, ' ')}</span> : null}
          </p>
        </div>
        <span className="current__icon" aria-hidden="true">
          {iconFor(current.weatherCode, current.isDay)}
        </span>
      </header>

      <div className="current__reading">
        <p className="current__temp">
          {formatTemp(current.temperature, units)}
          <span className="current__unit">{units.symbol}</span>
        </p>
        <div className="current__summary">
          <p className="current__condition">{condition.label}</p>
          <p className="current__feels">Feels like {formatTemp(current.feelsLike, units)}</p>
          {today ? (
            <p className="current__range">
              H {formatTemp(today.tempMax, units)} · L {formatTemp(today.tempMin, units)}
            </p>
          ) : null}
        </div>
      </div>

      <ConditionBadges
        code={current.weatherCode}
        rain={current.rain}
        showers={current.showers}
        snow={current.snowfall}
        units={units}
        size="lg"
      />

      <div className="current__panels">
        <div className="panel">
          <CloudMeter percent={current.cloudCover} caption="Cloud cover now" />
        </div>

        <div className="panel">
          <span className="metric__label">Wind</span>
          <WindDial
            direction={current.windDirection}
            speed={current.windSpeed}
            gusts={current.windGusts}
            units={units}
          />
        </div>

        <div className="panel panel--wide">
          <span className="metric__label">Sun</span>
          {today ? (
            <SunArc
              sunrise={today.sunrise}
              sunset={today.sunset}
              daylightSeconds={today.daylightSeconds}
              sunshineSeconds={today.sunshineSeconds}
              nowMinutes={nowMinutes}
            />
          ) : null}
        </div>
      </div>

      <dl className="stats">
        <div className="stat">
          <dt>Humidity</dt>
          <dd>{Number.isFinite(current.humidity) ? `${Math.round(current.humidity)}%` : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Pressure</dt>
          <dd>{Number.isFinite(current.pressure) ? `${Math.round(current.pressure)} hPa` : '—'}</dd>
        </div>
        <div className="stat">
          <dt>UV index</dt>
          <dd>{Number.isFinite(today?.uvIndexMax) ? Math.round(today.uvIndexMax) : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Rain chance</dt>
          <dd>{Number.isFinite(today?.precipChance) ? `${today.precipChance}%` : '—'}</dd>
        </div>
      </dl>
    </section>
  )
}
