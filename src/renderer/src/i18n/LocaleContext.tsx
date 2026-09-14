import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { translateFor, type AppLanguage, type AppPreferences } from '../../../shared/locale'

let currentLanguage: AppLanguage = 'en'
export const t = (source: string, values?: Record<string, string | number>) => translateFor(currentLanguage, source, values)
export const locale = () => currentLanguage === 'es' ? 'es-UY' : 'en-US'

export const LocaleContext = createContext({
  language: 'en' as AppLanguage,
  checkForUpdatesOnStartup: true,
  savePreferences: async (_preferences: AppPreferences): Promise<void> => {},
  error: null as string | null
})

export const useLocale = () => useContext(LocaleContext)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AppPreferences>({ language: 'en', checkForUpdatesOnStartup: true })
  const [error, setError] = useState<string | null>(null)
  currentLanguage = preferences.language

  useEffect(() => {
    document.documentElement.lang = preferences.language
  }, [preferences.language])

  useEffect(() => {
    if (typeof window.api.getAppPreferences !== 'function') return
    let cancelled = false
    const load = () => window.api.getAppPreferences().then((saved) => {
      if (!cancelled) setPreferences(saved)
    }).catch((failure) => {
      if (!cancelled) setError(String(failure))
    })
    void load()
    window.addEventListener('worldtube:preferences-changed', load)
    return () => { cancelled = true; window.removeEventListener('worldtube:preferences-changed', load) }
  }, [])

  async function savePreferences(next: AppPreferences) {
    if (typeof window.api.setAppPreferences !== 'function') {
      setError(t('Restart WorldTube to save application settings.'))
      return
    }
    try {
      await window.api.setAppPreferences(next)
      setPreferences(next)
      setError(null)
    } catch (failure) { setError(String(failure)) }
  }

  return <LocaleContext.Provider value={{ ...preferences, savePreferences, error }}>{children}</LocaleContext.Provider>
}
