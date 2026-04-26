import { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Circle, CircleMarker, Marker, Popup, GeoJSON, Tooltip, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { useLanguage } from '../i18n/LanguageContext'
import { COUNTY_POPULATION, ZIP_TO_COUNTY, GEOJSON_URL } from '../data/arizonaCounties'

const ZIP_COORDS = {
  '85701': [32.221, -110.926],
  '85702': [32.210, -110.960],
  '85704': [32.295, -110.980],
  '85705': [32.262, -110.978],
  '85706': [32.160, -110.940],
  '85708': [32.180, -110.860],
  '85710': [32.220, -110.830],
  '85711': [32.215, -110.880],
  '85712': [32.240, -110.880],
  '85713': [32.210, -110.990],
  '85714': [32.175, -110.935],
  '85715': [32.240, -110.830],
  '85716': [32.236, -110.917],
  '85717': [32.250, -110.930],
  '85718': [32.314, -110.928],
  '85719': [32.241, -110.948],
  '85721': [32.232, -110.951],
  '85730': [32.210, -110.800],
  '85735': [32.130, -111.170],
  '85737': [32.410, -110.920],
  '85739': [32.430, -110.830],
  '85741': [32.340, -111.040],
  '85742': [32.380, -111.060],
  '85743': [32.290, -111.120],
  '85745': [32.240, -111.020],
  '85746': [32.130, -111.030],
  '85747': [32.140, -110.830],
  '85748': [32.190, -110.790],
  '85749': [32.280, -110.790],
  '85750': [32.300, -110.840],
  '85755': [32.420, -110.960],
  '85756': [32.100, -110.870],
  '85004': [33.451, -112.073],
  '85008': [33.461, -112.013],
  '85032': [33.618, -112.028],
  '85044': [33.310, -111.982],
  '85281': [33.425, -111.939],
  '85201': [33.415, -111.831],
  '85210': [33.381, -111.841],
  '85224': [33.303, -111.841],
  '85248': [33.248, -111.855],
  '86001': [35.198, -111.651],
}

const RISK_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 }

const RISK_FILL = {
  HIGH: { color: '#dc2626', border: '#991b1b', opacity: 0.55 },
  MEDIUM: { color: '#f59e0b', border: '#b45309', opacity: 0.6 },
  LOW: { color: '#16a34a', border: '#15803d', opacity: 0.55 },
}

