import { Spinner } from "@/components/ui/spinner";
import type { GuidanceActivity } from "@/platform/desktop/guidance";

export function GuidanceActivityStatus({ activity }: { activity: GuidanceActivity | null }) {
  if (!activity || activity.status === "completed") return null;

  return (
    <div
      role={activity.status === "failed" ? "alert" : "status"}
      className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs"
    >
      {activity.status === "working" ? (
        <Spinner aria-hidden="true" className="size-3.5 shrink-0" />
      ) : null}
      <span className="truncate" title={activity.message}>
        {activity.status === "working" ? "Agent working · " : ""}
        {activity.message}
      </span>
    </div>
  );
}
