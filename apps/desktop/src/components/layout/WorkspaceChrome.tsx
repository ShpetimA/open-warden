import type { ReactNode } from "react";

export function WorkspaceChrome({
  header,
  rail,
  children,
}: {
  header: ReactNode;
  rail: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="bg-background text-foreground grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden"
      style={{ gridTemplateRows: "40px minmax(0, 1fr)" }}
    >
      {header}
      <div className="flex h-full min-h-0 min-w-0">
        {rail}
        <div className="relative min-h-0 min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
