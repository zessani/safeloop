function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export default function ClusterList({ clusters }) {
  if (!clusters || clusters.length === 0) return null

  return (
    <div className="fixed bottom-6 left-6 w-[320px] bg-white shadow-md rounded-lg p-4 z-[1000] max-h-[240px] overflow-y-auto">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Cluster Alerts</p>
      <div className="flex flex-col gap-2">
        {clusters.slice(0, 5).map((c, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0 mt-1.5" />
            <div className="min-w-0">
              <span className="font-medium text-gray-900">ZIP {c.zip_code}</span>
              <span className="text-gray-400 ml-1.5">{c.count} cases</span>
              <p className="text-xs text-gray-400 truncate">{timeAgo(c.receivedAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
