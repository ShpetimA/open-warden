import { Outlet, useSearchParams } from "react-router";
import { GitGraph, List } from "lucide-react";

import { useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import { HistorySidebar } from "@/features/source-control/components/HistorySidebar";
import { HistoryGraphScreen } from "@/features/source-control/screens/HistoryGraphScreen";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    <Tabs
      value={graph ? "graph" : "list"}
      onValueChange={(value) => {
        if (value !== "list" && value !== "graph") return;
        const next = new URLSearchParams(searchParams);
        if (value === "graph") next.set("view", "graph");
        else next.delete("view");
        setSearchParams(next);
      }}
      className="h-full min-h-0"
    >
      <header className="bg-surface-toolbar flex h-9 shrink-0 items-center gap-3 border-b px-2">
        <h1 className="text-[13px] font-medium">History</h1>
        <TabsList aria-label="History view" className="p-0">
          <TabsTrigger value="list">
            <List />
            List
          </TabsTrigger>
          <TabsTrigger value="graph">
            <GitGraph />
            Graph
          </TabsTrigger>
        </TabsList>
        <span className="text-muted-foreground ml-auto text-[11px]">
          {graph ? "All locally available refs" : "Current branch"}
        </span>
      </header>
      <TabsContent value={graph ? "graph" : "list"}>
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
      </TabsContent>
    </Tabs>
  );
}
