import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorNotice } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { usePullRequestRefresh } from "./PullRequestRefreshProvider";
import type { PullRequestLocatorInput } from "@/platform/desktop";

export function PullRequestRefreshControl({
  locator,
  onRefreshList,
  listBusy = false,
  listRetryAt = 0,
}: {
  locator: PullRequestLocatorInput | null;
  onRefreshList?: () => void;
  listBusy?: boolean;
  listRetryAt?: number;
}) {
  const refresh = usePullRequestRefresh(locator);
  const retryAt = Math.max(listRetryAt, refresh.retryAt);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (retryAt > Date.now()) {
      const timer = window.setTimeout(
        () => setNow(Date.now()),
        Math.min(retryAt - Date.now(), 2_147_483_647),
      );
      return () => window.clearTimeout(timer);
    }
  }, [retryAt]);
  const busy = listBusy || refresh.busy;
  const label = onRefreshList ? "Refresh pull requests" : "Refresh pull request";
  const reason =
    retryAt > now
      ? `Try again after ${new Date(retryAt).toLocaleTimeString()}`
      : refresh.paused
        ? "Automatic refresh paused. Refresh to retry."
        : (refresh.failure?.message ?? label);
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label={label}
      aria-busy={busy}
      aria-disabled={busy || retryAt > now}
      title={reason}
      aria-description={reason}
      disabled={retryAt > now}
      onClick={() => {
        if (busy) return;
        if (!locator) onRefreshList?.();
        void refresh.refresh();
      }}
    >
      <RefreshCw className={busy ? "animate-spin motion-reduce:animate-none" : undefined} />
    </Button>
  );
}

export function PullRequestRefreshNotice({ locator }: { locator: PullRequestLocatorInput | null }) {
  const refresh = usePullRequestRefresh(locator);
  if (!refresh.failure) return null;

  return (
    <ErrorNotice
      title="Couldn’t refresh this pull request"
      error={refresh.failure}
      busy={refresh.busy}
      recovery={{ label: "Retry", onAction: () => void refresh.refresh() }}
    />
  );
}
