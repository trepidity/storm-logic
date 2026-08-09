import { compassPoint, formatWind } from '../lib/format.js'

/**
 * Compass dial. The arrow points the way the wind is *going* — meteorological
 * direction is where it comes from, so the needle is rotated by (direction + 180).
 */
export default function WindDial({ direction, speed, gusts, units }) {
  const hasDirection = Number.isFinite(direction)
  const rotation = hasDirection ? direction + 180 : 0

  return (
    <div className="wind">
      <div className="wind__dial" role="img" aria-label={`Wind from the ${compassPoint(direction)} at ${formatWind(speed, units)}`}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="wind__ring" cx="50" cy="50" r="42" />
          {[0, 90, 180, 270].map((deg) => (
            <line
              key={deg}
              className="wind__tick"
              x1="50"
              y1="8"
              x2="50"
              y2="15"
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
          {[45, 135, 225, 315].map((deg) => (
            <line
              key={deg}
              className="wind__tick wind__tick--minor"
              x1="50"
              y1="8"
              x2="50"
              y2="12"
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
          {hasDirection ? (
            <g className="wind__needle" transform={`rotate(${rotation} 50 50)`}>
              <path d="M50 22 L57 60 L50 55 L43 60 Z" />
            </g>
          ) : null}
          <circle className="wind__hub" cx="50" cy="50" r="4" />
        </svg>
        <span className="wind__cardinal wind__cardinal--n">N</span>
        <span className="wind__cardinal wind__cardinal--e">E</span>
        <span className="wind__cardinal wind__cardinal--s">S</span>
        <span className="wind__cardinal wind__cardinal--w">W</span>
      </div>

      <div className="wind__readout">
        <p className="wind__speed">{formatWind(speed, units)}</p>
        <p className="wind__from">from the {compassPoint(direction)}</p>
        {Number.isFinite(gusts) ? (
          <p className="wind__gusts">
            Gusts to <strong>{formatWind(gusts, units)}</strong>
          </p>
        ) : null}
      </div>
    </div>
  )
}
