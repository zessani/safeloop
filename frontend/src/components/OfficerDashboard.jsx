import { useState, useEffect, useCallback } from 'react'
import { fetchClusters, verifyCluster, dismissCluster } from '../api'

const SEVERITY_DOTS = {
  LOW: 'bg-green-600',
  MEDIUM: 'bg-amber-500',
  HIGH: 'bg-red-600',
}

const STATUS_BADGE = {
  pending: 'bg-amber-50 text-amber-800',
  verified: 'bg-green-50 text-green-800',
  dismissed: 'bg-gray-100 text-gray-600',
}

function timeAgo(dateStr) {
  const date = new Date(dateStr)
  const seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function ClusterCard({ cluster, onAction }) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAction(action) {
    setLoading(true)
    try {
      if (action === 'verify') {
        await verifyCluster(cluster.cluster_id, notes)
      } else {
        await dismissCluster(cluster.cluster_id, notes)
      }
      onAction()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white shadow-sm rounded-lg p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-gray-900">ZIP {cluster.zip_code}</span>
          <span className="text-sm text-gray-400">{cluster.count} cases</span>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE[cluster.status]}`}>
          {cluster.status}
        </span>
      </div>

      {cluster.dominant_symptoms && cluster.dominant_symptoms.length > 0 && (
        <p className="text-sm text-gray-500 mb-2">
          Dominant symptoms: {cluster.dominant_symptoms.join(', ')}
        </p>
      )}

      <p className="text-xs text-gray-400 mb-4">
        First detected {timeAgo(cluster.first_detected_at)}
      </p>

      {cluster.matched_alerts && cluster.matched_alerts.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Matched global alerts</p>
          <div className="flex flex-col gap-1.5">
            {cluster.matched_alerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOTS[alert.severity]}`} />
                <span className="text-sm text-gray-700">{alert.disease}</span>
                <span className="text-xs text-gray-400">{alert.region}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cluster.status === 'pending' && (
        <div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about your verification decision..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-teal-600 resize-none h-20 mb-3"
          />
          <div className="flex gap-3">
            <button
              onClick={() => handleAction('verify')}
              disabled={loading}
              className="flex-1 bg-teal-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Verify and notify community
            </button>
            <button
              onClick={() => handleAction('dismiss')}
              disabled={loading}
              className="flex-1 bg-white border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Dismiss as noise
            </button>
          </div>
        </div>
      )}

      {(cluster.status === 'verified' || cluster.status === 'dismissed') && (
        <div>
          {cluster.officer_notes && (
            <div className="border-l-2 border-gray-200 bg-gray-50 rounded-r-lg px-4 py-3 mb-2">
              <p className="text-sm text-gray-600">{cluster.officer_notes}</p>
            </div>
          )}
          {cluster.verified_at && (
            <p className="text-xs text-gray-400">Decided {timeAgo(cluster.verified_at)}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function OfficerDashboard({ onBack, clusterUpdate }) {
  const [clusters, setClusters] = useState([])
  const [tab, setTab] = useState('pending')

  const loadClusters = useCallback(async () => {
    try {
      const data = await fetchClusters()
      setClusters(data.clusters || [])
    } catch {
      // backend not reachable
    }
  }, [])

  useEffect(() => {
    loadClusters()
  }, [loadClusters, clusterUpdate])

  const filtered = clusters.filter((c) => c.status === tab)
  const counts = {
    pending: clusters.filter((c) => c.status === 'pending').length,
    verified: clusters.filter((c) => c.status === 'verified').length,
    dismissed: clusters.filter((c) => c.status === 'dismissed').length,
  }

  const tabs = [
    { key: 'pending', label: 'Pending' },
    { key: 'verified', label: 'Verified' },
    { key: 'dismissed', label: 'Dismissed' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Public Health Officer Dashboard</h1>
          <p className="text-xs text-gray-400">(Mock — not real authentication)</p>
        </div>
        <button
          onClick={onBack}
          className="text-sm text-teal-600 hover:text-teal-700 transition-colors cursor-pointer"
        >
          &larr; Back to map
        </button>
      </div>

      <div className="px-8 pt-6 border-b border-gray-200 bg-white">
        <div className="flex gap-6 max-w-3xl mx-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                tab === t.key
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-6">
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">No {tab} clusters</p>
        )}
        {filtered.map((c) => (
          <ClusterCard key={c.cluster_id} cluster={c} onAction={loadClusters} />
        ))}
      </div>
    </div>
  )
}
