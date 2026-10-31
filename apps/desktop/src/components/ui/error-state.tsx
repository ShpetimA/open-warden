import { useEffect, useState } from "react";
import { AlertCircle, Copy, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { readDesktopFailure } from "@/platform/desktop/failure";
import { cn } from "@/lib/utils";

export type ErrorRecovery = Readonly<{ label: string; onAction: () => void }>;
type ErrorSurfaceProps = Readonly<{
  error: unknown;
  title: string;
  message?: string;
  recovery?: ErrorRecovery;
  busy?: boolean;
  lastUpdated?: number;
  className?: string;
}>;

function ErrorSurface({
  error,
  title,
  message,
  recovery,
  busy = false,
  lastUpdated,
  className,
  compact = false,
}: ErrorSurfaceProps & { compact?: boolean }) {
  const failure = readDesktopFailure(error);
  const [now, setNow] = useState(Date.now);
  const [copyStatus, setCopyStatus] = useState("");
  const retryAt = failure?.retryAt;

  useEffect(() => {
    setNow(Date.now());
    if (!retryAt) return;

    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Math.min(retryAt - Date.now(), 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [retryAt]);

  if (failure?.code === "cancelled") return null;

  const waiting = retryAt !== undefined && retryAt > now;
  const details = failure
    ? [
        `Operation: ${failure.operation}`,
        `Code: ${failure.code}`,
        failure.provider ? `Provider: ${failure.provider}` : "",
        failure.status ? `HTTP status: ${failure.status}` : "",
        failure.reference ? `Reference: ${failure.reference}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "No additional diagnostic information is available.";

  function copyDetails() {
    void navigator.clipboard.writeText(details).then(
      () => setCopyStatus("Copied"),
      () => setCopyStatus("Couldn’t copy details"),
    );
  }

  return (
    <Alert
      role={compact ? "status" : "alert"}
      aria-busy={busy}
      className={cn("bg-surface-toolbar rounded-md px-3 py-2 shadow-none", className)}
    >
      <AlertCircle className="text-destructive" aria-hidden="true" />
      <AlertTitle className="line-clamp-none text-xs leading-5">{title}</AlertTitle>
      <AlertDescription className="w-full gap-2 text-xs leading-5">
        <p className="text-muted-foreground max-w-prose break-words">
          {message ?? failure?.message ?? "The operation couldn’t be completed. Try again."}
        </p>
        {lastUpdated ? (
          <p className="text-muted-foreground">
            Showing the last successful update from {new Date(lastUpdated).toLocaleTimeString()}.
          </p>
        ) : null}
        {waiting ? (
          <p className="text-muted-foreground">
            Try again after {new Date(retryAt).toLocaleTimeString()}.
          </p>
        ) : null}
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
          {recovery ? (
            <Button
              size="xs"
              variant="outline"
              disabled={busy || waiting}
              onClick={recovery.onAction}
            >
              {busy ? <Spinner aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              {busy ? "Trying again…" : recovery.label}
            </Button>
          ) : null}
          <details className="min-w-0 text-xs">
            <summary className="text-muted-foreground hover:text-foreground focus-visible:outline-ring cursor-pointer rounded-sm">
              Details
            </summary>
            <pre className="text-muted-foreground mt-2 whitespace-pre-wrap break-all font-mono text-[11px]">
              {details}
            </pre>
            <Button size="xs" variant="ghost" onClick={copyDetails} className="mt-1">
              <Copy aria-hidden="true" />
              {copyStatus || "Copy details"}
            </Button>
          </details>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function ErrorState(props: ErrorSurfaceProps) {
  return (
    <div className="p-3">
      <ErrorSurface {...props} />
    </div>
  );
}

export function ErrorNotice(props: ErrorSurfaceProps) {
  return (
    <ErrorSurface
      {...props}
      compact
      className={cn("rounded-none border-x-0 border-t-0", props.className)}
    />
  );
}

export function ActionError(props: ErrorSurfaceProps) {
  return <ErrorSurface {...props} />;
}
