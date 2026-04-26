import { useEffect } from 'react'

export default function ClusterAlertToast({ alert, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [alert, onDismiss])

  if (!alert) return null

  return (
    <div className="fixed top-6 right-[396px] z-[1001] slide-in-right">
      <div className="bg-white shadow-md rounded-lg border-l-4 border-red-600 px-4 py-3 max-w-sm flex items-start gap-3">
        <p className="text-sm text-gray-700 flex-1">{alert.message}</p>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 text-sm leading-none flex-shrink-0 cursor-pointer"
        >
          &times;
        </button>
      </div>
    </div>
  )
}
