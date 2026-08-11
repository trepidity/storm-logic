/**
 * L0 deployment-runtime proof for Severe Desk.
 *
 * Start `npm run dev:netlify` (or an equivalent `netlify dev` process) first,
 * then run this script against that local runtime. It deliberately does not
 * intercept provider responses: each request crosses the deployed `/api/*`
 * redirect, its Netlify function, and the live upstream provider.
 */

import assert from 'node:assert/strict'

const baseUrl = (process.env.LOCAL_RUNTIME_URL ?? 'http://127.0.0.1:8888').replace(/\/$/, '')
const end = new Date()
const start = new Date(end.getTime() - 6 * 60 * 60 * 1000)

const cases = [
  {
    name: 'NWS warnings',
    path: '/api/nws-warnings?area=IL',
    contentType: 'application/json',
  },
  {
    name: 'SPC hail outlook',
    path: '/api/severe-desk-spc?day=1&hazard=hail&bbox=-91.6,36.9,-87.0,42.6',
    contentType: 'application/json',
  },
  {
    name: 'IEM storm attributes',
    path: '/api/severeDesk/iemAttributes',
    contentType: 'application/geo+json',
  },
  {
    name: 'IEM storm reports',
    path: `/api/severeDesk/iemLsr?${new URLSearchParams({ sts: start.toISOString(), ets: end.toISOString() })}`,
    contentType: 'application/geo+json',
  },
]

for (const candidate of cases) {
  const response = await fetch(`${baseUrl}${candidate.path}`, {
    headers: { Accept: candidate.contentType },
    signal: AbortSignal.timeout(20_000),
  })
  assert.equal(response.status, 200, `${candidate.name}: local runtime must return HTTP 200`)
  assert.ok((response.headers.get('content-type') ?? '').startsWith(candidate.contentType), `${candidate.name}: local runtime must retain provider JSON media type`)
  const body = await response.json()
  assert.equal(body?.type, 'FeatureCollection', `${candidate.name}: local runtime must return provider GeoJSON`)
  assert.ok(Array.isArray(body.features), `${candidate.name}: FeatureCollection must carry a features array`)
}

console.log(`Severe Desk live local-runtime proof: ${cases.length}/${cases.length} provider paths passed (${baseUrl})`)
