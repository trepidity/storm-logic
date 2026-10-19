// Current model conditions only: never infer rain from forecast probability.
export const SAVED_WEATHER_REFRESH_MS = 10 * 60 * 1000
export const SAVED_WEATHER_MAX_AGE_MS = 30 * 60 * 1000

export async function fetchSavedWeather(place, signal) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: place.latitude, longitude: place.longitude,
    current: 'temperature_2m,precipitation,rain,showers,snowfall',
    temperature_unit: 'celsius', precipitation_unit: 'mm', timeformat: 'unixtime',
    forecast_days: '1',
  })
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('Current weather unavailable')
  const { current } = await response.json()
  const time = Number.isFinite(current?.time) ? current.time * 1000 : NaN
  if (!Number.isFinite(time) || Date.now() - time > SAVED_WEATHER_MAX_AGE_MS || time > Date.now() + 5 * 60 * 1000) {
    throw new Error('Current weather unavailable')
  }
  return { temperature: current.temperature_2m, condition: precipitationLabel(current), time }
}

function precipitationLabel(current) {
  const valid = value => Number.isFinite(value) && value >= 0
  const { precipitation, rain, showers, snowfall } = current
  const liquid = (valid(rain) && rain > 0) || (valid(showers) && showers > 0)
  const snow = valid(snowfall) && snowfall > 0
  if (liquid && snow) return 'Rain + snow'
  if (snow) return 'Snow'
  if (liquid) return 'Rain'
  if (valid(precipitation) && precipitation === 0) return 'Dry'
  if (valid(precipitation) && precipitation > 0) return 'Precipitation'
  return 'Precip unavailable'
}
