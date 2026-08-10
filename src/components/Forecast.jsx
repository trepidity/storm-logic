import { useMemo, useState } from 'react'
import DayRow from './DayRow.jsx'

/**
 * The forward forecast, starting at tomorrow.
 *
 * Today is deliberately absent: the current-conditions card above already
 * carries today's high, low, sun times, UV and rain chance, so a "Today" row
 * here was duplicating it. `days[0]` is still fetched and still feeds that
 * card — it just isn't listed twice.
 *
 * The API request asks for one extra day so dropping today still leaves a full
 * ten ahead.
 */
export default function Forecast({ days, units, place }) {
  const upcoming = useMemo(() => days.slice(1), [days])
  const [openIndex, setOpenIndex] = useState(0)

  const [scaleMin, scaleMax] = useMemo(() => {
    const lows = upcoming.map((d) => d.tempMin).filter(Number.isFinite)
    const highs = upcoming.map((d) => d.tempMax).filter(Number.isFinite)
    if (!lows.length || !highs.length) return [0, 1]
    return [Math.min(...lows), Math.max(...highs)]
  }, [upcoming])

  if (!upcoming.length) return null

  return (
    <section className="forecast" aria-label={`${upcoming.length}-day forecast`}>
      <h2 className="forecast__title">
        {upcoming.length}-day forecast
        <span className="forecast__hint">Select a day for detail</span>
      </h2>

      <ol className="forecast__list">
        {upcoming.map((day, i) => (
          <DayRow
            key={day.date}
            day={day}
            /* Offset by one so day naming still reads from today: the first
               row is "Tomorrow", not "Today". */
            index={i + 1}
            units={units}
            scaleMin={scaleMin}
            scaleMax={scaleMax}
            expanded={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
            place={place}
          />
        ))}
      </ol>
    </section>
  )
}
