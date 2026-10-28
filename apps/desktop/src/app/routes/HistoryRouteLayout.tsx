import { Outlet, useSearchParams } from "react-router";
import { GitGraph, List } from "lucide-react";

import { useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import { HistorySidebar } from "@/features/source-control/components/HistorySidebar";
import { HistoryGraphScreen } from "@/features/source-control/screens/HistoryGraphScreen";
import { Button } from "@/components/ui/button";

export function HistoryRouteLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const graph = searchParams.get("view") === "graph";
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { activeBranch } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      activeBranch: data?.branch ?? "",
    }),
  });

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="bg-surface-toolbar flex h-10 shrink-0 items-center gap-3 border-b px-3">
        <h1 className="text-[13px] font-medium">History</h1>
        <div role="group" aria-label="History view" className="flex items-center gap-1">
          <Button
            size="xs"
            variant={graph ? "ghost" : "secondary"}
            aria-pressed={!graph}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("view");
              setSearchParams(next);
            }}
          >
            <List />
            List
          </Button>
          <Button
            size="xs"
            variant={graph ? "secondary" : "ghost"}
            aria-pressed={graph}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("view", "graph");
              setSearchParams(next);
            }}
          >
            <GitGraph />
            Graph
          </Button>
        </div>
        <span className="text-muted-foreground ml-auto text-[11px]">
          {graph ? "All locally available refs" : "Current branch"}
        </span>
      </header>
      <div className="min-h-0 min-w-0 flex-1">
        {graph ? (
          <HistoryGraphScreen />
        ) : (
          <ResizableSidebarLayout
            panelId="primary"
            sidebarDefaultSize={22}
            sidebarMinSize={14}
            sidebarMaxSize={34}
            sidebar={<HistorySidebar activeBranch={activeBranch} />}
            content={
              <main className="h-full min-h-0">
                <Outlet />
              </main>
            }
          />
        )}
      </div>
    </section>
  );
}
