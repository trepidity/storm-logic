/**
 * Saved and recent locations.
 *
 * Two distinct lists on purpose: favorites are things the user chose to keep,
 * recents are churn. Mixing them means a city you looked up once pushes your
 * home city out of view.
 */
export default function SavedPlaces({ activeKey, favorites, recents, onSelect, onRemoveFavorite, onRemoveRecent }) {
  if (!favorites.length && !recents.length) return null

  return (
    <div className="saved">
      {favorites.length ? (
        <section className="saved__group" aria-label="Saved locations">
          <h2 className="saved__label">
            <span aria-hidden="true">★</span> Saved
          </h2>
          <ul className="saved__list">
            {favorites.map((p) => (
              <li key={p.key} className={`chip ${p.key === activeKey ? 'chip--active' : ''}`}>
                <button type="button" className="chip__main" onClick={() => onSelect(p)}>
                  {p.name}
                </button>
                <button
                  type="button"
                  className="chip__remove"
                  onClick={() => onRemoveFavorite(p.key)}
                  aria-label={`Remove ${p.name} from saved locations`}
                  title="Remove from saved"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recents.length ? (
        <section className="saved__group" aria-label="Recently viewed locations">
          <h2 className="saved__label">Recent</h2>
          <ul className="saved__list">
            {recents.map((p) => (
              <li key={p.key} className={`chip chip--muted ${p.key === activeKey ? 'chip--active' : ''}`}>
                <button type="button" className="chip__main" onClick={() => onSelect(p)}>
                  {p.name}
                </button>
                <button
                  type="button"
                  className="chip__remove"
                  onClick={() => onRemoveRecent(p.key)}
                  aria-label={`Remove ${p.name} from recent locations`}
                  title="Dismiss"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
