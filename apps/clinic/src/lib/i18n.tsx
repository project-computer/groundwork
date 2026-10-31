import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'

export const LOCALES = ['en', 'th'] as const
export type Locale = (typeof LOCALES)[number]

export const localeLabel: Record<Locale, string> = {
  en: 'English',
  th: 'ไทย',
}

const STORAGE_KEY = 'vet.locale'

const isLocale = (value: string | null): value is Locale =>
  value != null && (LOCALES as readonly string[]).includes(value)

const getStoredLocale = (): Locale => {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (isLocale(stored)) return stored
  const preferred = window.navigator.languages?.find((lang) => lang.toLowerCase().startsWith('th'))
  return preferred ? 'th' : 'en'
}

/**
 * Catalog loading. English is the source locale, but production strips the
 * macro `message` fallbacks — English lookups go by the compiled hash id, so
 * the *compiled* catalog (`locales/en/messages.mjs`, id -> English) must be
 * loaded just like Thai's. An empty `{ en: {} }` seed made every English
 * string render as its raw id on the Cloudflare deploy (dev/tests masked it:
 * the un-stripped fallback still returned the source text). The Thai catalog
 * is loaded on first use to keep it out of the main bundle. A locale may be
 * activated before its catalog arrives — Lingui then falls back to ids until
 * `initI18n` resolves (main.tsx renders only after that).
 */
i18n.load({ en: {} })
const loadedLocales = new Set<Locale>([])

const loadLocale = async (locale: Locale): Promise<void> => {
  if (loadedLocales.has(locale)) return
  if (locale === 'th') {
    const { messages } = await import('@/locales/th/messages.po')
    i18n.load({ th: messages })
  } else {
    const { messages } = await import('@/locales/en/messages.mjs')
    i18n.load({ en: messages })
  }
  loadedLocales.add(locale)
}

/** Loads the catalog for the stored locale, then activates it. Call once before mounting. */
export const initI18n = async (): Promise<void> => {
  const locale = getStoredLocale()
  await loadLocale(locale)
  i18n.activate(locale)
}

i18n.activate(getStoredLocale())

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: i18n.locale as Locale,
  setLocale: () => {},
})

export const LocaleProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocaleState] = useState<Locale>(() => i18n.locale as Locale)

  const setLocale = useCallback((next: Locale) => {
    void loadLocale(next).then(() => {
      i18n.activate(next)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, next)
        document.documentElement.lang = next
      }
      setLocaleState(next)
    })
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])

  return (
    <LocaleContext.Provider value={value}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </LocaleContext.Provider>
  )
}

export const useLocale = () => useContext(LocaleContext)
