/**
 * Saved and recent locations, on one scrolling line.
 *
 * They remain two distinct lists — favorites are things the user chose to keep,
 * recents are churn, and merging them would let a city looked up once push a
 * home city out of view. But they no longer get a labelled row each: saved
 * chips lead, carry a star, and are visually stronger; recents follow, muted.
 * That reads at a glance and costs one row instead of two.
 */
function Chip({ place, kind, active, onSelect, onRemove }) {
  const saved = kind === 'saved'
  return (
    <li
      className={`chip ${saved ? 'chip--saved' : 'chip--muted'} ${active ? 'chip--active' : ''}`}
      data-kind={kind}
    >
      <button
        type="button"
        className="chip__main"
        onClick={() => onSelect(place)}
        aria-label={`Show weather for ${place.name}${saved ? ', saved' : ''}`}
      >
        {saved ? (
          <span className="chip__star" aria-hidden="true">
            ★
          </span>
        ) : null}
        {place.name}
      </button>
      <button
        type="button"
        className="chip__remove"
        onClick={() => onRemove(place.key)}
        aria-label={`Remove ${place.name} from ${saved ? 'saved' : 'recent'} locations`}
        title={saved ? 'Remove from saved' : 'Dismiss'}
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  )
}

export default function SavedPlaces({ activeKey, favorites, recents, onSelect, onRemoveFavorite, onRemoveRecent }) {
  if (!favorites.length && !recents.length) return null

  return (
    <ul className="saved" aria-label="Saved and recent locations">
      {favorites.map((p) => (
        <Chip
          key={p.key}
          place={p}
          kind="saved"
          active={p.key === activeKey}
          onSelect={onSelect}
          onRemove={onRemoveFavorite}
        />
      ))}
      {recents.map((p) => (
        <Chip
          key={p.key}
          place={p}
          kind="recent"
          active={p.key === activeKey}
          onSelect={onSelect}
          onRemove={onRemoveRecent}
        />
      ))}
    </ul>
  )
}
