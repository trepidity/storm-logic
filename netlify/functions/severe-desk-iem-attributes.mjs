const IEM_ATTRIBUTES_URL = 'https://mesonet.agron.iastate.edu/geojson/nexrad_attr.py'
const IEM_TIMEOUT_MS = 9_000
const IEM_ATTEMPTS = 2

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

/**
 * The recorded IEM attributes contract accepts only `valid=` for temporal
 * selection. It has no spatial parameter: fetching the national response while
 * calling it regional would be a false claim. Unknown parameters must fail
 * locally because IEM silently ignores them and returns current data.
 */
export default async function handler(request) {
  const params = new URL(request.url).searchParams
  if (![...params.keys()].every((key) => key === 'valid')) {
    return json({ error: 'IEM storm attributes accepts only the recorded valid query parameter.' }, 422)
  }
  const valid = params.get('valid')
  const upstreamParams = new URLSearchParams()
  if (valid) upstreamParams.set('valid', valid)
  const upstreamUrl = upstreamParams.size ? `${IEM_ATTRIBUTES_URL}?${upstreamParams}` : IEM_ATTRIBUTES_URL

  let lastError = null
  for (let attempt = 0; attempt < IEM_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(upstreamUrl, {
        headers: { Accept: 'application/geo+json' },
        signal: AbortSignal.timeout(IEM_TIMEOUT_MS),
      })
      if (response.ok) {
        return new Response(await response.text(), {
          status: 200,
          headers: {
            'Content-Type': 'application/geo+json; charset=utf-8',
            'Cache-Control': 'public, max-age=0, must-revalidate',
            // A valid-addressed response describes a completed scan selection and
            // is immutable. The live parameterless snapshot remains short-lived.
            'Netlify-CDN-Cache-Control': valid
              ? 'public, s-maxage=86400, stale-while-revalidate=604800'
              : 'public, s-maxage=120, stale-while-revalidate=240',
          },
        })
      }
      // A malformed request is not transient, but IEM's occasional 5xx is.
      if (response.status < 500) return json({ error: 'IEM storm attributes service error.' }, 502)
      lastError = { name: 'UpstreamError' }
    } catch (error) {
      lastError = error
    }
  }

  const timedOut = lastError?.name === 'TimeoutError' || lastError?.name === 'AbortError'
  return json({ error: timedOut ? 'IEM storm attributes timed out.' : 'Could not reach IEM storm attributes.' }, 504)
}
