import { useState, useEffect, useCallback } from 'react'
import MapView from './components/Map'
import SymptomForm from './components/SymptomForm'
import RiskProfile from './components/RiskProfile'
import ClusterAlertToast from './components/ClusterAlertToast'
import ClusterList from './components/ClusterList'
import OfficerDashboard from './components/OfficerDashboard'
import { LanguageProvider, useLanguage } from './i18n/LanguageContext'
import { fetchReports, fetchReportsList, fetchClusters, useWebSocket } from './api'

function LanguageToggle() {
  const { lang, setLanguage } = useLanguage()
  return (
    <div className="flex gap-1 mt-2 ml-1">
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

function AppInner() {
  const [view, setView] = useState('map')
  const [reportData, setReportData] = useState(null)
  const [reportsList, setReportsList] = useState([])
  const [clustersArray, setClustersArray] = useState([])
  const [timeRange, setTimeRange] = useState('7d')
  const [result, setResult] = useState(null)
  const [formData, setFormData] = useState(null)
  const [showForm, setShowForm] = useState(true)
  const [clusterZips, setClusterZips] = useState(new Set())
  const [verifiedZips, setVerifiedZips] = useState(new Set())
  const [currentToast, setCurrentToast] = useState(null)

  const { clusterAlerts, lastClusterAlert, clusterUpdate } = useWebSocket()

  const loadReports = useCallback(async () => {
    try {
      const data = await fetchReports()
      setReportData(data)
    } catch {
      // backend not reachable
    }
  }, [])

  const loadReportsList = useCallback(async (range) => {
    try {
      const data = await fetchReportsList(range)
      setReportsList(data.reports || [])
    } catch {
      // backend not reachable
    }
  }, [])

  const loadClusterStatus = useCallback(async () => {
    try {
      const data = await fetchClusters()
      const all = data.clusters || []
      setClustersArray(all)
      const verified = new Set()
      const clustered = new Set()
      for (const c of all) {
        if (c.status === 'verified') verified.add(c.zip_code)
        if (c.status === 'pending' || c.status === 'verified') clustered.add(c.zip_code)
      }
      setVerifiedZips(verified)
      setClusterZips(clustered)
    } catch {
      // backend not reachable
    }
  }, [])

  useEffect(() => {
    loadReports()
    loadReportsList(timeRange)
    loadClusterStatus()
  }, [loadReports, loadReportsList, loadClusterStatus, timeRange])

  useEffect(() => {
    loadClusterStatus()
  }, [clusterUpdate, loadClusterStatus])

  useEffect(() => {
    if (lastClusterAlert) {
      setClusterZips((prev) => new Set([...prev, lastClusterAlert.zip_code]))
      setCurrentToast(lastClusterAlert)
    }
  }, [lastClusterAlert])

  function handleTimeRange(range) {
    setTimeRange(range)
    loadReportsList(range)
  }

  function handleResult(data, form) {
    setResult(data)
    setFormData(form)
    setShowForm(false)
    loadReports()
    loadReportsList(timeRange)
    loadClusterStatus()
  }

  function handleReset() {
    setResult(null)
    setShowForm(true)
  }

  if (view === 'officer') {
    return (
      <OfficerDashboard
        onBack={() => { setView('map'); loadClusterStatus(); loadReportsList(timeRange) }}
        clusterUpdate={clusterUpdate}
      />
    )
  }

  const { t } = useLanguage()
  const total = reportData?.total || 0

  return (
    <>
      <MapView
        reports={reportsList}
        clusters={clustersArray}
        timeRange={timeRange}
        setTimeRange={handleTimeRange}
      />

      <div className="fixed top-6 left-6 z-[1000]">
        <h1 className="text-xl font-semibold text-gray-900 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md">
          SafeLoop
        </h1>
        {total > 0 && (
          <p className="text-xs text-gray-500 mt-1.5 ml-1">{t('reports_submitted', { count: total })}</p>
        )}
        <button
          onClick={() => setView('officer')}
          className="mt-2 ml-1 text-xs text-teal-600 hover:text-teal-700 transition-colors cursor-pointer"
        >
          {t('officer_view')} &rarr;
        </button>
        <LanguageToggle />
      </div>

      {showForm ? (
        <SymptomForm onResult={handleResult} />
      ) : (
        <RiskProfile result={result} formData={formData} onReset={handleReset} />
      )}

      <ClusterAlertToast
        alert={currentToast}
        onDismiss={() => setCurrentToast(null)}
      />

      <ClusterList clusters={clusterAlerts} />
    </>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  )
}
