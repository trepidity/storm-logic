const IEM_LSR_URL = 'https://mesonet.agron.iastate.edu/geojson/lsr.py'
const WINDOW_MS = 6 * 60 * 60 * 1000

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

function validTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function validWfos(value) {
  if (!value) return true
  return value.split(',').every((wfo) => /^[A-Z]{3}$/.test(wfo))
}

/**
 * IEM LSR proxy. The only query fields forwarded are the recorded fixture
 * shape: sts, ets, and optionally wfos. No viewport or invented `region`
 * parameter is translated here.
 */
export default async function handler(request) {
  const params = new URL(request.url).searchParams
  if (![...params.keys()].every((key) => key === 'sts' || key === 'ets' || key === 'wfos')) {
    return json({ error: 'IEM Local Storm Reports accepts only recorded sts, ets, and wfos query fields.' }, 422)
  }
  const sts = params.get('sts')
  const ets = params.get('ets')
  const wfos = params.get('wfos')
  if (!validTime(sts) || !validTime(ets) || Date.parse(ets) <= Date.parse(sts) || Date.parse(ets) - Date.parse(sts) > WINDOW_MS || !validWfos(wfos)) {
    return json({ error: 'LSR requests require a valid window of at most six hours and optional three-letter WFO codes.' }, 400)
  }

  const upstreamParams = new URLSearchParams({ sts, ets })
  if (wfos) upstreamParams.set('wfos', wfos)
  try {
    const response = await fetch(`${IEM_LSR_URL}?${upstreamParams}`, {
      headers: { Accept: 'application/geo+json' },
      signal: AbortSignal.timeout(9000),
    })
    if (!response.ok) return json({ error: 'IEM Local Storm Reports service error.' }, 502)
    return new Response(await response.text(), {
      status: 200,
      headers: {
        'Content-Type': 'application/geo+json; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return json({ error: timedOut ? 'IEM Local Storm Reports timed out.' : 'Could not reach IEM Local Storm Reports.' }, 504)
  }
}
