import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'

const ZIP_COORDS = {
  '85701': [32.221, -110.926],
  '85705': [32.262, -110.978],
  '85716': [32.236, -110.917],
  '85718': [32.314, -110.928],
  '85719': [32.241, -110.948],
  '85721': [32.232, -110.951],
  '85004': [33.451, -112.073],
  '85281': [33.425, -111.939],
  '86001': [35.198, -111.651],
}

function FlyToTucson() {
  const map = useMap()
  const hasMoved = useRef(false)

  useEffect(() => {
    if (!hasMoved.current) {
      hasMoved.current = true
      setTimeout(() => {
        map.flyTo([32.2, -110.9], 11, { duration: 1.5 })
      }, 800)
    }
  }, [map])

  return null
}

export default function MapView({ reportData, clusterZips, verifiedZips = new Set() }) {
  const byZip = reportData?.by_zip || {}

  return (
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
      <FlyToTucson />
      {Object.entries(byZip).map(([zip, count]) => {
        const coords = ZIP_COORDS[zip]
        if (!coords) return null

        const isCluster = clusterZips.has(zip)
        const isVerified = verifiedZips.has(zip)
        const radius = Math.min(8 + count * 2, 24)

        return (
          <CircleMarker
            key={zip}
            center={coords}
            radius={radius}
            pathOptions={{
              fillColor: isCluster ? '#dc2626' : '#0d9488',
              fillOpacity: isCluster ? 0.8 : 0.6,
              color: isCluster ? '#dc2626' : '#0d9488',
              weight: isCluster ? 2 : 1,
            }}
            className={isCluster ? 'cluster-pulse' : ''}
          >
            <Popup>
              <div className="text-sm">
                <span className="font-semibold">ZIP {zip}</span>
                <br />
                {count} report{count !== 1 ? 's' : ''}
                {isCluster && !isVerified && <span className="text-red-600 font-semibold block">Cluster detected</span>}
                {isVerified && <span className="text-green-600 font-semibold block">Cluster verified</span>}
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
