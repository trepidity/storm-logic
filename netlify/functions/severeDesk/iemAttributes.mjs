const IEM_ATTRIBUTES_URL = 'https://mesonet.agron.iastate.edu/geojson/nexrad_attr.py'

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

/**
 * The recorded IEM attributes contract has no spatial request parameter.
 * Rejecting one is deliberate: fetching the national response while calling it
 * regional would be a false claim. T-SD-22 may apply client-side scope only to
 * normalised features and must label it as such.
 */
export default async function handler(request) {
  const params = new URL(request.url).searchParams
  if ([...params.keys()].length) {
    return json({ error: 'IEM storm attributes have no recorded upstream spatial filter.' }, 422)
  }

  try {
    const response = await fetch(IEM_ATTRIBUTES_URL, {
      headers: { Accept: 'application/geo+json' },
      signal: AbortSignal.timeout(9000),
    })
    if (!response.ok) return json({ error: 'IEM storm attributes service error.' }, 502)
    return new Response(await response.text(), {
      status: 200,
      headers: {
        'Content-Type': 'application/geo+json; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240',
      },
    })
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return json({ error: timedOut ? 'IEM storm attributes timed out.' : 'Could not reach IEM storm attributes.' }, 504)
  }
}
