import { formatWind } from '../lib/format.js'
import { formatApproxHour } from '../lib/precipTiming.js'

function stormSignal(plan) {
  if (plan.hail) return 'Thunder and hail signal'
  return plan.thunder ? 'Thunder signal' : 'No thunder signal'
}

/** Evidence, not a safety score: the selected day's dry daylight window. */
export default function OutdoorPlan({ plan, units }) {
  if (!plan) return null

  const start = plan.window ? formatApproxHour(plan.window.startsAt) : null
  const end = plan.window ? formatApproxHour(plan.window.endsAt) : null

  return (
    <section className="outdoor-plan" aria-label="Outdoor plan">
      <h3 className="outdoor-plan__title">Outdoor plan</h3>
      <p className="outdoor-plan__window">
        {start && end
          ? `Best dry daylight: ${start}–${end} · ${plan.window.hours} h`
          : 'No dry daylight window shown'}
      </p>
      <div className="outdoor-plan__evidence">
        <span className="outdoor-plan__gusts">Gusts up to {formatWind(plan.gustMax, units)}</span>
        <span className="outdoor-plan__uv">UV index {plan.uvIndexMax ?? '—'}</span>
        <span className="outdoor-plan__storm">{stormSignal(plan)}</span>
      </div>
    </section>
  )
}