function pendingIcon(count) {
  return L.divIcon({
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<div style="width:44px;height:44px;border-radius:50%;background:white;border:4px solid #dc2626;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#b91c1c;box-shadow:0 2px 4px rgba(0,0,0,0.2)">${count}</div>`,
  })
}

const verifiedIcon = L.divIcon({
  className: '',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  html: `<div style="width:44px;height:44px;border-radius:50%;background:#0d9488;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.2)"><svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`,
})

function CountyPanel({ county, reports, clusters, onClose }) {
  const { t } = useLanguage()
  const population = COUNTY_POPULATION[county] || 0
  const countyZips = Object.entries(ZIP_TO_COUNTY)
    .filter(([, c]) => c === county)
    .map(([z]) => z)

  const countyReports = reports.filter((r) => countyZips.includes(r.zip_code))
  const activeClusters = clusters.filter(
    (c) => countyZips.includes(c.zip_code) && (c.status === 'pending' || c.status === 'verified')
  )

  const symCounts = {}
  for (const r of countyReports) {
    for (const s of r.symptoms) {
      symCounts[s] = (symCounts[s] || 0) + 1
    }
  }
  const topSymptoms = Object.entries(symCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s]) => t('symptom_' + s))

  const rate = population > 0 ? ((countyReports.length / population) * 10000).toFixed(1) : '0.0'

  return (
    <div className="fixed right-6 top-6 z-[1100] w-80 bg-white shadow-lg rounded-lg p-6">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <h2 className="text-xl font-semibold text-gray-900 mb-1">{county} County</h2>
      <p className="text-sm text-gray-500 mb-4">{t('county_panel_population')} {population.toLocaleString()}</p>

      <div className="border-t border-gray-200 pt-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">{t('county_panel_last_7d')}</p>

        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">{t('county_panel_total_reports')}</span>
            <span className="font-medium text-gray-900">{countyReports.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('county_panel_active_clusters')}</span>
            <span className="font-medium text-gray-900">{activeClusters.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('county_panel_reporting_rate')}</span>
            <span className="font-medium text-gray-900">{t('county_panel_per_10k', { rate })}</span>
          </div>
        </div>

        {topSymptoms.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">{t('county_panel_top_symptoms')}</p>
            <div className="flex flex-wrap gap-1.5">
              {topSymptoms.map((s) => (
                <span key={s} className="bg-teal-50 text-teal-800 px-2 py-0.5 rounded text-xs">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MapControls({ timeRange, setTimeRange, filters, setFilters, hidden }) {
  const { t } = useLanguage()
  if (hidden) return null

  const ranges = [
    { key: '24h', label: '24h' },
    { key: '7d', label: '7d' },
    { key: '30d', label: '30d' },
  ]

  const toggles = [
    { key: 'reports', label: t('filter_reports') },
    { key: 'pending', label: t('filter_pending') },
    { key: 'verified', label: t('filter_verified') },
    { key: 'trajectory', label: t('filter_trajectory') },
  ]

  return (
    <div className="fixed top-6 right-6 z-[1000] w-56 bg-white shadow-md rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{t('time_range')}</p>
      <div className="flex gap-1.5 mb-4">
        {ranges.map((r) => (
          <button
            key={r.key}
            onClick={() => setTimeRange(r.key)}
            className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
              timeRange === r.key
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{t('show_filters')}</p>
      <div className="flex flex-col gap-1.5">
        {toggles.map((tgl) => (
          <button
            key={tgl.key}
            onClick={() => setFilters((prev) => ({ ...prev, [tgl.key]: !prev[tgl.key] }))}
            className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer py-1"
          >
            <span
              className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
                filters[tgl.key] ? 'bg-teal-600 border-teal-600' : 'border-gray-300'
              }`}
            >
              {filters[tgl.key] && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            {tgl.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function MapLegend() {
  const { t } = useLanguage()
  return (
    <div className="fixed bottom-[270px] left-6 z-[900] w-52 bg-white shadow-md rounded-lg p-3 text-xs">
      <p className="font-medium text-gray-500 uppercase tracking-wide mb-2.5">{t('legend_title')}</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-teal-600 flex-shrink-0" style={{ opacity: 0.65 }} />
          <span className="text-gray-700">{t('legend_individual')}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-white border-2 border-red-600 flex-shrink-0" />
          <div>
            <span className="text-gray-700">{t('legend_pending')}</span>
            <span className="text-gray-400 block leading-tight">{t('legend_pending_desc')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-teal-600 flex-shrink-0 flex items-center justify-center">
            <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <span className="text-gray-700">{t('legend_verified')}</span>
            <span className="text-gray-400 block leading-tight">{t('legend_verified_desc')}</span>
          </div>
        </div>
        <div className="flex items-start gap-2.5 pt-1 border-t border-gray-100 mt-0.5">
          <div className="flex gap-px flex-shrink-0 mt-0.5">
            <span className="w-2.5 h-3 rounded-sm" style={{ background: '#16a34a', opacity: 0.3 }} />
            <span className="w-2.5 h-3 rounded-sm" style={{ background: '#f59e0b', opacity: 0.4 }} />
            <span className="w-2.5 h-3 rounded-sm" style={{ background: '#dc2626', opacity: 0.5 }} />
          </div>
          <div>
            <span className="text-gray-700">{t('legend_county')}</span>
            <span className="text-gray-400 block leading-tight">{t('legend_county_desc')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MapFooter({ reports }) {
  const { t } = useLanguage()
  const [secondsAgo, setSecondsAgo] = useState(0)

  useEffect(() => {
    setSecondsAgo(0)
  }, [reports])

  useEffect(() => {
    const timer = setInterval(() => setSecondsAgo((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const updatedTime = secondsAgo < 5 ? t('just_now') : t('updated_seconds', { count: secondsAgo })

  return (
    <div className="fixed bottom-6 left-[340px] z-[1000]">
      <p className="text-xs text-gray-500">
        {t('coverage_footer', { time: updatedTime, date: dateStr })}
      </p>
    </div>
  )
}

export default function MapView({ reports = [], clusters = [], trajectories = {}, timeRange, setTimeRange }) {
  const { t } = useLanguage()
  const [countyGeoJSON, setCountyGeoJSON] = useState(null)
  const [selectedCounty, setSelectedCounty] = useState(null)
  const [filters, setFilters] = useState({ reports: true, pending: true, verified: true, trajectory: false })
  const [geoKey, setGeoKey] = useState(0)

  useEffect(() => {
    fetch(GEOJSON_URL)
      .then((r) => r.json())
      .then(setCountyGeoJSON)
      .catch(() => {})
  }, [])

  const clusterZipSet = useMemo(() => {
    const s = new Set()
    for (const c of clusters) {
      if (c.status === 'pending' || c.status === 'verified') s.add(c.zip_code)
    }
    return s
  }, [clusters])

  const countyRisk = useMemo(() => {
    const risk = {}
    for (const r of reports) {
      const county = ZIP_TO_COUNTY[r.zip_code]
      if (!county) continue
      const rank = RISK_RANK[r.risk_level] || 0
      if (!risk[county] || rank > RISK_RANK[risk[county]]) {
        risk[county] = r.risk_level
      }
    }
    return risk
  }, [reports])

  useEffect(() => {
    setGeoKey((k) => k + 1)
  }, [countyRisk])

  const byZip = useMemo(() => {
    const data = {}
    for (const r of reports) {
      if (!data[r.zip_code]) {
        data[r.zip_code] = { count: 0, highestRisk: 'LOW' }
      }
      data[r.zip_code].count++
      if ((RISK_RANK[r.risk_level] || 0) > (RISK_RANK[data[r.zip_code].highestRisk] || 0)) {
        data[r.zip_code].highestRisk = r.risk_level
      }
    }
    return data
  }, [reports])

  function countyStyle(feature) {
    const name = feature.properties.name
    const risk = countyRisk[name]
    let fillColor = 'transparent'
    let fillOpacity = 0
    if (risk === 'HIGH') { fillColor = '#dc2626'; fillOpacity = 0.15 }
    else if (risk === 'MEDIUM') { fillColor = '#f59e0b'; fillOpacity = 0.10 }
    else if (risk === 'LOW') { fillColor = '#16a34a'; fillOpacity = 0.05 }

    return {
      weight: 1,
      color: '#94a3b8',
      fillColor,
      fillOpacity,
    }
  }

  function onEachCounty(feature, layer) {
    layer.on('click', () => {
      setSelectedCounty(feature.properties.name)
    })
  }

  const reportMarkers = useMemo(() => {
    if (!filters.reports) return []
    return Object.entries(byZip)
      .filter(([zip]) => !clusterZipSet.has(zip) && ZIP_COORDS[zip])
      .map(([zip, { count, highestRisk }]) => ({
        zip,
        count,
        highestRisk,
        coords: ZIP_COORDS[zip],
      }))
  }, [byZip, clusterZipSet, filters.reports])

  const pendingClusters = useMemo(() => {
    if (!filters.pending) return []
    return clusters.filter((c) => c.status === 'pending' && ZIP_COORDS[c.zip_code])
  }, [clusters, filters.pending])

  const verifiedClusters = useMemo(() => {
    if (!filters.verified) return []
    return clusters.filter((c) => c.status === 'verified' && ZIP_COORDS[c.zip_code])
  }, [clusters, filters.verified])

  const dismissedClusters = useMemo(() => {
    return clusters.filter((c) => c.status === 'dismissed' && ZIP_COORDS[c.zip_code])
  }, [clusters])

  return (
    <>
      <MapContainer
        center={[33.5, -111.5]}
        zoom={7}
        zoomControl={false}
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />

        {countyGeoJSON && (
          <GeoJSON
            key={geoKey}
            data={countyGeoJSON}
            style={countyStyle}
            onEachFeature={onEachCounty}
          >
            {countyGeoJSON.features &&
              countyGeoJSON.features.map((f) => {
                const center = L.geoJSON(f).getBounds().getCenter()
                return (
                  <Marker
                    key={f.properties.name}
                    position={[center.lat, center.lng]}
                    icon={L.divIcon({
                      className: '',
                      iconSize: [0, 0],
                      html: '',
                    })}
                    interactive={false}
                  >
                    <Tooltip
                      permanent
                      direction="center"
                      className="county-label"
                    >
                      {f.properties.name}
                    </Tooltip>
                  </Marker>
                )
              })}
          </GeoJSON>
        )}

        {reportMarkers.map(({ zip, count, highestRisk, coords }) => {
          const style = RISK_FILL[highestRisk] || RISK_FILL.LOW
          const radius = Math.min(8 + (count - 1) * 2, 18)
          return (
            <CircleMarker
              key={`r-${zip}`}
              center={coords}
              radius={radius}
              pathOptions={{
                fillColor: style.color,
                fillOpacity: style.opacity,
                color: style.border,
                weight: 1,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <span className="font-semibold">ZIP {zip}</span>
                  <br />
                  {count > 1 ? t('report_count_plural', { count }) : t('report_count', { count })}
                  <span className="block text-xs text-gray-500">{t('risk_label', { level: highestRisk })}</span>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}

        {verifiedClusters.map((c) => {
          const coords = ZIP_COORDS[c.zip_code]
          if (!coords) return null
          if (c.risk_level === 'HIGH') {
            return (
              <span key={`ring-${c.cluster_id}`}>
                <Circle center={coords} radius={4828} pathOptions={{ fillColor: '#f59e0b', fillOpacity: 0.04, weight: 0 }} interactive={false} />
                <Circle center={coords} radius={1609} pathOptions={{ fillColor: '#dc2626', fillOpacity: 0.06, weight: 0 }} interactive={false} />
              </span>
            )
          }
          if (c.risk_level === 'MEDIUM') {
            return (
              <Circle key={`ring-${c.cluster_id}`} center={coords} radius={3219} pathOptions={{ fillColor: '#f59e0b', fillOpacity: 0.04, weight: 0 }} interactive={false} />
            )
          }
          return null
        })}

        {pendingClusters.map((c) => (
          <Marker
            key={`pc-${c.cluster_id}`}
            position={ZIP_COORDS[c.zip_code]}
            icon={pendingIcon(c.count)}
          >
            <Popup>
              <div className="text-sm">
                <span className="font-semibold">ZIP {c.zip_code}</span>
                <span className="text-red-600 font-semibold block">{t('pending_cluster')}</span>
                <span className="text-gray-500">{t('cluster_cases', { count: c.count })}</span>
              </div>
            </Popup>
          </Marker>
        ))}

        {verifiedClusters.map((c) => (
          <Marker
            key={`vc-${c.cluster_id}`}
            position={ZIP_COORDS[c.zip_code]}
            icon={verifiedIcon}
          >
            <Popup>
              <div className="text-sm">
                <span className="font-semibold">ZIP {c.zip_code}</span>
                <span className="text-green-600 font-semibold block">{t('cluster_verified')}</span>
                <span className="text-gray-500">{t('cluster_cases', { count: c.count })}</span>
              </div>
            </Popup>
          </Marker>
        ))}

        {dismissedClusters.map((c) => (
          <CircleMarker
            key={`dc-${c.cluster_id}`}
            center={ZIP_COORDS[c.zip_code]}
            radius={14}
            pathOptions={{
              fillColor: '#9ca3af',
              fillOpacity: 0.5,
              weight: 0,
            }}
          >
            <Popup>
              <div className="text-sm">
                <span className="font-semibold">ZIP {c.zip_code}</span>
                <span className="text-gray-500 block">{t('dismissed_cluster')}</span>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {filters.trajectory && Object.values(trajectories).map((traj) => {
          const points = traj.trajectory || []
          if (points.length < 2) return null
          const positions = points.map((p) => [p.lat, p.lng])
          const last = positions[positions.length - 1]
          const prev = positions[positions.length - 2]
          const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0]) * 180 / Math.PI
          return (
            <span key={`traj-${traj.cluster_id}`}>
              <Polyline
                positions={positions}
                pathOptions={{ color: '#dc2626', weight: 2, dashArray: '6 4' }}
              />
              <Marker
                position={last}
                icon={L.divIcon({
                  className: '',
                  iconSize: [12, 12],
                  iconAnchor: [6, 6],
                  html: `<svg width="12" height="12" viewBox="0 0 12 12" style="transform:rotate(${90 - angle}deg)"><polygon points="6,0 12,12 0,12" fill="#dc2626"/></svg>`,
                })}
                interactive={false}
              />
            </span>
          )
        })}

        {filters.trajectory && Object.values(trajectories).flatMap((traj) =>
          (traj.adjacent_at_risk_zips || []).map((z) => {
            const coords = ZIP_COORDS[z.zip]
            if (!coords) return null
            return (
              <CircleMarker
                key={`adj-${z.zip}`}
                center={coords}
                radius={12}
                pathOptions={{
                  fillColor: '#f59e0b',
                  fillOpacity: 0.3,
                  color: '#f59e0b',
                  weight: 1,
                }}
              >
                <Tooltip>{`${z.zip} — ${z.spread_likelihood} (${z.miles_from_centroid.toFixed(1)} mi)`}</Tooltip>
              </CircleMarker>
            )
          })
        )}
      </MapContainer>

      <MapControls
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        filters={filters}
        setFilters={setFilters}
        hidden={selectedCounty !== null}
      />

      <MapLegend />
      <MapFooter reports={reports} />

      {selectedCounty && (
        <CountyPanel
          county={selectedCounty}
          reports={reports}
          clusters={clusters}
          onClose={() => setSelectedCounty(null)}
        />
      )}
    </>
  )
}
