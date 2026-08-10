import { hasHail, isSnowCode, isRainCode, isThunderCode, isFreezing } from '../lib/weatherCodes.js'
import { formatPrecip } from '../lib/format.js'

/**
 * Precipitation-type badges.
 *
 * Rain and snow come from measured amounts (rain/showers/snowfall). Hail has no
 * measured variable anywhere in Open-Meteo — it exists only as WMO codes 96/99 —
 * so the hail badge is code-derived and labelled as a risk, not an amount.
 */
export default function ConditionBadges({ code, rain = 0, showers = 0, snow = 0, units, size = 'md' }) {
  const badges = []
  const rainTotal = (Number(rain) || 0) + (Number(showers) || 0)
  const snowTotal = Number(snow) || 0

  if (rainTotal > 0 || isRainCode(code)) {
    badges.push({
      key: 'rain',
      icon: '💧',
      label: 'Rain',
      detail: formatPrecip(rainTotal, units),
      tone: 'rain',
    })
  }

  if (snowTotal > 0 || isSnowCode(code)) {
    badges.push({
      key: 'snow',
      icon: '❄️',
      label: 'Snow',
      detail: formatPrecip(snowTotal, units),
      tone: 'snow',
    })
  }

  if (isThunderCode(code)) {
    badges.push({ key: 'thunder', icon: '⚡', label: 'Thunder', tone: 'thunder' })
  }

  if (hasHail(code)) {
    badges.push({ key: 'hail', icon: '🧊', label: 'Hail risk', tone: 'hail' })
  }

  if (isFreezing(code)) {
    badges.push({ key: 'ice', icon: '🧊', label: 'Freezing', tone: 'ice' })
  }

  if (!badges.length) {
    badges.push({ key: 'dry', icon: '🌂', label: 'No precip', tone: 'dry' })
  }

  return (
    <ul className={`badges badges--${size}`}>
      {badges.map((b) => (
        <li key={b.key} className={`badge badge--${b.tone}`}>
          <span aria-hidden="true">{b.icon}</span>
          <span>{b.label}</span>
          {b.detail ? <span className="badge__detail">{b.detail}</span> : null}
        </li>
      ))}
    </ul>
  )
}
