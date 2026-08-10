import { useEffect, useState } from 'react'
import { fetchAlerts } from '../lib/api.js'

function formatAlertTime(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!match) return 'Unknown'

  const [, year, month, day, hour, minute] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  const dateLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
  const hourNumber = Number(hour)
  const clock = `${hourNumber % 12 || 12}:${minute}${hourNumber >= 12 ? 'pm' : 'am'}`
  return `${dateLabel}, ${clock}`
}

function severityClass(severity) {
  return `alert--${String(severity ?? 'unknown').toLowerCase().replace(/[^a-z]+/g, '-')}`
}

function AlertCard({ alert }) {
  const metadata = [alert.severity, alert.urgency, alert.certainty].filter(Boolean).join(' · ')
  return (
    <article className={`alert ${severityClass(alert.severity)}`}>
      <div className="alert__head">
        <div>
          <p className="alert__event">{alert.event}</p>
          <h2>{alert.headline}</h2>
        </div>
        <span className="alert__severity">{alert.severity}</span>
      </div>
      {metadata ? <p className="alert__meta">{metadata}</p> : null}
      <dl className="alert__times">
        <div>
          <dt>Effective</dt>
          <dd>{formatAlertTime(alert.effective)}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{formatAlertTime(alert.expires)}</dd>
        </div>
      </dl>
      {alert.area ? <p className="alert__area">Area: {alert.area}</p> : null}
      {alert.description || alert.instruction || alert.sourceUrl ? (
        <details className="alert__details">
          <summary>Alert details</summary>
          {alert.description ? <p>{alert.description}</p> : null}
          {alert.instruction ? <p><strong>Instructions:</strong> {alert.instruction}</p> : null}
          {alert.sourceUrl ? (
            <a href={alert.sourceUrl} target="_blank" rel="noreferrer noopener">
              View official NWS alert
            </a>
          ) : null}
        </details>
      ) : null}
    </article>
  )
}

export default function AlertsPanel({ place }) {
  const [state, setState] = useState({ status: 'loading', alerts: [], errorCode: null })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading', alerts: [], errorCode: null })

    fetchAlerts({ latitude: place.latitude, longitude: place.longitude }, controller.signal)
      .then((alerts) => setState({ status: 'ready', alerts, errorCode: null }))
      .catch((error) => {
        if (error.name === 'AbortError') return
        setState({ status: 'error', alerts: [], errorCode: error.code ?? null })
      })

    return () => controller.abort()
  }, [place.latitude, place.longitude])

  return (
    <section className="alerts" aria-labelledby="alerts-title">
      <header className="alerts__head">
        <div>
          <p className="alerts__eyebrow">National Weather Service</p>
          <h1 id="alerts-title">Alerts for {place.name}</h1>
        </div>
        <a href="https://www.weather.gov/" target="_blank" rel="noreferrer noopener">
          NWS.gov
        </a>
      </header>

      {state.status === 'loading' ? (
        <div className="alerts__state" role="status">
          <span className="state__spinner" aria-hidden="true" />
          <p>Checking active alerts…</p>
        </div>
      ) : null}

      {state.status === 'ready' && state.alerts.length === 0 ? (
        <div className="alerts__empty" role="status">
          <p>No active NWS watches, warnings, or advisories for this location.</p>
        </div>
      ) : null}

      {state.status === 'ready' && state.alerts.length > 0 ? (
        <div className="alerts__list">
          {state.alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className="alerts__unavailable" role="status">
          <p>
            {state.errorCode === 'coverage'
              ? 'NWS alerts are available only for locations in U.S. coverage.'
              : 'NWS alert status is temporarily unavailable. Check official sources for urgent conditions.'}
          </p>
        </div>
      ) : null}
    </section>
  )
}
