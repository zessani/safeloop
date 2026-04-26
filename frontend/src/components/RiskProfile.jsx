import { useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'

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

const FACTOR_TRANSLATIONS = [
  { pattern: /^Fever \(\+\d+\)$/, text: 'Fever reported — common indicator of infection' },
  { pattern: /^Cough \(\+\d+\)$/, text: 'Cough reported — possible respiratory illness' },
  { pattern: /^Difficulty breathing \(\+\d+\)$/, text: 'Difficulty breathing — clinically serious symptom' },
  { pattern: /^Fatigue \(\+\d+\)$/, text: 'General fatigue reported' },
  { pattern: /^Headache \(\+\d+\)$/, text: 'Headache reported' },
  { pattern: /^Nausea \(\+\d+\)$/, text: 'Nausea reported' },
  { pattern: /^travel \(\+\d+\)$/, text: 'Recent travel outside Arizona' },
  { pattern: /^cluster: (\d+) recent reports \(\+\d+\)$/, replace: (m) => `${m[1]} other people in your area reported similar symptoms` },
  { pattern: /^65\+ with respiratory symptoms \(\+\d+\)$/, text: 'Age 65+ with respiratory symptoms (elevated risk)' },
  { pattern: /^under 18 with fever \(\+\d+\)$/, text: 'Pediatric fever (monitor closely)' },
  { pattern: /^healthcare \+ animal contact \+ fever \(\+\d+\)$/, text: 'Healthcare worker with animal exposure' },
  { pattern: /^veterinary \+ animal contact \+ fever \(\+\d+\)$/, text: 'Veterinary work with animal exposure (zoonotic risk)' },
  { pattern: /^agriculture \+ respiratory \+ dust weather \(\+\d+\)$/, text: 'Agricultural work with respiratory symptoms (Valley Fever risk)' },
  { pattern: /^animal contact \(\+\d+\)$/, text: 'Recent animal contact reported' },
  { pattern: /^fever \+ animal contact \(\+\d+\)$/, text: 'Fever combined with animal contact (possible zoonotic signal)' },
  { pattern: /^difficulty breathing \+ animal contact \(\+\d+\)$/, text: 'Respiratory symptoms with animal exposure' },
  { pattern: /^high temp [\d.]+ ?°C \(\+\d+\)$/, text: 'Extreme heat affecting respiratory health' },
  { pattern: /^high humidity \d+% \(\+\d+\)$/, text: 'Mosquito-favorable weather conditions' },
  { pattern: /^dust\/heat advisory conditions \(\+\d+\)$/, text: 'Dust and heat conditions (Valley Fever risk)' },
  { pattern: /^CDC minimal: (.+) \(\+\d+\)$/, replace: (m) => `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} reported in your area` },
  { pattern: /^CDC low: (.+) \(\+\d+\)$/, replace: (m) => `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} is circulating locally` },
  { pattern: /^CDC moderate: (.+) \(\+\d+\)$/, replace: (m) => `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} is active in your area` },
  { pattern: /^CDC high: (.+) \(\+\d+\)$/, replace: (m) => `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} is widely circulating in your area` },
  { pattern: /^Valley Fever \(Coccidioides\) \(\+\d+\)$/, text: 'Valley Fever is endemic to your region' },
  { pattern: /^EpiCore: (.+?) in (.+) \(\+\d+\)$/, replace: (m) => `Active ${m[1]} outbreak in ${m[2]} matches your symptoms` },
]

function translateFactor(raw) {
  for (const rule of FACTOR_TRANSLATIONS) {
    const match = raw.match(rule.pattern)
    if (match) return rule.text || rule.replace(match)
  }
  return raw.replace(/\s*\(\+\d+\)/, '')
}

function severityLabel(score) {
  if (score === 0) return null
  if (score < 25) return { text: 'Low concern', color: 'text-gray-500' }
  if (score < 55) return { text: 'Moderate concern', color: 'text-amber-700' }
  if (score < 80) return { text: 'Elevated concern', color: 'text-orange-700' }
  return { text: 'High concern', color: 'text-red-700' }
}

function BucketRow({ bucket, isMax, riskLevel }) {
  const [expanded, setExpanded] = useState(false)
  const barColor = isMax ? BAR_COLORS[riskLevel] : 'bg-teal-600'
  const severity = severityLabel(bucket.score)

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
            <p key={i} className="text-sm text-gray-600 py-0.5">{translateFactor(f)}</p>
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

const PHOENIX_FACILITIES = [
  { name: 'Banner - University Medical Center Phoenix', type: 'ER', address: '1111 E McDowell Rd, Phoenix, AZ', phone: '(602) 839-2000', hours: 'Open 24/7' },
  { name: 'HonorHealth Scottsdale Osborn', type: 'ER', address: '7400 E Osborn Rd, Scottsdale, AZ', phone: '(480) 882-4000', hours: 'Open 24/7' },
  { name: 'NextCare Urgent Care - Phoenix', type: 'Urgent Care', address: 'Multiple locations', phone: '(602) 824-5500', hours: 'Open until 9pm' },
]

const FACILITIES = {
  '857': [
    { name: 'Banner - University Medical Center Tucson', type: 'ER', address: '1501 N Campbell Ave, Tucson, AZ', phone: '(520) 694-0111', hours: 'Open 24/7' },
    { name: 'TMC HealthCare', type: 'ER', address: '5301 E Grant Rd, Tucson, AZ', phone: '(520) 327-5461', hours: 'Open 24/7' },
    { name: 'NextCare Urgent Care - Tucson', type: 'Urgent Care', address: 'Multiple locations', phone: '(520) 917-1150', hours: 'Open until 9pm' },
  ],
  '850': PHOENIX_FACILITIES,
  '852': PHOENIX_FACILITIES,
  '853': PHOENIX_FACILITIES,
  '860': [
    { name: 'Flagstaff Medical Center', type: 'ER', address: '1200 N Beaver St, Flagstaff, AZ', phone: '(928) 779-3366', hours: 'Open 24/7' },
  ],
  '861': [
    { name: 'Flagstaff Medical Center', type: 'ER', address: '1200 N Beaver St, Flagstaff, AZ', phone: '(928) 779-3366', hours: 'Open 24/7' },
  ],
}

const TELEHEALTH = [
  { name: 'Teladoc Health', type: 'Telehealth', phone: '1-855-835-2362', hours: 'Available now, ~15 min wait' },
  { name: 'MDLive', type: 'Telehealth', phone: '1-888-632-2738', hours: 'Available now' },
]

const TYPE_COLORS = {
  'ER': 'text-red-700',
  'Urgent Care': 'text-amber-700',
  'Telehealth': 'text-teal-700',
  'Fallback': 'text-gray-500',
}

function getFacilities(zip, showER) {
  const prefix = zip.slice(0, 3)
  const local = FACILITIES[prefix] || []
  const all = [...local, ...TELEHEALTH]

  if (local.length === 0) {
    return [...TELEHEALTH, { name: 'Search urgent care near you', type: 'Fallback' }]
  }

  const typeOrder = showER
    ? ['ER', 'Telehealth', 'Urgent Care']
    : ['Telehealth', 'Urgent Care', 'ER']

  return all.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type))
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
    msg += ` SafeLoop flagged ${formatDiseaseList(diseases)} as potentially relevant based on my symptom profile and current outbreak activity${extra}. Please consider these in your evaluation.`
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
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)

  if (result.risk_level !== 'HIGH' || !formData) return null

  const showER = formData.symptoms.includes('difficulty_breathing') || result.total_score >= 0.85
  const message = buildProviderMessage(formData, result.matched_alerts)
  const guidance = getWaitGuidance(result.one_health, formData, result.matched_alerts)

  const TYPE_LABELS = { 'ER': t('type_er'), 'Urgent Care': t('type_urgent_care'), 'Telehealth': t('type_telehealth') }

  function handleCopy() {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mb-6 mt-6 space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">{t('get_evaluated')}</p>
        {showER && (
          <p className="text-sm font-semibold text-red-700 mb-2">{t('er_warning')}</p>
        )}
        <div className="flex flex-col">
          {getFacilities(formData.zipCode, showER).map((f, i) => (
            <div
              key={i}
              className={`border rounded-lg p-3 mb-2 ${f.type === 'ER' && showER ? 'bg-red-50 border-red-200' : 'border-gray-200'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">{f.name}</span>
                <span className={`text-xs uppercase tracking-wide ${TYPE_COLORS[f.type] || 'text-gray-500'}`}>{f.type === 'Fallback' ? '' : (TYPE_LABELS[f.type] || f.type)}</span>
              </div>
              {f.address && <p className="text-xs text-gray-500">{f.address}</p>}
              {f.hours && <p className="text-xs text-gray-600">{f.hours}</p>}
              {f.phone && (
                <a href={`tel:${f.phone.replace(/[^0-9+]/g, '')}`} className="text-xs text-teal-600 hover:text-teal-700">{f.phone}</a>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">{t('facility_disclaimer')}</p>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">{t('what_to_tell_provider')}</p>
        <div className="border-l-3 border-teal-600 bg-gray-50 rounded-r-lg px-3 py-3">
          <p className="text-sm text-gray-700 leading-relaxed">{message}</p>
        </div>
        <button
          onClick={handleCopy}
          className="mt-2 text-xs text-teal-600 hover:text-teal-700 transition-colors cursor-pointer"
        >
          {copied ? t('copied') : t('copy_message')}
        </button>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">{t('while_you_wait')}</p>
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
  const { t } = useLanguage()
  const { risk_level, narrative, one_health, matched_alerts, weather } = result
  const buckets = [one_health.human, one_health.animal, one_health.environment]
  const maxScore = Math.max(...buckets.map((b) => b.score))
  const sortedAlerts = matched_alerts && formData
    ? sortAlerts(matched_alerts, formData.symptoms)
    : matched_alerts || []

  const BUCKET_NAMES = {
    Human: t('bucket_human'),
    Animal: t('bucket_animal'),
    Environment: t('bucket_environment'),
  }

  return (
    <div className="fixed top-6 right-6 w-[360px] bg-white shadow-md rounded-lg p-6 z-[1000] max-h-[calc(100vh-48px)] overflow-y-auto">
      <div className="mb-4">
        <p className={`text-2xl font-bold ${RISK_COLORS[risk_level]}`}>{t('risk_' + risk_level.toLowerCase())}</p>
        <p className="text-xs text-gray-400 mt-1">
          {weather.temp.toFixed(1)}&deg;C &middot; {weather.humidity}% humidity &middot; {weather.description}
        </p>
      </div>

      <div className="border-l-2 border-teal-600 bg-gray-50 rounded-r-lg px-4 py-3 mb-6">
        <p className="text-sm text-gray-700 leading-relaxed">{stripMarkdown(narrative)}</p>
      </div>

      <div className="mb-6">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{t('one_health_breakdown')}</p>
        {buckets.map((b) => (
          <BucketRow
            key={b.name}
            bucket={{ ...b, name: BUCKET_NAMES[b.name] || b.name }}
            isMax={b.score === maxScore}
            riskLevel={risk_level}
          />
        ))}
      </div>

      <ActionCard result={result} formData={formData} />

      {sortedAlerts.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{t('matched_alerts')}</p>
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
        {t('submit_another')}
      </button>
    </div>
  )
}
