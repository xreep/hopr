import { useEffect, useMemo, useState } from 'react'
import { LanguageContext, getLanguage, setLanguage, subscribeLanguage, relativeTimeIn, useT } from '../i18n/language'
import { translate } from '../i18n/strings'

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(getLanguage)
  useEffect(() => subscribeLanguage(setLang), [])
  useEffect(() => {
    document.documentElement.lang = lang
    return () => { document.documentElement.lang = 'en' }
  }, [lang])
  const value = useMemo(() => ({
    lang,
    translated: true,
    setLang: setLanguage,
    t: (key, vars) => translate(lang, key, vars),
    ago: date => relativeTimeIn(lang, date)
  }), [lang])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

// Labelled in the language it switches to, so a reader who can't read the current
// one can still find it
export function LanguageToggle({ className = '' }) {
  const { lang, setLang, t } = useT()
  const next = lang === 'hi' ? 'en' : 'hi'
  return (
    <button type="button" className={`btn btn-outline btn-sm ${className}`} title={t('lang.toggleLabel')} onClick={() => setLang(next)}>
      <span lang={next}>{t('lang.toggle')}</span>
    </button>
  )
}
