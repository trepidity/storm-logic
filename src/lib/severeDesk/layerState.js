/**
 * SC-SD-LAYER's provider-agnostic discriminated contract. Adapters will parse
 * upstream data before producing this shape; composition code must only accept
 * states that pass this validator.
 */
export const AUTHORITIES = Object.freeze([
  'warning',
  'outlook',
  'report',
  'signature',
  'observation',
  'estimate',
])

const FRESHNESS = new Set(['fresh', 'aging', 'stale'])
const EMPTINESS = new Set(['populated', 'no-data-in-window'])
const UNAVAILABLE_REASONS = new Set(['upstream-error', 'out-of-window', 'stale-expired', 'not-configured'])

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function timestamp(value) {
  return typeof value === 'number'
    ? Number.isFinite(value)
    : typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function nullableTimestamp(value) {
  return value === null || timestamp(value)
}

function sourceIssues(source) {
  if (!record(source)) return ['source must be an object']

  const issues = []
  if (!nonEmptyString(source.name)) issues.push('source.name must be a non-empty string')
  if (!nonEmptyString(source.attribution)) issues.push('source.attribution must be a non-empty string')
  if (!AUTHORITIES.includes(source.authority)) issues.push('source.authority is not recognised')
  if (!nonEmptyString(source.product)) issues.push('source.product must be a non-empty string')
  if (typeof source.isFallback !== 'boolean') issues.push('source.isFallback must be boolean')
  return issues
}

function clockIssues(clock) {
  if (!record(clock)) return ['clock must be an object']

  const issues = []
  for (const key of ['observedAt', 'receivedAt', 'polledAt']) {
    if (!timestamp(clock[key])) issues.push(`clock.${key} must be a timestamp`)
  }
  for (const key of ['validFrom', 'validTo']) {
    if (!nullableTimestamp(clock[key])) issues.push(`clock.${key} must be a timestamp or null`)
  }
  if (!Number.isFinite(clock.cadenceMs) || clock.cadenceMs <= 0) {
    issues.push('clock.cadenceMs must be a positive number')
  }
  return issues
}

function truncatedIssues(truncated) {
  if (truncated === null) return []
  if (!record(truncated)) return ['truncated must be null or an object']

  const issues = []
  if (!Number.isInteger(truncated.shown) || truncated.shown < 0) issues.push('truncated.shown must be a non-negative integer')
  if (truncated.total !== null && (!Number.isInteger(truncated.total) || truncated.total < 0)) {
    issues.push('truncated.total must be a non-negative integer or null')
  }
  if (typeof truncated.exact !== 'boolean') issues.push('truncated.exact must be boolean')
  if (typeof truncated.upstreamTruncated !== 'boolean') issues.push('truncated.upstreamTruncated must be boolean')
  return issues
}

/**
 * @param {unknown} candidate
 * @returns {string[]} contract violations; an empty array is a safe LayerState.
 */
export function layerStateIssues(candidate) {
  if (!record(candidate)) return ['layer state must be an object']

  const issues = []
  if (!nonEmptyString(candidate.layerId)) issues.push('layerId must be a non-empty string')
  issues.push(...sourceIssues(candidate.source))

  if (candidate.status === 'ready') {
    issues.push(...clockIssues(candidate.clock))
    if (!FRESHNESS.has(candidate.freshness)) issues.push('ready.freshness is not recognised')
    if (!EMPTINESS.has(candidate.emptiness)) issues.push('ready.emptiness is not recognised')
    if (!Array.isArray(candidate.features)) issues.push('ready.features must be an array')
    if (candidate.emptiness === 'populated' && Array.isArray(candidate.features) && candidate.features.length === 0) {
      issues.push('ready.populated requires at least one feature')
    }
    if (candidate.emptiness === 'no-data-in-window' && Array.isArray(candidate.features) && candidate.features.length !== 0) {
      issues.push('ready.no-data-in-window requires an empty feature list')
    }
    issues.push(...truncatedIssues(candidate.truncated))
    if ('reason' in candidate || 'lastKnownAt' in candidate) {
      issues.push('ready state cannot carry unavailable fields')
    }
    return issues
  }

  if (candidate.status === 'unavailable') {
    if (!UNAVAILABLE_REASONS.has(candidate.reason)) issues.push('unavailable.reason is not recognised')
    if (!nullableTimestamp(candidate.lastKnownAt)) issues.push('unavailable.lastKnownAt must be a timestamp or null')
    for (const key of ['features', 'clock', 'freshness', 'emptiness', 'truncated']) {
      if (key in candidate) issues.push(`unavailable state cannot carry ${key}`)
    }
    return issues
  }

  issues.push('status must be ready or unavailable')
  return issues
}

export function isLayerState(candidate) {
  return layerStateIssues(candidate).length === 0
}
