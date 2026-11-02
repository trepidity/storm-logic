/**
 * Saved-location swipe navigation — the pure parts, kept free of React and the
 * DOM event plumbing so they can be unit-tested in Node.
 *
 * A swipe left moves to the next saved location and a swipe right to the
 * previous one, wrapping at either end (the list is short — at most
 * FAVORITES_LIMIT — and the dots make the loop obvious). A gesture only counts
 * when it travels at least SWIPE_THRESHOLD_PX sideways and is clearly more
 * horizontal than vertical, so ordinary page scrolling never changes location.
 */

export const SWIPE_THRESHOLD_PX = 50
/** Horizontal travel must beat vertical travel by this factor. */
export const SWIPE_HORIZONTAL_RATIO = 1.5
/** Movement before the gesture commits to an axis (horizontal or vertical). */
export const SWIPE_AXIS_LOCK_PX = 10

/** Phones and tablets: narrow viewports, or touch-first devices without hover. */
export const SWIPE_MEDIA_QUERY = '(max-width: 760px), (hover: none) and (pointer: coarse)'

/**
 * Elements a swipe must never start from. Form controls keep their own
 * gestures; maps (Leaflet) and anything opting out with data-swipe-ignore are
 * draggable surfaces. Horizontally scrollable containers are detected at
 * runtime in isSwipeExcluded rather than listed here.
 */
export const SWIPE_EXCLUDE_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[draggable="true"]',
  '.leaflet-container',
  '[data-swipe-ignore]',
].join(', ')

/**
 * Decide which way a finished gesture goes.
 * @returns {'next' | 'previous' | null}
 */
export function classifySwipe(dx, dy, { threshold = SWIPE_THRESHOLD_PX, ratio = SWIPE_HORIZONTAL_RATIO } = {}) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  const ax = Math.abs(dx)
  if (ax < threshold) return null
  if (ax < Math.abs(dy) * ratio) return null
  return dx < 0 ? 'next' : 'previous'
}

/**
 * Lock the axis once the finger has moved far enough to tell.
 * @returns {'x' | 'y' | null} null while still undecided
 */
export function lockAxis(dx, dy, { lockPx = SWIPE_AXIS_LOCK_PX, ratio = SWIPE_HORIZONTAL_RATIO } = {}) {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < lockPx && ay < lockPx) return null
  return ax >= ay * ratio ? 'x' : 'y'
}

/**
 * Index of the location a swipe lands on, wrapping at both ends. When the
 * active place is not one of the saved ones (current < 0), next starts at the
 * first saved location and previous at the last. Returns -1 when there is
 * nothing to cycle through (fewer than two saved locations).
 */
export function stepIndex(current, length, direction) {
  if (!Number.isInteger(length) || length < 2) return -1
  if (direction !== 'next' && direction !== 'previous') return -1
  if (!Number.isInteger(current) || current < 0 || current >= length) {
    return direction === 'next' ? 0 : length - 1
  }
  const step = direction === 'next' ? 1 : -1
  return (current + step + length) % length
}

/**
 * True when a touch that starts on `target` belongs to something else: a form
 * control, a map, an opted-out element, or a container that scrolls sideways
 * (the hourly strip, wide tables). Walks up to, but not past, `boundary`.
 */
export function isSwipeExcluded(target, boundary) {
  let node = target && target.nodeType === 1 ? target : target?.parentElement
  while (node && node !== boundary) {
    if (typeof node.matches === 'function' && node.matches(SWIPE_EXCLUDE_SELECTOR)) return true
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflowX = getComputedStyle(node).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    node = node.parentElement
  }
  return false
}
