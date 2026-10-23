/**
 * Bookmark glyph shared by every "saved location" affordance, so the save
 * toggle, the saved-weather pills and the saved chips all speak one symbol.
 * Decorative only — callers always pair it with visible or accessible text.
 */
export default function BookmarkIcon({ filled = false, className = '' }) {
  return (
    <svg
      className={`bookmark-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
