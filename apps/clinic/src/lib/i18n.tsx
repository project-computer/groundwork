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
 * English is the source locale: message ids are the English strings, so its
 * catalog carries no translations — seed an empty one so activating `en` is
 * always valid and lookups fall back to the source strings. The Thai catalog
 * is loaded on first use to keep it out of the main bundle. A locale may be
 * activated before its catalog arrives (tests, fast path) — Lingui then also
 * falls back to the source strings.
 */
i18n.load({ en: {} })
const loadedLocales = new Set<Locale>(['en'])

const loadLocale = async (locale: Locale): Promise<void> => {
  if (loadedLocales.has(locale)) return
  if (locale === 'th') {
    const { messages } = await import('@/locales/th/messages.po')
    i18n.load({ th: messages })
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
