import { useState } from 'react'
import Icon from './icons'

// Today's date in IST as YYYY-MM-DD
const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
const dayLabel = key => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

// A driver's days off (IST dates). Auto-dispatch and assignment skip the driver on these.
// `onSave(days)` stores the whole list and resolves to the list the server kept.
export default function DaysOffEditor({ days = [], onSave, idPrefix = 'days-off' }) {
  const [list, setList] = useState(days)
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async next => {
    setSaving(true)
    try {
      setList(await onSave(next))
      setDate('')
    } catch {
      // onSave reports the error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`${idPrefix}-date`} className="form-label">Add a day off</label>
          <input id={`${idPrefix}-date`} type="date" className="form-input" min={istToday()} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <button type="button" className="btn btn-secondary" disabled={!date || list.includes(date) || saving} onClick={() => save([...list, date])}>
          {saving ? <><span className="spinner spinner-sm" /> Saving</> : <><Icon name="plus" />Add</>}
        </button>
      </div>
      {list.length ? (
        <ul className="flex flex-wrap gap-2 mt-3" aria-label="Days off">
          {list.map(day => (
            <li key={day} className="day-chip">
              {dayLabel(day)}
              <button type="button" onClick={() => save(list.filter(d => d !== day))} disabled={saving} aria-label={`Remove ${dayLabel(day)}`}><Icon name="x" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-micro text-ink-400 mt-2">No days off planned.</p>}
    </div>
  )
}
