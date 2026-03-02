import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { normalizeTheme } from '@/app/themeUtils'

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light theme', icon: Sun },
  { value: 'dark' as const, label: 'Dark theme', icon: Moon },
  { value: 'system' as const, label: 'System theme', icon: Monitor },
]

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const value = normalizeTheme(theme)

  return (
    <div className="bg-surface-alt border-input inline-flex items-center gap-0.5 rounded-md border p-0.5">
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon
        const isActive = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            className={`inline-flex h-7 w-7 items-center justify-center rounded-sm ${
              isActive
                ? 'bg-surface-active text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
            onClick={() => setTheme(option.value)}
            title={option.label}
            aria-label={option.label}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
