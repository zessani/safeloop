import { useState } from 'react'

const RISK_COLORS = {
  LOW: 'text-green-600',
  MEDIUM: 'text-amber-500',
  HIGH: 'text-red-600',
}

const BAR_COLORS = {
  LOW: 'bg-green-600',
  MEDIUM: 'bg-amber-500',
  HIGH: 'bg-red-600',
}

const SEVERITY_DOTS = {
  LOW: 'bg-green-600',
  MEDIUM: 'bg-amber-500',
  HIGH: 'bg-red-600',
}

function BucketRow({ bucket, isMax, riskLevel }) {
  const [expanded, setExpanded] = useState(false)
  const barColor = isMax ? BAR_COLORS[riskLevel] : 'bg-teal-600'

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
      >
        <span className="text-sm text-gray-700 w-24 text-left">{bucket.name}</span>
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full bar-fill ${barColor}`}
            style={{ width: `${bucket.score}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-900 w-12 text-right">{bucket.score}/100</span>
      </button>
      {expanded && bucket.factors && bucket.factors.length > 0 && (
        <div className="ml-2 pl-4 border-l-2 border-gray-100 mb-2">
          {bucket.factors.map((f, i) => (
            <p key={i} className="text-xs text-gray-500 py-0.5">{f}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function getCounty(zip) {
  if (zip.startsWith('857')) return 'Pima County'
  if (zip.startsWith('850') || zip.startsWith('852')) return 'Maricopa County'
  if (zip.startsWith('860')) return 'Coconino County'
  return 'your county'
}

function formatSym(s) {
  s = s.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const OCCUPATION_PHRASES = {
  student: null,
  healthcare: 'healthcare worker',
  agriculture: 'farm/agricultural worker',
  veterinary: 'veterinary worker',
  office: 'office worker',
  service: 'service industry worker',
  retired: null,
  other: 'worker',
}

function occupationSentence(occupation, zipCode, county) {
  if (occupation === 'student') return `I'm a student in zip code ${zipCode}, which is in ${county}.`
  if (occupation === 'retired') return `I'm retired and live in zip code ${zipCode}, which is in ${county}.`
  const phrase = OCCUPATION_PHRASES[occupation] || 'worker'
  const article = /^[aeiou]/i.test(phrase) ? 'an' : 'a'
  return `I work as ${article} ${phrase} in zip code ${zipCode}, which is in ${county}.`
}

const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 }

function sortAlerts(alerts, userSymptoms) {
  return [...alerts].sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
    if (sevDiff !== 0) return sevDiff
    const symSet = new Set(userSymptoms)
    const overlapA = (a.symptoms || []).filter((s) => symSet.has(s)).length
    const overlapB = (b.symptoms || []).filter((s) => symSet.has(s)).length
    if (overlapB !== overlapA) return overlapB - overlapA
    const usA = a.country === 'US' ? 0 : 1
    const usB = b.country === 'US' ? 0 : 1
    return usA - usB
  })
}

function formatDiseaseList(names) {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1]
}

function buildProviderMessage(formData, matchedAlerts) {
  const symptoms = formData.symptoms.map(formatSym).join(', ')
  const county = getCounty(formData.zipCode)
  let msg = `I'm reporting ${symptoms}. ${occupationSentence(formData.occupation, formData.zipCode, county)}`
  if (formData.animal) msg += ' I had recent animal contact.'
  if (formData.travel) msg += ' I had recent travel outside Arizona.'
  if (matchedAlerts && matchedAlerts.length > 0) {
    const sorted = sortAlerts(matchedAlerts, formData.symptoms)
    const top = sorted.slice(0, 3)
    const diseases = [...new Set(top.map((a) => a.disease))]
    const extra = sorted.length > 3 ? ' (among other less likely matches)' : ''
    msg += ` HealthPulse flagged ${formatDiseaseList(diseases)} as potentially relevant based on my symptom profile and current outbreak activity${extra}. Please consider these in your evaluation.`
  }
  return msg
}

function getWaitGuidance(oneHealth, formData, matchedAlerts) {
  const buckets = [oneHealth.human, oneHealth.animal, oneHealth.environment]
  const max = buckets.reduce((a, b) => (b.score > a.score ? b : a))

  if (max.name === 'Animal') {
    return [
      'Avoid contact with other animals or people while you wait for evaluation',
      'Wash hands thoroughly with soap; change clothing if you handled livestock',
      'Note any animals showing illness — your provider may want to know',
    ]
  }

  if (max.name === 'Environment') {
    const hasValleyFever = max.factors?.some((f) => f.toLowerCase().includes('valley fever'))
    const hasVector = matchedAlerts?.some((a) => a.transmission_type === 'vector_borne')

    if (hasValleyFever) {
      return [
        'Stay indoors when possible, especially during dust events',
        'Use a mask outdoors if dust is visible',
        'Drink fluids and rest',
      ]
    }
    if (hasVector) {
      return [
        'Use EPA-registered insect repellent (DEET, picaridin)',
        'Cover exposed skin during dawn/dusk hours',
        'Eliminate standing water around your home',
      ]
    }
  }

  if (max.name === 'Human') {
    const hasResp = formData.symptoms.includes('cough') || formData.symptoms.includes('difficulty_breathing')
    if (hasResp) {
      return [
        'Monitor breathing — seek emergency care if you can\'t speak in full sentences or feel chest pain',
        'Rest and stay hydrated',
        'Isolate from others if possible until evaluated',
      ]
    }
  }

  return [
    'Rest and stay hydrated',
    'Monitor your symptoms — contact a provider if they worsen',
    'Isolate from others if possible',
  ]
}

function ActionCard({ result, formData }) {
  const [copied, setCopied] = useState(false)

  if (result.risk_level !== 'HIGH' || !formData) return null

  const showER = formData.symptoms.includes('difficulty_breathing') || result.total_score >= 0.85
  const message = buildProviderMessage(formData, result.matched_alerts)
  const guidance = getWaitGuidance(result.one_health, formData, result.matched_alerts)

  function handleCopy() {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mb-6 mt-6 space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Get evaluated</p>
        <div className="flex flex-col gap-3">
          {showER && (
            <div>
              <p className="text-sm font-medium text-red-700">Emergency room</p>
              <p className="text-sm text-red-700/80">Call 911 or go now if symptoms feel severe</p>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-900">Telehealth</p>
            <p className="text-sm text-gray-500">Connect with a provider in 15 minutes. Best for assessment without leaving home</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Urgent care</p>
            <p className="text-sm text-gray-500">Tucson area locations open until 9pm. Walk-in evaluation if symptoms persist or worsen</p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">What to tell your provider</p>
        <div className="border-l-3 border-teal-600 bg-gray-50 rounded-r-lg px-3 py-3">
          <p className="text-sm text-gray-700 leading-relaxed">{message}</p>
        </div>
        <button
          onClick={handleCopy}
          className="mt-2 text-xs text-teal-600 hover:text-teal-700 transition-colors cursor-pointer"
        >
          {copied ? 'Copied \u2713' : 'Copy message'}
        </button>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">While you wait</p>
        <div className="flex flex-col gap-2">
          {guidance.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-2 flex-shrink-0" />
              <p className="text-sm text-gray-700">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function stripMarkdown(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
}

export default function RiskProfile({ result, formData, onReset }) {
  const { risk_level, narrative, one_health, matched_alerts, weather } = result
  const buckets = [one_health.human, one_health.animal, one_health.environment]
  const maxScore = Math.max(...buckets.map((b) => b.score))
  const sortedAlerts = matched_alerts && formData
    ? sortAlerts(matched_alerts, formData.symptoms)
    : matched_alerts || []

  return (
    <div className="fixed top-6 right-6 w-[360px] bg-white shadow-md rounded-lg p-6 z-[1000] max-h-[calc(100vh-48px)] overflow-y-auto">
      <div className="mb-4">
        <p className={`text-2xl font-bold ${RISK_COLORS[risk_level]}`}>{risk_level}</p>
        <p className="text-xs text-gray-400 mt-1">
          {weather.temp.toFixed(1)}&deg;C &middot; {weather.humidity}% humidity &middot; {weather.description}
        </p>
      </div>

      <div className="border-l-2 border-teal-600 bg-gray-50 rounded-r-lg px-4 py-3 mb-6">
        <p className="text-sm text-gray-700 leading-relaxed">{stripMarkdown(narrative)}</p>
      </div>

      <div className="mb-6">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">One Health Breakdown</p>
        {buckets.map((b) => (
          <BucketRow
            key={b.name}
            bucket={b}
            isMax={b.score === maxScore}
            riskLevel={risk_level}
          />
        ))}
      </div>

      <ActionCard result={result} formData={formData} />

      {sortedAlerts.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Matched Alerts</p>
          <div className="flex flex-col gap-2">
            {sortedAlerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOTS[alert.severity]}`} />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900">{alert.disease}</span>
                  <span className="text-xs text-gray-400 ml-1.5">{alert.region}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onReset}
        className="text-sm text-teal-600 hover:text-teal-700 transition-colors cursor-pointer"
      >
        Submit another report
      </button>
    </div>
  )
}
