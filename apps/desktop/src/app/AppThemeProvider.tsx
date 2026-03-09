import { useEffect } from 'react'
import { ThemeProvider, useTheme } from 'next-themes'

type AppThemeProviderProps = {
  children: React.ReactNode
}

function ThemeColorSchemeSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const colorScheme = resolvedTheme === 'dark' ? 'dark' : 'light'
    document.documentElement.style.colorScheme = colorScheme
  }, [resolvedTheme])

  return null
}

export function AppThemeProvider({ children }: AppThemeProviderProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="open-warden-theme"
      disableTransitionOnChange
    >
      <ThemeColorSchemeSync />
      {children}
    </ThemeProvider>
  )
}
