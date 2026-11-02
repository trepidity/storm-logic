import { useEffect, useRef, useState } from 'react'
import { classifySwipe, isSwipeExcluded, lockAxis } from '../lib/swipe.js'

/** Live result of a media query; false where matchMedia is unavailable. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener?.('change', update)
    return () => mql.removeEventListener?.('change', update)
  }, [query])
  return matches
}

// Follow-the-finger offset is damped and capped: a hint of movement, not a
// full carousel drag.
const DRAG_DAMPING = 0.35
const DRAG_MAX_PX = 48

/**
 * Horizontal swipe detection on `ref`. Listeners are passive, so vertical
 * scrolling is never blocked; a gesture is only acted on at touchend. While a
 * horizontal drag is in progress the element gets `data-swipe-dragging` and a
 * `--swipe-dx` custom property for a light follow-the-finger cue (a data
 * attribute, not a class, so React re-renders never clobber it).
 *
 * `onSwipe` receives 'next' (swipe left) or 'previous' (swipe right).
 */
export default function useSwipeNavigation(ref, { enabled, onSwipe }) {
  const onSwipeRef = useRef(onSwipe)
  onSwipeRef.current = onSwipe

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return undefined

    let gesture = null

    const resetDrag = () => {
      delete el.dataset.swipeDragging
      el.style.removeProperty('--swipe-dx')
    }

    const onStart = (event) => {
      if (event.touches.length !== 1 || isSwipeExcluded(event.target, el)) {
        gesture = null
        resetDrag()
        return
      }
      const t = event.touches[0]
      gesture = { x: t.clientX, y: t.clientY, dx: 0, dy: 0, axis: null }
    }

    const onMove = (event) => {
      if (!gesture) return
      if (event.touches.length !== 1) {
        // A second finger means pinch-zoom, not navigation.
        gesture = null
        resetDrag()
        return
      }
      const t = event.touches[0]
      gesture.dx = t.clientX - gesture.x
      gesture.dy = t.clientY - gesture.y
      if (!gesture.axis) gesture.axis = lockAxis(gesture.dx, gesture.dy)
      if (gesture.axis === 'x') {
        const offset = Math.max(-DRAG_MAX_PX, Math.min(DRAG_MAX_PX, gesture.dx * DRAG_DAMPING))
        el.dataset.swipeDragging = ''
        el.style.setProperty('--swipe-dx', `${offset}px`)
      }
    }

    const onEnd = () => {
      const g = gesture
      gesture = null
      resetDrag()
      if (!g || g.axis !== 'x') return
      const direction = classifySwipe(g.dx, g.dy)
      if (direction) onSwipeRef.current?.(direction)
    }

    const onCancel = () => {
      gesture = null
      resetDrag()
    }

    const opts = { passive: true }
    el.addEventListener('touchstart', onStart, opts)
    el.addEventListener('touchmove', onMove, opts)
    el.addEventListener('touchend', onEnd, opts)
    el.addEventListener('touchcancel', onCancel, opts)
    return () => {
      el.removeEventListener('touchstart', onStart, opts)
      el.removeEventListener('touchmove', onMove, opts)
      el.removeEventListener('touchend', onEnd, opts)
      el.removeEventListener('touchcancel', onCancel, opts)
      resetDrag()
    }
  }, [ref, enabled])
}
