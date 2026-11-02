/**
 * Position cue for swipe navigation between saved locations: one dot per saved
 * place plus an "n of N" count. Display-only — the saved-weather pills and the
 * location panel remain the way to pick a place directly.
 */
export default function SwipeIndicator({ favorites, activeIndex }) {
  const total = favorites.length
  const active = activeIndex >= 0 ? favorites[activeIndex] : null
  const count = active ? `${activeIndex + 1} of ${total}` : `${total} saved`
  return (
    <div className="swipe-indicator">
      <span className="swipe-indicator__dots" aria-hidden="true">
        {favorites.map((place, index) => (
          <span key={place.key} className={`swipe-indicator__dot ${index === activeIndex ? 'is-active' : ''}`} />
        ))}
      </span>
      <span className="swipe-indicator__count" aria-hidden="true">
        {count}
      </span>
      <span className="visually-hidden" aria-live="polite">
        {active
          ? `${active.name}, saved location ${activeIndex + 1} of ${total}. Swipe left or right for other saved locations.`
          : `Not a saved location. Swipe left or right to view your ${total} saved locations.`}
      </span>
    </div>
  )
}
