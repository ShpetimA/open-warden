import { Shield } from 'lucide-react'

export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="bg-surface flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset ring-zinc-400/50 dark:ring-zinc-500/50">
        <Shield className="text-muted-foreground h-4 w-4" />
      </div>
      <span className="text-foreground font-semibold tracking-tight">Warden</span>
    </div>
  )
}
