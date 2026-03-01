import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { normalizeTheme } from '@/app/themeUtils'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const value = normalizeTheme(theme)

  return (
    <Select value={value} onValueChange={(nextValue) => setTheme(nextValue)}>
      <SelectTrigger className="bg-surface-elevated border-input h-8 w-[120px] text-xs">
        <SelectValue placeholder="Theme" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">
          <span className="inline-flex items-center gap-2">
            <Monitor className="h-3.5 w-3.5" />
            System
          </span>
        </SelectItem>
        <SelectItem value="light">
          <span className="inline-flex items-center gap-2">
            <Sun className="h-3.5 w-3.5" />
            Light
          </span>
        </SelectItem>
        <SelectItem value="dark">
          <span className="inline-flex items-center gap-2">
            <Moon className="h-3.5 w-3.5" />
            Dark
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
