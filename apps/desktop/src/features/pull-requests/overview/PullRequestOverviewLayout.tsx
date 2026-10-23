import type { ReactNode } from "react";

/** Conversation on the left, merge status and provider metadata pinned on the right. */
export function PullRequestOverviewLayout({
  header,
  aside,
  children,
}: {
  header: ReactNode;
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      {header}
      <div data-workspace-scroll className="min-h-0 flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto grid w-full max-w-[1240px] gap-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="min-w-0">{children}</div>
          <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-0">{aside}</aside>
        </div>
      </div>
    </div>
  );
}
