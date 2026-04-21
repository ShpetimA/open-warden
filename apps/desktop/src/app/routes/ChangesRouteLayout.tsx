import { Outlet } from "react-router";

import { ChangesRail } from "@/features/source-control/components/ChangesRail";

export function ChangesRouteLayout() {
  return (
    <div className="flex h-full min-h-0">
      <ChangesRail />
      <main className="h-full min-h-0 min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
