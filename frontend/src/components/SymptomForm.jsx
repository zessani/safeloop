import { useState } from 'react'
import { submitReport } from '../api'

const SYMPTOMS = [
  { value: 'fever', label: 'Fever' },
  { value: 'cough', label: 'Cough' },
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'difficulty_breathing', label: 'Difficulty breathing' },
  { value: 'headache', label: 'Headache' },
  { value: 'nausea', label: 'Nausea' },
]

const AGE_BRACKETS = [
  { value: 'under_18', label: 'Under 18' },
  { value: '18_39', label: '18-39' },
  { value: '40_64', label: '40-64' },
  { value: '65_plus', label: '65+' },
]

const OCCUPATIONS = [
  { value: 'student', label: 'Student' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'veterinary', label: 'Veterinary' },
  { value: 'office', label: 'Office' },
  { value: 'service', label: 'Service' },
  { value: 'retired', label: 'Retired' },
  { value: 'other', label: 'Other' },
]

export default function SymptomForm({ onResult }) {
  const [symptoms, setSymptoms] = useState([])
  const [ageBracket, setAgeBracket] = useState('18_39')
  const [occupation, setOccupation] = useState('other')
  const [zipCode, setZipCode] = useState('')
  const [travel, setTravel] = useState(false)
  const [animal, setAnimal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function toggleSymptom(val) {
    setSymptoms((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (symptoms.length === 0) {
      setError('Select at least one symptom')
      return
    }
    if (!/^\d{5}$/.test(zipCode)) {
      setError('Enter a valid 5-digit ZIP code')
      return
    }

    setLoading(true)
    try {
      const result = await submitReport({
        symptoms,
        age_bracket: ageBracket,
        occupation,
        zip_code: zipCode,
        travel_history: travel,
        animal_contact: animal,
      })
      onResult(result, { symptoms, occupation, zipCode, animal, travel })
    } catch {
      setError('Failed to submit. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed top-6 right-6 w-[360px] bg-white shadow-md rounded-lg p-6 z-[1000] max-h-[calc(100vh-48px)] overflow-y-auto">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Symptoms</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Symptoms</label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {SYMPTOMS.map((s) => (
              <label
                key={s.value}
                className={`flex items-center gap-2 text-sm cursor-pointer px-2 py-1.5 rounded-lg border transition-colors ${
                  symptoms.includes(s.value)
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={symptoms.includes(s.value)}
                  onChange={() => toggleSymptom(s.value)}
                  className="sr-only"
                />
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                  symptoms.includes(s.value)
                    ? 'bg-teal-600 border-teal-600'
                    : 'border-gray-300'
                }`}>
                  {symptoms.includes(s.value) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {s.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Age bracket</label>
          <select
            value={ageBracket}
            onChange={(e) => setAgeBracket(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-teal-600"
          >
            {AGE_BRACKETS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Occupation</label>
          <select
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-teal-600"
          >
            {OCCUPATIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">ZIP code</label>
          <input
            type="text"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="85719"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-teal-600"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Recent travel outside Arizona</span>
          <button
            type="button"
            onClick={() => setTravel(!travel)}
            className={`relative w-10 h-5 rounded-full transition-colors ${travel ? 'bg-teal-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${travel ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Recent animal contact</span>
          <button
            type="button"
            onClick={() => setAnimal(!animal)}
            className={`relative w-10 h-5 rounded-full transition-colors ${animal ? 'bg-teal-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${animal ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-teal-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Analyzing...' : 'Submit Report'}
        </button>
      </form>
    </div>
  )
}
