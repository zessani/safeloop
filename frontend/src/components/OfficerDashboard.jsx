import { useState, useEffect, useCallback } from 'react'
import { fetchClusters, verifyCluster, dismissCluster, fetchClusterReports, fetchClusterTrajectory } from '../api'
import { useLanguage } from '../i18n/LanguageContext'
import DailyBriefing from './DailyBriefing'

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

const RISK_BADGE = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-green-100 text-green-700',
}

const OCCUPATION_LABELS = {
  student: 'Student',
  office: 'Office worker',
  healthcare: 'Healthcare worker',
  veterinary: 'Veterinary worker',
  agriculture: 'Agriculture worker',
  food_service: 'Food service worker',
  retail: 'Retail worker',
  construction: 'Construction worker',
  other: 'Other',
}

function formatAge(bracket) {
  if (!bracket) return '—'
  if (bracket === '65_plus') return '65+'
  return bracket.replace('_', '-')
}

function formatOccupation(occ) {
  return OCCUPATION_LABELS[occ] || occ
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

function Chevron({ expanded }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ClusterDetails({ cluster, reports }) {
  const { t } = useLanguage()
  const symptomCounts = {}
  for (const r of reports) {
    for (const s of r.symptoms) {
      symptomCounts[s] = (symptomCounts[s] || 0) + 1
    }
  }
  const sharedSymptoms = new Set(
    Object.entries(symptomCounts)
      .filter(([, count]) => count >= 3)
      .map(([sym]) => sym)
  )

  const sharedList = [...sharedSymptoms].map((s) => t('symptom_' + s))

  return (
    <div className="bg-slate-50 -mx-6 -mb-6 px-6 pb-6 pt-4 border-t border-gray-200 mt-4">
      <p className="text-xs text-gray-500 mb-3">
        {t('cluster_explanation', { zip: cluster.zip_code })}
      </p>

      {sharedList.length > 0 && (
        <p className="text-sm text-gray-700 mb-4">
          {t('shared_symptoms')} {sharedList.join(', ')}
        </p>
      )}

      <table className="w-full">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-500">
            <th className="text-left py-2 font-medium">{t('col_submitted')}</th>
            <th className="text-left py-2 font-medium">{t('col_age')}</th>
            <th className="text-left py-2 font-medium">{t('col_occupation')}</th>
            <th className="text-left py-2 font-medium">{t('col_symptoms')}</th>
            <th className="text-left py-2 font-medium">{t('col_indicators')}</th>
            <th className="text-left py-2 font-medium">{t('col_risk')}</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.report_id} className="border-b border-gray-200">
              <td className="py-2 text-xs text-gray-600 align-top">{timeAgo(r.submitted_at)}</td>
              <td className="py-2 text-xs text-gray-700 align-top">{formatAge(r.age_bracket)}</td>
              <td className="py-2 text-xs text-gray-700 align-top">{formatOccupation(r.occupation)}</td>
              <td className="py-2 align-top">
                <div className="flex flex-wrap gap-1">
                  {r.symptoms.map((s) => (
                    <span
                      key={s}
                      className={`px-2 py-0.5 rounded text-xs ${
                        sharedSymptoms.has(s)
                          ? 'bg-teal-100 text-teal-900'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {t('symptom_' + s)}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2 text-xs text-gray-600 align-top">
                <div className="flex gap-2">
                  {r.travel_history && <span>✈ {t('indicator_travel')}</span>}
                  {r.animal_contact && <span>🐾 {t('indicator_animal')}</span>}
                </div>
              </td>
              <td className="py-2 align-top">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_BADGE[r.risk_level] || ''}`}>
                  {r.risk_level}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TrajectoryWatchlist({ trajectory }) {
  const { t } = useLanguage()
  if (!trajectory) return null

  const hasDrift = trajectory.drift_distance_miles > 0.1
  const watchlist = trajectory.adjacent_at_risk_zips || []

  const likelihoodBadge = {
    HIGH: 'bg-red-100 text-red-700',
    MEDIUM: 'bg-amber-100 text-amber-700',
    LOW: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="bg-slate-50 -mx-6 -mb-6 px-6 pb-6 pt-4 border-t border-gray-200 mt-2">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
        {t('trajectory_title')}
      </p>

      <p className="text-sm text-gray-700 mb-3">
        {hasDrift
          ? t('trajectory_drift', {
              direction: trajectory.drift_direction,
              miles: trajectory.drift_distance_miles.toFixed(1),
              hours: trajectory.drift_period_hours,
            })
          : t('trajectory_stable')}
      </p>

      {watchlist.length > 0 && (
        <table className="w-full mb-3">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500">
              <th className="text-left py-2 font-medium">{t('col_zip')}</th>
              <th className="text-left py-2 font-medium">{t('col_distance')}</th>
              <th className="text-left py-2 font-medium">{t('col_overlap_reports')}</th>
              <th className="text-left py-2 font-medium">{t('col_spread_likelihood')}</th>
            </tr>
          </thead>
          <tbody>
            {watchlist.map((z) => (
              <tr key={z.zip} className="border-b border-gray-200">
                <td className="py-2 text-xs text-gray-700">{z.zip}</td>
                <td className="py-2 text-xs text-gray-600">{z.miles_from_centroid.toFixed(1)} mi</td>
                <td className="py-2 text-xs text-gray-600">{z.recent_overlap_reports}</td>
                <td className="py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${likelihoodBadge[z.spread_likelihood]}`}>
                    {z.spread_likelihood}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {watchlist.length === 0 && (
        <p className="text-sm text-gray-400 mb-3">{t('trajectory_no_adjacent')}</p>
      )}

      <p className="text-xs text-gray-400 italic">{t('trajectory_caveat')}</p>
    </div>
  )
}

function ClusterCard({ cluster, onAction, expanded, reports, reportsLoading, reportsError, onToggleExpand, trajectory }) {
  const { t } = useLanguage()
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
      <div
        className="flex items-center justify-between mb-3 cursor-pointer hover:bg-slate-50 -mx-2 px-2 py-1 rounded transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-gray-900">{t('cluster_zip')} {cluster.zip_code}</span>
          <span className="text-sm text-gray-400">{t('cluster_cases', { count: cluster.count })}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE[cluster.status]}`}>
            {cluster.status}
          </span>
          <Chevron expanded={expanded} />
        </div>
      </div>

      {cluster.dominant_symptoms && cluster.dominant_symptoms.length > 0 && (
        <p className="text-sm text-gray-500 mb-2">
          {t('dominant_symptoms')} {cluster.dominant_symptoms.join(', ')}
        </p>
      )}

      <p className="text-xs text-gray-400 mb-4">
        {t('first_detected')} {timeAgo(cluster.first_detected_at)}
      </p>

      {cluster.matched_alerts && cluster.matched_alerts.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{t('matched_global_alerts')}</p>
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
            placeholder={t('notes_placeholder')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-teal-600 resize-none h-20 mb-3"
          />
          <div className="flex gap-3">
            <button
              onClick={() => handleAction('verify')}
              disabled={loading}
              className="flex-1 bg-teal-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {t('verify_and_notify')}
            </button>
            <button
              onClick={() => handleAction('dismiss')}
              disabled={loading}
              className="flex-1 bg-white border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {t('dismiss_as_noise')}
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
            <p className="text-xs text-gray-400">{t('decided')} {timeAgo(cluster.verified_at)}</p>
          )}
        </div>
      )}

      {expanded && reportsLoading && (
        <div className="bg-slate-50 -mx-6 -mb-6 px-6 pb-6 pt-4 border-t border-gray-200 mt-4">
          <p className="text-sm text-gray-400 animate-pulse">{t('loading_reports')}</p>
        </div>
      )}

      {expanded && reportsError && (
        <div className="bg-slate-50 -mx-6 -mb-6 px-6 pb-6 pt-4 border-t border-gray-200 mt-4">
          <p className="text-sm text-gray-400">{reportsError}</p>
        </div>
      )}

      {expanded && reports && reports.length > 0 && (
        <ClusterDetails cluster={cluster} reports={reports} />
      )}

      {expanded && trajectory && (
        <TrajectoryWatchlist trajectory={trajectory} />
      )}
    </div>
  )
}

function OfficerLanguageToggle() {
  const { lang, setLanguage } = useLanguage()
  return (
    <div className="flex gap-1">
      {['en', 'es'].map((l) => (
        <button
          key={l}
          onClick={() => setLanguage(l)}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
            lang === l
              ? 'bg-teal-600 text-white'
              : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

export default function OfficerDashboard({ onBack, clusterUpdate }) {
  const { t } = useLanguage()
  const [clusters, setClusters] = useState([])
  const [tab, setTab] = useState('briefing')
  const [expandedClusterId, setExpandedClusterId] = useState(null)
  const [clusterReports, setClusterReports] = useState({})
  const [clusterTrajectories, setClusterTrajectories] = useState({})
  const [loadingReports, setLoadingReports] = useState(null)
  const [reportsError, setReportsError] = useState(null)

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

  useEffect(() => {
    setExpandedClusterId(null)
  }, [tab])

  async function handleToggleExpand(clusterId) {
    if (expandedClusterId === clusterId) {
      setExpandedClusterId(null)
      return
    }
    setExpandedClusterId(clusterId)
    setReportsError(null)
    if (!clusterReports[clusterId]) {
      setLoadingReports(clusterId)
      try {
        const reportsData = await fetchClusterReports(clusterId)
        if (reportsData.error) {
          setReportsError(reportsData.error)
        } else {
          setClusterReports((prev) => ({ ...prev, [clusterId]: reportsData.reports || [] }))
        }
      } catch {
        setReportsError(t('error_load_reports'))
      } finally {
        setLoadingReports(null)
      }
      try {
        const trajData = await fetchClusterTrajectory(clusterId)
        if (!trajData.error) {
          setClusterTrajectories((prev) => ({ ...prev, [clusterId]: trajData }))
        }
      } catch { /* trajectory is optional */ }
    }
  }

  const filtered = clusters.filter((c) => c.status === tab)
  const counts = {
    pending: clusters.filter((c) => c.status === 'pending').length,
    verified: clusters.filter((c) => c.status === 'verified').length,
    dismissed: clusters.filter((c) => c.status === 'dismissed').length,
  }

  const tabs = [
    { key: 'briefing', label: t('tab_daily_briefing') },
    { key: 'pending', label: t('tab_pending') },
    { key: 'verified', label: t('tab_verified') },
    { key: 'dismissed', label: t('tab_dismissed') },
  ]

  return (
    <div className="min-h-screen bg-slate-50 overflow-y-auto fixed inset-0 z-[2000]">
      <div className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('officer_dashboard_title')}</h1>
          <p className="text-xs text-gray-400">{t('mock_auth_note')}</p>
        </div>
        <div className="flex items-center gap-4">
          <OfficerLanguageToggle />
          <button
            onClick={onBack}
            className="text-sm text-teal-600 hover:text-teal-700 transition-colors cursor-pointer"
          >
            &larr; {t('back_to_map')}
          </button>
        </div>
      </div>

      <div className="px-8 pt-6 border-b border-gray-200 bg-white">
        <div className="flex gap-6 max-w-3xl mx-auto">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                tab === tb.key
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tb.label}{tb.key !== 'briefing' ? ` (${counts[tb.key]})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className={`${tab === 'briefing' ? 'max-w-5xl' : 'max-w-3xl'} mx-auto px-8 py-6`}>
        {tab === 'briefing' && <DailyBriefing />}
        {tab !== 'briefing' && filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">{t('no_clusters', { tab })}</p>
        )}
        {tab !== 'briefing' && filtered.map((c) => (
          <ClusterCard
            key={c.cluster_id}
            cluster={c}
            onAction={loadClusters}
            expanded={expandedClusterId === c.cluster_id}
            reports={clusterReports[c.cluster_id] || null}
            reportsLoading={loadingReports === c.cluster_id}
            reportsError={expandedClusterId === c.cluster_id ? reportsError : null}
            onToggleExpand={() => handleToggleExpand(c.cluster_id)}
            trajectory={clusterTrajectories[c.cluster_id] || null}
          />
        ))}
      </div>
    </div>
  )
}
