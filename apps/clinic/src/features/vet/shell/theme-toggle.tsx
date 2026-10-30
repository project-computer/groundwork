import { useEffect, useState } from 'react'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Monitor, Moon, Sun } from 'lucide-react'
import { getTheme, setTheme, THEME_CHOICES, watchSystemTheme, type ThemeChoice } from '@/lib/theme'

const themeIcon: Record<ThemeChoice, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const themeName = {
  light: msg`light`,
  dark: msg`dark`,
  system: msg`system`,
} as const

export const ThemeToggle = () => {
  const { t, i18n } = useLingui()
  const [choice, setChoice] = useState<ThemeChoice>(() => getTheme())
  useEffect(() => watchSystemTheme(), [])
  const next = THEME_CHOICES[(THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length]
  const Icon = themeIcon[choice]
  return (
    <button
      className="icon-button"
      onClick={() => {
        setTheme(next)
        setChoice(next)
      }}
      title={t`Theme: ${i18n._(themeName[choice])} — switch to ${i18n._(themeName[next])}`}
      aria-label={t`Change theme (current: ${i18n._(themeName[choice])}, switches to ${i18n._(themeName[next])})`}
    >
      <Icon size={18} />
    </button>
  )
}

