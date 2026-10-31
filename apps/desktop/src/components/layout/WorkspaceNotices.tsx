import type { ReactNode } from "react";

export function WorkspaceNotices({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="workspace-notices"
      className="pointer-events-none absolute inset-x-2 top-2 z-30 flex max-h-[50%] justify-end"
    >
      <div className="pointer-events-auto max-h-full w-full max-w-md overflow-y-auto rounded-md border bg-surface-elevated shadow-md empty:hidden">
        {children}
      </div>
    </div>
  );
}
