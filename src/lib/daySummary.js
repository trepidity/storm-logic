import { describeCode, hasHail, isSnowCode, isThunderCode, GROUPS } from './weatherCodes.js'
import { cloudLabel } from './format.js'

/**
 * Turn a day's numbers into an honest one-line condition.
 *
 * Why this exists: Open-Meteo's daily `weather_code` is the most *severe* code
 * observed during the day, not a representative one. A single hour carrying
 * code 51 brands the whole day "Drizzle" even when precipitation probability is
 * 2% and the accumulation is zero — which is what a user reads as a bug, and
 * fairly so. The same aggregation makes days read "Overcast" when mean cloud
 * cover is 45%.
 *
 * So the code is used only to decide the *type* of precipitation (rain vs snow
 * vs thunder). Whether to mention precipitation at all is decided by
 * probability, accumulation and duration — and when precipitation isn't
 * credible, the day is described by its cloud cover instead.
 */

// Probability at which precipitation is stated plainly.
const LIKELY = 40
// Below this, precipitation isn't mentioned at all.
const POSSIBLE = 20
// Snow is disruptive out of proportion to its probability, so it hedges lower.
const SNOW_POSSIBLE = 15

const CLOUD_ICONS = [
  { max: 12, icon: '☀️' },
  { max: 35, icon: '🌤️' },
  { max: 65, icon: '⛅' },
  { max: 88, icon: '🌥️' },
  { max: 101, icon: '☁️' },
]

function cloudIcon(percent) {
  if (!Number.isFinite(percent)) return '☁️'
  return CLOUD_ICONS.find((c) => percent < c.max)?.icon ?? '☁️'
}

export function summariseDay(day) {
  const code = day.weatherCode
  const entry = describeCode(code)

  const chance = Number.isFinite(day.precipChance) ? day.precipChance : 0
  const hours = Number.isFinite(day.precipHours) ? day.precipHours : 0
  const total = Number.isFinite(day.precipSum) ? day.precipSum : 0
  const snow = Number.isFinite(day.snowSum) ? day.snowSum : 0

  // Corroboration: a probability on its own can be noise. Something has to
  // actually be forecast to fall.
  const corroborated = total > 0 || hours >= 1

  const snowy = isSnowCode(code) || snow > 0
  const stormy = isThunderCode(code)

  const likely = chance >= LIKELY && corroborated
  const possible = !likely && chance >= (snowy ? SNOW_POSSIBLE : POSSIBLE) && corroborated

  // Cloud cover is the fallback description, and it's the daytime mean rather
  // than the 24h mean — overnight cloud isn't what anyone means by "today".
  const cloud = Number.isFinite(day.cloudCoverDay) ? day.cloudCoverDay : day.cloudCoverMean

  if (likely) {
    return {
      label: entry.label,
      short: entry.short,
      icon: entry.day,
      group: entry.group,
      precip: 'likely',
      hail: hasHail(code),
      thunder: stormy,
    }
  }

  if (possible) {
    const short = snowy ? 'Chance of snow' : stormy ? 'Isolated storms' : 'Chance of rain'
    return {
      label: snowy
        ? 'A chance of snow'
        : stormy
          ? 'Isolated thunderstorms'
          : 'A chance of rain',
      short,
      icon: snowy ? '🌨️' : stormy ? '🌩️' : '🌦️',
      group: snowy ? GROUPS.SNOW : stormy ? GROUPS.THUNDER : GROUPS.RAIN,
      precip: 'possible',
      hail: hasHail(code),
      thunder: stormy,
    }
  }

  // Nothing credible falling — describe the sky.
  const label = cloudLabel(cloud)
  return {
    label,
    short: label,
    icon: cloudIcon(cloud),
    group: cloud >= 65 ? GROUPS.CLOUD : GROUPS.CLEAR,
    precip: 'none',
    hail: false,
    thunder: false,
  }
}
