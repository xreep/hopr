import { useSyncExternalStore } from 'react'
import { isMuted, setMuted, subscribeMuted, isSpeechSupported, speak } from '../utils/speak'

export default function MuteToggle({ className = 'btn btn-ghost btn-sm' }) {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false)
  if (!isSpeechSupported()) return null
  const toggle = () => {
    setMuted(!muted)
    if (muted) speak('Voice notifications on')
  }
  return (
    <button type="button" className={`${className} mute-toggle`} onClick={toggle} aria-pressed={!muted}
      aria-label={muted ? 'Unmute voice notifications' : 'Mute voice notifications'} title={muted ? 'Voice notifications are muted' : 'Voice notifications are on'}>
      <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
      <span className="hidden sm:inline">{muted ? 'Voice off' : 'Voice on'}</span>
    </button>
  )
}
