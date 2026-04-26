import { useState, useEffect, useRef, useCallback } from 'react'

export async function fetchReports(zip) {
  const url = zip ? `/api/reports?zip=${zip}` : '/api/reports'
  const res = await fetch(url)
  return res.json()
}

export async function submitReport(data) {
  const res = await fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function fetchClusters() {
  const res = await fetch('/api/clusters')
  return res.json()
}

export async function verifyCluster(id, notes) {
  const res = await fetch(`/api/clusters/${id}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officer_notes: notes }),
  })
  return res.json()
}

export async function fetchBriefing() {
  const res = await fetch('/api/officer/briefing')
  return res.json()
}

export async function fetchClusterReports(id) {
  const res = await fetch(`/api/clusters/${id}/reports`)
  return res.json()
}

export async function dismissCluster(id, notes) {
  const res = await fetch(`/api/clusters/${id}/dismiss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officer_notes: notes }),
  })
  return res.json()
}

export function useWebSocket() {
  const [clusterAlerts, setClusterAlerts] = useState([])
  const [lastClusterAlert, setLastClusterAlert] = useState(null)
  const [clusterUpdate, setClusterUpdate] = useState(0)
  const wsRef = useRef(null)
  const retryRef = useRef(1000)

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/alerts`)
    wsRef.current = ws

    ws.onopen = () => {
      retryRef.current = 1000
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'cluster_alert') {
        const alert = { ...msg.payload, receivedAt: new Date() }
        setClusterAlerts((prev) => [alert, ...prev].slice(0, 20))
        setLastClusterAlert(alert)
      }
      if (msg.type === 'cluster_verified' || msg.type === 'cluster_dismissed') {
        setClusterUpdate((prev) => prev + 1)
      }
    }

    ws.onclose = () => {
      const delay = Math.min(retryRef.current, 16000)
      retryRef.current = delay * 2
      setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])

  return { clusterAlerts, lastClusterAlert, setLastClusterAlert, clusterUpdate }
}
