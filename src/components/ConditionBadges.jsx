import { hasHail, isSnowCode, isRainCode, isThunderCode, isFreezing } from '../lib/weatherCodes.js'
import { formatPrecip } from '../lib/format.js'

/**
 * Precipitation-type badges.
 *
 * Rain and snow come from measured amounts (rain/showers/snowfall). Hail has no
 * measured variable anywhere in Open-Meteo — it exists only as WMO codes 96/99 —
 * so the hail badge is code-derived and labelled as a risk, not an amount.
 */
export default function ConditionBadges({
  code,
  rain = 0,
  showers = 0,
  snow = 0,
  units,
  size = 'md',
  /**
   * Optional verdict from summariseDay: 'likely' | 'possible' | 'none'.
   * Daily rows pass this because the daily weather code is a max, not a
   * representative value — without it a 2%-chance day shows a Rain badge.
   * Current conditions omit it: an observation is not a probability.
   */
  precip,
}) {
  const badges = []
  const rainTotal = (Number(rain) || 0) + (Number(showers) || 0)
  const snowTotal = Number(snow) || 0

  if (precip === 'none') {
    return (
      <ul className={`badges badges--${size}`}>
        <li className="badge badge--dry">
          <span aria-hidden="true">🌂</span>
          <span>No precip</span>
        </li>
      </ul>
    )
  }

  if (precip === 'possible') {
    const snowy = isSnowCode(code) || snowTotal > 0
    return (
      <ul className={`badges badges--${size}`}>
        <li className={`badge badge--${snowy ? 'snow' : 'rain'}`}>
          <span aria-hidden="true">{snowy ? '❄️' : '💧'}</span>
          <span>{snowy ? 'Snow possible' : 'Rain possible'}</span>
          {formatPrecip(snowy ? snowTotal : rainTotal, units) ? (
            <span className="badge__detail">{formatPrecip(snowy ? snowTotal : rainTotal, units)}</span>
          ) : null}
        </li>
        {isThunderCode(code) ? (
          <li className="badge badge--thunder">
            <span aria-hidden="true">⚡</span>
            <span>Storms possible</span>
          </li>
        ) : null}
      </ul>
    )
  }

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
