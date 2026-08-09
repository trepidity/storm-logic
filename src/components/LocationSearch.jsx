import { useEffect, useRef, useState } from 'react'
import { searchPlaces, currentPosition } from '../lib/api.js'

export default function LocationSearch({ place, favorites, onSelect, onGeoError }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const containerRef = useRef(null)

  // Debounced geocoding lookup; the in-flight request is aborted on each keystroke.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return undefined
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setBusy(true)
      try {
        const found = await searchPlaces(query, controller.signal)
        setResults(found)
        setOpen(true)
      } catch (err) {
        if (err.name !== 'AbortError') setResults([])
      } finally {
        setBusy(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  useEffect(() => {
    function onDocumentClick(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocumentClick)
    return () => document.removeEventListener('pointerdown', onDocumentClick)
  }, [])

  function choose(next) {
    onSelect(next)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  async function useMyLocation() {
    setBusy(true)
    try {
      choose(await currentPosition())
    } catch (err) {
      onGeoError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="search" ref={containerRef}>
      <div className="search__bar">
        <label className="search__field">
          <span className="visually-hidden">Search for a city</span>
          <span className="search__icon" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            value={query}
            placeholder="Search any city…"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          />
          {busy ? <span className="search__spinner" aria-hidden="true" /> : null}
        </label>

        <button type="button" className="search__geo" onClick={useMyLocation} title="Use my location">
          <span aria-hidden="true">◎</span>
          <span className="search__geo-text">My location</span>
        </button>
      </div>

      {open && results.length > 0 ? (
        <ul className="search__results">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => choose(r)}>
                <strong>{r.name}</strong>
                <small>{[r.admin1, r.country].filter(Boolean).join(', ')}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {favorites.length > 1 ? (
        <ul className="search__pins">
          {favorites.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className={`pin ${f.id === place.id ? 'pin--active' : ''}`}
                onClick={() => onSelect(f)}
              >
                {f.name ?? f.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
