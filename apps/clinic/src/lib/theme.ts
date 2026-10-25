export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_CHOICES: ThemeChoice[] = ['light', 'dark', 'system']

const THEME_KEY = 'clinicbook:theme'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function getTheme(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // localStorage unavailable — fall through to system default.
  }
  return 'system'
}

export function resolvedTheme(choice: ThemeChoice = getTheme()): 'light' | 'dark' {
  return choice === 'dark' || (choice === 'system' && systemPrefersDark()) ? 'dark' : 'light'
}

/** Reflects the resolved theme on <html> as a `dark`/`light` class. */
export function applyTheme(choice: ThemeChoice = getTheme()) {
  const dark = resolvedTheme(choice) === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
}

export function setTheme(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(THEME_KEY, choice)
  } catch {
    // Choice stays session-only when persistence is unavailable.
  }
  applyTheme(choice)
}

/** Re-applies the theme when the OS preference changes while on "system". */
export function watchSystemTheme(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => applyTheme()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
