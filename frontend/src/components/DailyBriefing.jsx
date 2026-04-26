import { useState, useEffect, useCallback } from 'react'
import { fetchBriefing } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'

const SEVERITY_COLORS = { HIGH: '#dc2626', MEDIUM: '#d97706', LOW: '#16a34a' }
const PIE_COLORS = ['#dc2626', '#d97706', '#16a34a']

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-semibold ${accent || 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function SeverityDot({ severity }) {
  const color = { HIGH: 'bg-red-600', MEDIUM: 'bg-amber-500', LOW: 'bg-green-600' }
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color[severity] || 'bg-gray-400'}`} />
}

export default function DailyBriefing() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [lastFetched, setLastFetched] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchBriefing()
      setData(d)
      setLastFetched(new Date())
      setSecondsAgo(0)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const refresh = setInterval(load, 600000)
    return () => clearInterval(refresh)
  }, [load])

  useEffect(() => {
    const tick = setInterval(() => setSecondsAgo((s) => s + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  if (loading && !data) {
    return <p className="text-sm text-gray-400 text-center py-16">Loading briefing...</p>
  }

  if (!data) {
    return <p className="text-sm text-gray-400 text-center py-16">Unable to load briefing</p>
  }

  const updatedText = secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`

  const reportsPerDay = (data.reports_per_day || []).map((d) => ({
    date: d.date.slice(5),
    count: d.count,
  }))

  const symptomData = (data.symptom_frequency || []).map((s) => ({
    name: s.symptom.charAt(0).toUpperCase() + s.symptom.slice(1).replace('_', ' '),
    count: s.count,
  }))

  const riskRaw = data.risk_distribution || {}
  const riskData = Object.entries(riskRaw).map(([level, count]) => ({
    name: level,
    value: count,
  }))

  const riskTotal = riskData.reduce((sum, r) => sum + r.value, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Daily Briefing</h2>
          <p className="text-xs text-gray-400">Updated {updatedText}</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-sm text-teal-600 hover:text-teal-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          Regenerate
        </button>
      </div>

      {data.summary && (
        <div className="bg-white border-l-4 border-teal-600 rounded-r-lg p-6 mb-6 shadow-sm">
          <p className="text-base text-gray-700 leading-relaxed">{data.summary}</p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Reports today" value={data.stats?.reports_today ?? 0} />
        <StatCard label="Reports this week" value={data.stats?.reports_7d ?? 0} />
        <StatCard label="Pending review" value={data.stats?.active_pending_clusters ?? 0} accent="text-amber-700" />
        <StatCard label="Verified outbreaks" value={data.stats?.active_verified_clusters ?? 0} accent="text-green-700" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-4">Reports per day (7d)</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={reportsPerDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-4">Symptom frequency (7d)</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={symptomData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#0d9488" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-4">Risk distribution (7d)</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={riskData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {riskData.map((entry, i) => (
                  <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-gray-400 mt-1">{riskTotal} total assessments</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-4">Top ZIP codes (7d)</p>
          <div className="flex flex-col gap-3">
            {(data.top_zips || []).map((z) => (
              <div key={z.zip} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{z.zip}</span>
                  <span className="text-xs text-gray-400">{z.count} reports</span>
                </div>
                <SeverityDot severity={z.highest_risk} />
              </div>
            ))}
            {(!data.top_zips || data.top_zips.length === 0) && (
              <p className="text-sm text-gray-400">No data yet</p>
            )}
          </div>
        </div>
      </div>

      {data.recent_global_alerts && data.recent_global_alerts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-4">Global outbreak alerts</p>
          <div className="flex flex-col gap-2">
            {data.recent_global_alerts.map((a, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <SeverityDot severity={a.severity} />
                <span className="text-gray-900 font-medium">{a.disease}</span>
                <span className="text-gray-400">{a.region}</span>
                <span className="text-xs text-gray-300 ml-auto">{a.transmission_type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
