import { useMemo, useState } from 'react'
import DayRow from './DayRow.jsx'

export default function Forecast({ days, units }) {
  const [openIndex, setOpenIndex] = useState(0)

  const [scaleMin, scaleMax] = useMemo(() => {
    const lows = days.map((d) => d.tempMin).filter(Number.isFinite)
    const highs = days.map((d) => d.tempMax).filter(Number.isFinite)
    if (!lows.length || !highs.length) return [0, 1]
    return [Math.min(...lows), Math.max(...highs)]
  }, [days])

  return (
    <section className="forecast" aria-label={`${days.length}-day forecast`}>
      <h2 className="forecast__title">
        {days.length}-day forecast
        <span className="forecast__hint">Select a day for detail</span>
      </h2>

      <ol className="forecast__list">
        {days.map((day, index) => (
          <DayRow
            key={day.date}
            day={day}
            index={index}
            units={units}
            scaleMin={scaleMin}
            scaleMax={scaleMax}
            expanded={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? -1 : index)}
          />
        ))}
      </ol>
    </section>
  )
}
