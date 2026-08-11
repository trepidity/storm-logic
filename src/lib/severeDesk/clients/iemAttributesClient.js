import { normaliseIemAttributes, normaliseIemAttributesFailure } from '../adapters/iemAttributes.js'

function pollTimestamp(now) {
  const value = new Date(now)
  return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString()
}

/**
 * The recorded IEM attributes endpoint has no spatial parameter. This client
 * intentionally exposes none, so it cannot claim that upstream filtered the
 * nationwide source to the desk region.
 */
export async function fetchIemAttributesLayer(signal, { now = Date.now() } = {}) {
  const polledAt = pollTimestamp(now)
  try {
    const response = await fetch('/api/severeDesk/iemAttributes', {
      signal,
      headers: { Accept: 'application/geo+json' },
    })
    if (!response.ok) return normaliseIemAttributesFailure()
    return normaliseIemAttributes(await response.json(), { receivedAt: polledAt, polledAt, now })
  } catch {
    return normaliseIemAttributesFailure()
  }
}
