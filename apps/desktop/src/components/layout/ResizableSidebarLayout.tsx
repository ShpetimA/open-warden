import type { ReactNode } from 'react'
import { useRef } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'

type ResizableSidebarLayoutProps = {
  sidebar: ReactNode
  content: ReactNode
  sidebarDefaultSize?: number | string
  sidebarMinSize?: number | string
  sidebarMaxSize?: number | string
}

function toPercentSize(value: number | string) {
  return typeof value === 'number' ? `${value}%` : value
}

export function ResizableSidebarLayout({
  sidebar,
  content,
  sidebarDefaultSize = 24,
  sidebarMinSize = 16,
  sidebarMaxSize = 40,
}: ResizableSidebarLayoutProps) {
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null)
  const defaultSize = toPercentSize(sidebarDefaultSize)
  const minSize = toPercentSize(sidebarMinSize)
  const maxSize = toPercentSize(sidebarMaxSize)

  const onToggleSidebar = () => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.expand()
      return
    }
    panel.collapse()
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="min-h-0">
      <ResizablePanel
        panelRef={sidebarPanelRef}
        defaultSize={defaultSize}
        minSize={minSize}
        maxSize={maxSize}
        collapsible
        collapsedSize={0}
      >
        {sidebar}
      </ResizablePanel>

      <ResizableHandle
        onDoubleClick={onToggleSidebar}
        title="Drag to resize. Double-click to toggle."
        className="group bg-border/80 hover:bg-border data-[resize-handle-state=drag]:bg-ring/70 transition-colors after:w-[3px]"
      >
        <div className="bg-muted-foreground/40 pointer-events-none h-10 w-[2px] opacity-0 transition-opacity group-hover:opacity-100" />
      </ResizableHandle>

      <ResizablePanel minSize={30}>
        <div className="h-full min-h-0">{content}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
