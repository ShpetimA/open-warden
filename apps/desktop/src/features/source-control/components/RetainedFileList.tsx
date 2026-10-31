import type { ReactNode } from "react";

import { ErrorNotice, ErrorState } from "@/components/ui/error-state";

export function RetainedFileList({
  children,
  hasData,
  fetching,
  error,
  loadingLabel,
  errorTitle,
  onRetry,
}: {
  children: ReactNode;
  hasData: boolean;
  fetching: boolean;
  error: unknown;
  loadingLabel: string;
  errorTitle: string;
  onRetry: () => void;
}) {
  return (
    <div
      data-slot="retained-file-list"
      aria-busy={fetching}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {!hasData && fetching ? (
        <FileTreeLoadingState label={loadingLabel} />
      ) : !hasData && error ? (
        <ErrorState
          title={errorTitle}
          error={error}
          busy={fetching}
          recovery={{ label: "Retry", onAction: onRetry }}
        />
      ) : (
        children
      )}
      {hasData && error ? (
        <div className="absolute inset-x-2 bottom-2 z-20 max-h-[60%] overflow-y-auto rounded-md border bg-surface-elevated shadow-md">
          <ErrorNotice
            title="Couldn’t refresh"
            error={error}
            busy={fetching}
            recovery={{ label: "Retry", onAction: onRetry }}
            className="rounded-md border-0 bg-surface-elevated"
          />
        </div>
      ) : null}
    </div>
  );
}

function FileTreeLoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="h-full px-1.5 py-0.5">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="flex h-[22px] items-center">
          <div className="bg-border h-2.5 w-24 rounded-sm" />
        </div>
        <div className="flex h-[22px] items-center pl-3">
          <div className="bg-border h-2.5 w-32 rounded-sm" />
        </div>
        <div className="flex h-[22px] items-center pl-6">
          <div className="bg-border h-2.5 w-28 rounded-sm" />
        </div>
        <div className="flex h-[22px] items-center pl-6">
          <div className="bg-border h-2.5 w-36 rounded-sm" />
        </div>
        <div className="flex h-[22px] items-center pl-3">
          <div className="bg-border h-2.5 w-24 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
