import { dayOneHazard, normaliseSpcOutlook, unavailableSpcOutlook } from '../adapters/spcOutlook.js'

function validBounds(bounds) {
  return bounds !== null &&
    typeof bounds === 'object' &&
    ['west', 'south', 'east', 'north'].every((key) => Number.isFinite(bounds[key])) &&
    bounds.west < bounds.east &&
    bounds.south < bounds.north
}

export function buildSpcOutlookPath({ hazard, bbox } = {}) {
  if (!dayOneHazard(hazard) || !validBounds(bbox)) return null
  return `/api/severe-desk-spc?${new URLSearchParams({
    day: '1',
    hazard,
    bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
  })}`
}

/** Fetches the approved SPC Day-1 source through its proxy, then normalises it. */
export async function fetchSpcOutlook({ hazard = 'hail', bbox, signal, now = null, selectedAt = null } = {}) {
  const path = buildSpcOutlookPath({ hazard, bbox })
  if (!path) return unavailableSpcOutlook(hazard, 'not-configured')

  const polledAt = typeof now === 'string' && Number.isFinite(Date.parse(now)) ? now : new Date().toISOString()
  try {
    const response = await fetch(path, { signal, headers: { Accept: 'application/json' } })
    if (!response.ok) return unavailableSpcOutlook(hazard)
    const payload = await response.json()
    const receivedAt = typeof now === 'string' && Number.isFinite(Date.parse(now)) ? now : new Date().toISOString()
    return normaliseSpcOutlook(payload, {
      hazard,
      receivedAt,
      polledAt,
      selectedAt: typeof selectedAt === 'string' && Number.isFinite(Date.parse(selectedAt)) ? selectedAt : polledAt,
    })
  } catch {
    return unavailableSpcOutlook(hazard)
  }
}
