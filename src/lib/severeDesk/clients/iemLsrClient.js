import { normaliseIemLsr, normaliseIemLsrFailure } from '../adapters/iemLsr.js'

function pollTimestamp(now) {
  const value = new Date(now)
  return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString()
}

/**
 * Fetch only through StormLogic's proxy. The query mirrors IEM's recorded
 * LSR fixture shape; no browser request is sent directly to IEM.
 */
export async function fetchIemLsrLayer({ sts, ets, wfos } = {}, signal, { now = Date.now() } = {}) {
  const params = new URLSearchParams({ sts: sts ?? '', ets: ets ?? '' })
  if (typeof wfos === 'string' && wfos) params.set('wfos', wfos)
  const polledAt = pollTimestamp(now)

  try {
    const response = await fetch(`/api/severeDesk/iemLsr?${params}`, {
      signal,
      headers: { Accept: 'application/geo+json' },
    })
    if (!response.ok) return normaliseIemLsrFailure()
    return normaliseIemLsr(await response.json(), { receivedAt: polledAt, polledAt, now })
  } catch {
    return normaliseIemLsrFailure()
  }
}
