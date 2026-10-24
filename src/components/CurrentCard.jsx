import { describeCode, iconFor } from '../lib/weatherCodes.js'
import { formatTemp, formatClock, formatPrecipTotal, parseLocalIso } from '../lib/format.js'
import { formatApproxHour, precipTiming } from '../lib/precipTiming.js'
import ConditionBadges from './ConditionBadges.jsx'
import CloudMeter from './CloudMeter.jsx'
import WindDial from './WindDial.jsx'
import SunArc from './SunArc.jsx'
import HourlyStrip from './HourlyStrip.jsx'
import AqiStat from './AqiStat.jsx'
import BookmarkIcon from './BookmarkIcon.jsx'

export default function CurrentCard({
  place,
  current,
  today,
  hours = [],
  precipLast24h = null,
  precipEvent = null,
  units,
  timezone,
  isFavorite,
  onToggleFavorite,
  controls,
}) {
  const condition = describeCode(current.weatherCode)
  const nowMinutes = parseLocalIso(current.time)?.minutesOfDay ?? null
  const timing = hours.length ? precipTiming(hours) : null
  const firstDryClock = precipEvent?.firstDryAt ? formatApproxHour(precipEvent.firstDryAt) : null

  return (
    <section className="current" aria-label="Current conditions">
      <header className="current__head">
        <div className="current__identity">
          <h1 className="current__place">{place.label}</h1>
          <p className="current__meta">
            Local time {formatClock(current.time)}
            {timezone ? <span className="current__tz"> · {timezone.replace(/_/g, ' ')}</span> : null}
          </p>
        </div>
        {/* Labeled save toggle in the header's top-right corner. It says
          "Saved" / "Save" in words rather than relying on a bare star; the
          weather glyph lives with the condition text below, so the two
          never read as one indicator. */}
        <button
          type="button"
          className={`save-toggle ${isFavorite ? 'save-toggle--on' : ''}`}
          onClick={onToggleFavorite}
          aria-pressed={Boolean(isFavorite)}
          aria-label={isFavorite ? `Saved: ${place.name}` : `Save ${place.name}`}
          title={isFavorite ? 'Saved — tap to remove from saved locations' : 'Save this location'}
        >
          <BookmarkIcon filled={Boolean(isFavorite)} className="save-toggle__icon" />
          <span className="save-toggle__label">{isFavorite ? 'Saved' : 'Save'}</span>
        </button>
      </header>

      <div className="current__hero">
        <div>
          <div className="current__reading">
            <div>
              <p className="current__temp">
                {formatTemp(current.temperature, units)}
                <span className="current__unit">{units.symbol}</span>
              </p>
            </div>
            <div className="current__summary">
              <p className="current__condition">
                <span className="current__icon" aria-hidden="true">
                  {iconFor(current.weatherCode, current.isDay)}
                </span>
                {condition.label}
              </p>
              <p className="current__feels">Feels like {formatTemp(current.feelsLike, units)}</p>
              {today ? (
                <p className="current__range">
                  H {formatTemp(today.tempMax, units)} · L {formatTemp(today.tempMin, units)}
                </p>
              ) : null}
            </div>
          </div>

          {/* Precip badge and unit/refresh controls share one row instead of
              each taking a full row of their own. */}
          <div className="current__toolbar">
            <ConditionBadges
              code={current.weatherCode}
              rain={current.rain}
              showers={current.showers}
              snow={current.snowfall}
              units={units}
              size="lg"
            />
            {controls}
          </div>

          {timing ? (
            <p className="current__precip-timing" role="status">
              {timing.label}
            </p>
          ) : null}

          {precipEvent && firstDryClock ? (
            <p className="current__precip-timing current__precip-event">
              <strong>Precip event</strong>{' '}
              {formatPrecipTotal(precipEvent.soFar, units)} so far · ~
              {formatPrecipTotal(precipEvent.remaining, units)} more expected · ~
              {formatPrecipTotal(precipEvent.total, units)} event total · Drying ~{firstDryClock}
            </p>
          ) : null}
        </div>

      </div>

      <div className="current__panels">
        <div className="panel panel--cloud">
          <CloudMeter percent={current.cloudCover} caption="Cloud cover" captionSuffix=" now" />
        </div>

        <div className="panel panel--wind">
          <span className="metric__label">Wind</span>
          <WindDial
            direction={current.windDirection}
            speed={current.windSpeed}
            gusts={current.windGusts}
            units={units}
          />
        </div>

        <div className="panel panel--sun">
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

      <div className="panel panel--hourly">
        <HourlyStrip hours={hours} units={units} />
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
          <dt>Last 24h</dt>
          <dd title="Total precipitation in the last 24 hours">
            {formatPrecipTotal(precipLast24h, units)}
          </dd>
        </div>
        <div className="stat">
          <dt>Rain chance</dt>
          <dd>{Number.isFinite(today?.precipChance) ? `${today.precipChance}%` : '—'}</dd>
        </div>
        <AqiStat place={place} />
      </dl>
    </section>
  )
}
