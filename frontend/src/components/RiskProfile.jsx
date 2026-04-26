import { useState } from 'react'

const RISK_COLORS = {
  LOW: 'text-green-600',
  MEDIUM: 'text-amber-500',
  HIGH: 'text-red-600',
}

const BAR_COLORS = {
  LOW: 'bg-green-600',
  MEDIUM: 'bg-amber-500',
  HIGH: 'bg-red-600',
}

const SEVERITY_DOTS = {
  LOW: 'bg-green-600',
  MEDIUM: 'bg-amber-500',
  HIGH: 'bg-red-600',
}

function BucketRow({ bucket, isMax, riskLevel }) {
  const [expanded, setExpanded] = useState(false)
  const barColor = isMax ? BAR_COLORS[riskLevel] : 'bg-teal-600'

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
      >
        <span className="text-sm text-gray-700 w-24 text-left">{bucket.name}</span>
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full bar-fill ${barColor}`}
            style={{ width: `${bucket.score}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-900 w-12 text-right">{bucket.score}/100</span>
      </button>
      {expanded && bucket.factors && bucket.factors.length > 0 && (
        <div className="ml-2 pl-4 border-l-2 border-gray-100 mb-2">
          {bucket.factors.map((f, i) => (
            <p key={i} className="text-xs text-gray-500 py-0.5">{f}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RiskProfile({ result, onReset }) {
  const { risk_level, narrative, one_health, matched_alerts, weather } = result
  const buckets = [one_health.human, one_health.animal, one_health.environment]
  const maxScore = Math.max(...buckets.map((b) => b.score))

  return (
    <div className="fixed top-6 right-6 w-[360px] bg-white shadow-md rounded-lg p-6 z-[1000] max-h-[calc(100vh-48px)] overflow-y-auto">
      <div className="mb-4">
        <p className={`text-2xl font-bold ${RISK_COLORS[risk_level]}`}>{risk_level}</p>
        <p className="text-xs text-gray-400 mt-1">
          {weather.temp.toFixed(1)}&deg;C &middot; {weather.humidity}% humidity &middot; {weather.description}
        </p>
      </div>

      <div className="border-l-2 border-teal-600 bg-gray-50 rounded-r-lg px-4 py-3 mb-6">
        <p className="text-sm text-gray-700 leading-relaxed">{narrative}</p>
      </div>

      <div className="mb-6">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">One Health Breakdown</p>
        {buckets.map((b) => (
          <BucketRow
            key={b.name}
            bucket={b}
            isMax={b.score === maxScore}
            riskLevel={risk_level}
          />
        ))}
      </div>

      {matched_alerts && matched_alerts.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Matched Alerts</p>
          <div className="flex flex-col gap-2">
            {matched_alerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOTS[alert.severity]}`} />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900">{alert.disease}</span>
                  <span className="text-xs text-gray-400 ml-1.5">{alert.region}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onReset}
        className="text-sm text-teal-600 hover:text-teal-700 transition-colors cursor-pointer"
      >
        Submit another report
      </button>
    </div>
  )
}
