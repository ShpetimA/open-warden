import type { ReactNode } from "react";
import { WorkspaceNotices } from "@/components/layout/WorkspaceNotices";

/** Conversation on the left, merge status and provider metadata pinned on the right. */
export function PullRequestOverviewLayout({
  header,
  aside,
  children,
  notices,
}: {
  header: ReactNode;
  aside: ReactNode;
  children: ReactNode;
  notices?: ReactNode;
}) {
  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      {header}
      <div className="relative min-h-0 flex-1">
        <WorkspaceNotices>{notices}</WorkspaceNotices>
        <div
          data-workspace-scroll
          className="h-full overflow-auto px-6 py-6 [overflow-anchor:none] [scrollbar-gutter:stable]"
        >
          <div className="mx-auto grid w-full max-w-[1240px] gap-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="min-w-0">{children}</div>
            <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-0">{aside}</aside>
          </div>
        </div>
      </div>
    </div>
  );
}
