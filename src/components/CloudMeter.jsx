import { cloudLabel, clamp } from '../lib/format.js'

const R = 34
const CIRCUMFERENCE = 2 * Math.PI * R

export default function CloudMeter({ percent, caption = 'Cloud cover' }) {
  const value = Number.isFinite(percent) ? clamp(percent, 0, 100) : null
  const dash = value === null ? 0 : (value / 100) * CIRCUMFERENCE

  return (
    <div className="cloud">
      <div className="cloud__ring">
        <svg viewBox="0 0 80 80" role="img" aria-label={`${caption}: ${value ?? '—'} percent`}>
          <circle className="cloud__track" cx="40" cy="40" r={R} />
          <circle
            className="cloud__value"
            cx="40"
            cy="40"
            r={R}
            strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
            transform="rotate(-90 40 40)"
          />
        </svg>
        <span className="cloud__percent">{value === null ? '—' : `${Math.round(value)}%`}</span>
      </div>
      <div className="cloud__text">
        <span className="metric__label">{caption}</span>
        <span className="cloud__desc">{cloudLabel(value)}</span>
      </div>
    </div>
  )
}
