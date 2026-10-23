import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import { EmptyState } from './ui'
import { formatDateTime } from '../utils/time'

const TOPICS = { demo: 'Demo request', question: 'Question', support: 'Account help', data_request: 'Data request' }

// Messages sent from the public website's contact form (Admin page). They are stored even
// when email is off, so nothing is lost.
export default function WebsiteInbox() {
  const [messages, setMessages] = useState(null)

  const load = useCallback(async () => {
    try {
      setMessages((await api.get('/admin/messages')).data.messages)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load website messages'))
      setMessages([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  const toggle = async msg => {
    try {
      await api.patch(`/admin/messages/${msg._id}`, { handled: !msg.handled })
      setMessages(list => list.map(m => (m._id === msg._id ? { ...m, handled: !m.handled } : m)))
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const open = messages?.filter(m => !m.handled).length || 0
  return (
    <div className="card mt-6">
      <div className="card-header flex-between"><h3>Website messages</h3>{open > 0 && <span className="text-small text-ink-300">{open} to answer</span>}</div>
      <div className="card-body">
        {messages === null ? <p className="text-small text-ink-400">Loading…</p> : messages.length === 0 ? (
          <EmptyState title="No messages yet">Demo requests and questions from the website’s contact form appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-[var(--h-line)]">
            {messages.map(m => (
              <li key={m._id} className={`py-3 ${m.handled ? 'opacity-60' : ''}`}>
                <div className="flex-between gap-3 flex-wrap">
                  <p className="font-semibold">{TOPICS[m.topic]} from {m.name}{m.company ? `, ${m.company}` : ''}</p>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(m)}>{m.handled ? 'Mark as open' : 'Mark as answered'}</button>
                </div>
                <p className="text-small text-ink-300"><a href={`mailto:${m.email}`}>{m.email}</a>{m.fleetSize ? `, ${m.fleetSize} vehicles` : ''}, {formatDateTime(m.createdAt)}</p>
                <p className="text-body mt-1 whitespace-pre-line">{m.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
