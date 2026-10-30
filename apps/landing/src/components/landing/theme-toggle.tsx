import { useEffect, useState } from 'react'
import { getTheme, setTheme, THEME_CHOICES, watchSystemTheme, type ThemeChoice } from '@/lib/theme'
import { MonitorIcon, MoonIcon, SunIcon, type IconProps } from './icons'

const themeIcon: Record<ThemeChoice, (props: IconProps) => React.JSX.Element> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
}

export const ThemeToggle = () => {
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
      title={`Theme: ${choice} — switch to ${next}`}
      aria-label={`Change theme (current: ${choice}, switches to ${next})`}
    >
      <Icon size={18} />
    </button>
  )
}
