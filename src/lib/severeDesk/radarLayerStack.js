import { layerDefinition } from './layerRegistry.js'
import { layerStateIssues } from './layerState.js'

function sourceLine(source) {
  if (!source || typeof source.name !== 'string' || typeof source.product !== 'string') return null
  return `${source.name} · ${source.product}`
}

function unavailableProjection(definition, candidate) {
  return {
    layerId: definition.id,
    zIndex: definition.zIndex,
    label: definition.label,
    authority: definition.authority,
    status: 'unavailable',
    sourceLine: sourceLine(candidate?.source),
    observedAt: candidate?.lastKnownAt ?? null,
    freshness: null,
    message: `${definition.label} unavailable.`,
    features: [],
  }
}

/**
 * Radar's SC-SD-LAYER consumer seam. It projects only normalised LayerState
 * candidates into renderable values. A malformed, mismatched, or unavailable
 * state cannot leak features into the map.
 */
export function projectRadarLayerStack(candidates) {
  if (!Array.isArray(candidates)) return []

  const projected = []
  const seen = new Set()
  for (const candidate of candidates) {
    const definition = layerDefinition(candidate?.layerId)
    if (!definition || seen.has(definition.id)) continue
    seen.add(definition.id)

    if (layerStateIssues(candidate).length || candidate.source.authority !== definition.authority) {
      projected.push(unavailableProjection(definition, candidate))
      continue
    }

    if (candidate.status === 'unavailable') {
      projected.push(unavailableProjection(definition, candidate))
      continue
    }

    projected.push({
      layerId: definition.id,
      zIndex: definition.zIndex,
      label: definition.label,
      authority: definition.authority,
      status: 'ready',
      sourceLine: sourceLine(candidate.source),
      observedAt: candidate.clock.observedAt,
      freshness: candidate.freshness,
      message: candidate.emptiness === 'no-data-in-window' ? `No ${definition.label.toLowerCase()} in the selected window.` : null,
      features: candidate.features,
    })
  }

  return projected.sort((left, right) => left.zIndex - right.zIndex)
}
