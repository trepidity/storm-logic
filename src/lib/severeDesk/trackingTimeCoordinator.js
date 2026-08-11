import { layerDefinition } from './layerRegistry.js'
import { layerStateIssues } from './layerState.js'

const REPORT_WINDOW_MS = 6 * 60 * 60 * 1000
const ATTRIBUTE_CAP = 300
const TRACKING_LAYER_IDS = new Set(['storm-reports', 'storm-attributes'])

function timestamp(value) {
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(result) ? result : null
}

function unavailable(candidate, reason = 'out-of-window') {
  return {
    status: 'unavailable',
    layerId: candidate.layerId,
    source: candidate.source,
    reason,
    lastKnownAt: candidate.clock?.observedAt ?? null,
  }
}

function selectedReports(candidate, selectedAt) {
  const selectedMs = timestamp(selectedAt)
  const floor = selectedMs - REPORT_WINDOW_MS
  const features = []
  for (const feature of candidate.features) {
    const reportAt = timestamp(feature?.reportAt)
    if (reportAt === null) return unavailable(candidate, 'upstream-error')
    if (reportAt >= floor && reportAt <= selectedMs) features.push(feature)
  }
  return {
    ...candidate,
    emptiness: features.length ? 'populated' : 'no-data-in-window',
    features,
  }
}

function selectedAttributes(candidate, selectedAt) {
  const selectedMs = timestamp(selectedAt)
  const features = []
  for (const feature of candidate.features) {
    const scanAt = timestamp(feature?.scanAt)
    if (scanAt === null) return unavailable(candidate, 'upstream-error')
    if (Math.abs(scanAt - selectedMs) <= candidate.clock.cadenceMs) features.push(feature)
  }

  if (features.length === 0 && candidate.features.length > 0) return unavailable(candidate)
  if (features.length === 0) return { ...candidate, emptiness: 'no-data-in-window', features: [] }

  const rendered = features.slice(0, ATTRIBUTE_CAP)
  return {
    ...candidate,
    features: rendered,
    truncated: rendered.length < features.length
      ? { shown: rendered.length, total: features.length, exact: true, upstreamTruncated: false }
      : null,
  }
}

/**
 * Selects a Radar frame independently against each normalised tracking layer.
 * It consumes only LayerState and the adapters' normalised content clocks:
 * reportAt for reports, scanAt for storm attributes. No provider payload field
 * can cross this seam, and no nearest attribute scan can be borrowed outside
 * its one-cadence tolerance.
 */
export function coordinateTrackingLayers(candidates, selectedAt) {
  const selectedMs = timestamp(selectedAt)
  if (!Array.isArray(candidates)) return []

  return candidates
    .filter((candidate) => TRACKING_LAYER_IDS.has(candidate?.layerId))
    .map((candidate) => {
      if (layerStateIssues(candidate).length || candidate.status === 'unavailable') return candidate
      if (selectedMs === null) return unavailable(candidate)
      return candidate.layerId === 'storm-reports'
        ? selectedReports(candidate, selectedMs)
        : selectedAttributes(candidate, selectedMs)
    })
    .sort((left, right) => (layerDefinition(left.layerId)?.zIndex ?? 0) - (layerDefinition(right.layerId)?.zIndex ?? 0))
}

export const TRACKING_LAYER_SCOPE_NOTE = 'IEM provides no recorded regional filter; markers are limited to this map view in your browser.'
