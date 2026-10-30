import { useLingui } from '@lingui/react/macro'
import { LOCALES, localeLabel, useLocale } from '@/lib/i18n'
import { LanguagesIcon } from './icons'

/** Cycles the page between the supported locales (English / Thai). */
export const LanguageToggle = () => {
  const { t } = useLingui()
  const { locale, setLocale } = useLocale()
  const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length]
  const label = t`Language: ${localeLabel[locale]} — switch to ${localeLabel[next]}`

  return (
    <button
      type="button"
      className="icon-button"
      onClick={() => setLocale(next)}
      title={label}
      aria-label={label}
    >
      <LanguagesIcon size={18} />
    </button>
  )
}
