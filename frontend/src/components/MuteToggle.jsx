import { useSyncExternalStore } from 'react'
import { isMuted, setMuted, subscribeMuted, isSpeechSupported, speak } from '../utils/speak'
import Icon from './icons'
import { useT } from '../i18n/language'

export default function MuteToggle({ className = 'btn btn-ghost btn-sm' }) {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false)
  const { t, lang } = useT()
  if (!isSpeechSupported()) return null
  const toggle = () => {
    setMuted(!muted)
    if (muted) speak(t('voice.nowOn'), { lang })
  }
  return (
    <button type="button" className={`${className} mute-toggle`} onClick={toggle} aria-pressed={!muted}
      aria-label={muted ? t('voice.unmute') : t('voice.mute')} title={muted ? t('voice.unmute') : t('voice.mute')}>
      <Icon name={muted ? 'volumeOff' : 'volume'} />
      <span className="hidden sm:inline">{muted ? t('voice.off') : t('voice.on')}</span>
    </button>
  )
}
