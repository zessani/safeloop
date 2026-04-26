import { useState, useEffect, useCallback } from 'react'
import MapView from './components/Map'
import SymptomForm from './components/SymptomForm'
import RiskProfile from './components/RiskProfile'
import ClusterAlertToast from './components/ClusterAlertToast'
import ClusterList from './components/ClusterList'
import OfficerDashboard from './components/OfficerDashboard'
import { fetchReports, fetchClusters, useWebSocket } from './api'

export default function App() {
  const [view, setView] = useState('map')
  const [reportData, setReportData] = useState(null)
  const [result, setResult] = useState(null)
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

  const loadClusterStatus = useCallback(async () => {
    try {
      const data = await fetchClusters()
      const verified = new Set()
      const clustered = new Set()
      for (const c of (data.clusters || [])) {
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
    loadClusterStatus()
  }, [loadReports, loadClusterStatus])

  useEffect(() => {
    loadClusterStatus()
  }, [clusterUpdate, loadClusterStatus])

  useEffect(() => {
    if (lastClusterAlert) {
      setClusterZips((prev) => new Set([...prev, lastClusterAlert.zip_code]))
      setCurrentToast(lastClusterAlert)
    }
  }, [lastClusterAlert])

  function handleResult(data) {
    setResult(data)
    setShowForm(false)
    loadReports()
    loadClusterStatus()
  }

  function handleReset() {
    setResult(null)
    setShowForm(true)
  }

  if (view === 'officer') {
    return (
      <OfficerDashboard
        onBack={() => { setView('map'); loadClusterStatus() }}
        clusterUpdate={clusterUpdate}
      />
    )
  }

  const total = reportData?.total || 0

  return (
    <>
      <MapView reportData={reportData} clusterZips={clusterZips} verifiedZips={verifiedZips} />

      <div className="fixed top-6 left-6 z-[1000]">
        <h1 className="text-xl font-semibold text-gray-900 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md">
          HealthPulse
        </h1>
        {total > 0 && (
          <p className="text-xs text-gray-500 mt-1.5 ml-1">{total} report{total !== 1 ? 's' : ''} submitted</p>
        )}
        <button
          onClick={() => setView('officer')}
          className="mt-2 ml-1 text-xs text-teal-600 hover:text-teal-700 transition-colors cursor-pointer"
        >
          Officer view &rarr;
        </button>
      </div>

      {showForm ? (
        <SymptomForm onResult={handleResult} />
      ) : (
        <RiskProfile result={result} onReset={handleReset} />
      )}

      <ClusterAlertToast
        alert={currentToast}
        onDismiss={() => setCurrentToast(null)}
      />

      <ClusterList clusters={clusterAlerts} />
    </>
  )
}
