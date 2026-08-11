/**
 * Provider-agnostic Radar layer order. Source names, URLs, and payload fields
 * intentionally live below this layer in future adapters.
 */
export const LAYER_REGISTRY = Object.freeze([
  Object.freeze({ id: 'reflectivity', label: 'Reflectivity', authority: 'observation', zIndex: 20, color: '#4fd06a', frameCoupled: true }),
  Object.freeze({ id: 'spc-outlooks', label: 'SPC outlooks', authority: 'outlook', zIndex: 30, color: '#ae90ff', frameCoupled: false }),
  Object.freeze({ id: 'warnings', label: 'Official alerts', authority: 'warning', zIndex: 40, color: '#ffcf6b', frameCoupled: false }),
  Object.freeze({ id: 'storm-attributes', label: 'Storm attributes', authority: 'signature', zIndex: 50, color: '#7557d8', frameCoupled: true }),
  Object.freeze({ id: 'storm-reports', label: 'Storm reports', authority: 'report', zIndex: 60, color: '#ff8f3d', frameCoupled: true }),
])

const LAYERS_BY_ID = new Map(LAYER_REGISTRY.map((layer) => [layer.id, layer]))

export function layerDefinition(layerId) {
  return LAYERS_BY_ID.get(layerId) ?? null
}
