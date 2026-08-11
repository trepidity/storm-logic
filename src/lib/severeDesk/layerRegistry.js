/**
 * Provider-agnostic Radar layer order. Source names, URLs, and payload fields
 * intentionally live below this layer in future adapters.
 */
export const LAYER_REGISTRY = Object.freeze([
  Object.freeze({ id: 'reflectivity', label: 'Reflectivity', authority: 'observation', zIndex: 20 }),
  Object.freeze({ id: 'spc-outlooks', label: 'SPC outlooks', authority: 'outlook', zIndex: 30 }),
  Object.freeze({ id: 'warnings', label: 'Official alerts', authority: 'warning', zIndex: 40 }),
  Object.freeze({ id: 'storm-attributes', label: 'Storm attributes', authority: 'signature', zIndex: 50 }),
  Object.freeze({ id: 'storm-reports', label: 'Storm reports', authority: 'report', zIndex: 60 }),
])

const LAYERS_BY_ID = new Map(LAYER_REGISTRY.map((layer) => [layer.id, layer]))

export function layerDefinition(layerId) {
  return LAYERS_BY_ID.get(layerId) ?? null
}
