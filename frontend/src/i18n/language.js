import { createContext, useContext } from 'react'
import { LANGUAGES, translate } from './strings'

// The reader's language for the driver app and customer tracking, remembered on this
// device. Hindi is the default when the browser prefers it.
const STORAGE_KEY = 'hopr:lang'
const listeners = new Set()

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (LANGUAGES.includes(saved)) return saved
  } catch { /* storage blocked: fall back to the browser */ }
  const preferred = typeof navigator === 'undefined' ? [] : navigator.languages || [navigator.language]
  return preferred.some(l => /^hi\b/i.test(l || '')) ? 'hi' : 'en'
}

let current = initialLanguage()

export const getLanguage = () => current

export function setLanguage(lang) {
  if (!LANGUAGES.includes(lang)) return
  current = lang
  try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* keep in memory only */ }
  listeners.forEach(fn => fn(lang))
}

export function subscribeLanguage(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function relativeTimeIn(lang, date, now = Date.now()) {
  const sec = Math.round((now - new Date(date).getTime()) / 1000)
  if (sec < 10) return translate(lang, 'time.justNow')
  if (sec < 60) return translate(lang, 'time.secondsAgo', { n: sec })
  if (sec < 3600) return translate(lang, 'time.minutesAgo', { n: Math.round(sec / 60) })
  return translate(lang, 'time.hoursAgo', { n: Math.round(sec / 3600) })
}

export const LanguageContext = createContext(null)

const ENGLISH = {
  lang: 'en',
  translated: false,
  setLang: () => {},
  t: (key, vars) => translate('en', key, vars),
  ago: date => relativeTimeIn('en', date)
}

// Pages that offer Hindi wrap themselves in <LanguageProvider>; everywhere else
// (the manager screens) stays in English
export function useT() {
  return useContext(LanguageContext) || ENGLISH
}
