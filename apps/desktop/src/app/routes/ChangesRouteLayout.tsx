import { Outlet } from "react-router";

export function ChangesRouteLayout() {
  return (
    <div className="flex h-full min-h-0">
      <main className="h-full min-h-0 min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
