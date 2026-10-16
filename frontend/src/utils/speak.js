// Spoken notifications via the Web Speech API (no dependencies).
// speak(text): English voice (Indian English preferred), rate 1, cancels whatever is
// being said first, and is a silent no-op where speech synthesis is unsupported.
// Mute state is shared app-wide and persisted in localStorage.

const STORAGE_KEY = 'hopr:voice-muted'
const listeners = new Set()

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let muted = readMuted()

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
}

export function isMuted() {
  return muted
}

export function setMuted(value) {
  muted = Boolean(value)
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
  } catch { /* private mode: keep in memory only */ }
  if (muted && isSpeechSupported()) {
    try { window.speechSynthesis.cancel() } catch { /* ignore */ }
  }
  listeners.forEach(fn => fn(muted))
}

export function subscribeMuted(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function englishVoice() {
  const voices = window.speechSynthesis.getVoices?.() || []
  return voices.find(v => v.lang === 'en-IN') ||
    voices.find(v => /^en[-_]/i.test(v.lang) && v.default) ||
    voices.find(v => /^en/i.test(v.lang)) ||
    null
}

export function speak(text) {
  if (!text || muted || !isSpeechSupported()) return false
  try {
    const synth = window.speechSynthesis
    synth.cancel()
    const utterance = new window.SpeechSynthesisUtterance(String(text))
    const voice = englishVoice()
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang || 'en-IN'
    utterance.rate = 1
    utterance.pitch = 1
    synth.speak(utterance)
    return true
  } catch {
    return false
  }
}

// Browsers only allow speech after a user gesture: prime the engine on first interaction
export function primeSpeechOnFirstGesture() {
  if (!isSpeechSupported() || typeof document === 'undefined') return () => {}
  const prime = () => {
    try {
      window.speechSynthesis.getVoices()
      const silent = new window.SpeechSynthesisUtterance('')
      silent.volume = 0
      window.speechSynthesis.speak(silent)
    } catch { /* ignore */ }
    document.removeEventListener('pointerdown', prime)
    document.removeEventListener('keydown', prime)
  }
  document.addEventListener('pointerdown', prime, { once: true })
  document.addEventListener('keydown', prime, { once: true })
  return () => {
    document.removeEventListener('pointerdown', prime)
    document.removeEventListener('keydown', prime)
  }
}
