import { Download, LoaderCircle, Rocket } from "lucide-react";
import { toast } from "sonner";

import type { RootState } from "@/app/store";
import { useAppSelector } from "@/app/hooks";
import { desktop, type DesktopUpdateState } from "@/platform/desktop";

function buttonTitle(state: ReturnType<typeof selectDesktopUpdateState>): string {
  if (state.status === "checking") {
    return "Checking for updates";
  }

  if (state.status === "available") {
    return `Download OpenWarden ${state.availableVersion ?? ""}`.trim();
  }

  if (state.status === "downloading") {
    const suffix = state.downloadPercent === null ? "" : ` (${state.downloadPercent}%)`;
    return `Downloading update${suffix}`;
  }

  if (state.status === "downloaded") {
    return `Restart to install OpenWarden ${state.downloadedVersion ?? ""}`.trim();
  }

  if (state.status === "error" && state.message) {
    return `Retry update check (${state.message})`;
  }

  return "Check for updates";
}

function buttonIcon(state: ReturnType<typeof selectDesktopUpdateState>) {
  if (state.status === "checking" || state.status === "downloading") {
    return LoaderCircle;
  }

  if (state.status === "available" || state.status === "downloaded") {
    return Rocket;
  }

  return Download;
}

function iconClassName(state: ReturnType<typeof selectDesktopUpdateState>): string {
  if (state.status === "checking" || state.status === "downloading") {
    return "h-3.5 w-3.5 animate-spin";
  }

  return "h-3.5 w-3.5";
}

function buttonClassName(state: ReturnType<typeof selectDesktopUpdateState>): string {
  const activeState = state.status === "available" || state.status === "downloaded";

  return [
    "border-input bg-surface-alt inline-flex h-8 w-8 items-center justify-center rounded-md border",
    activeState
      ? "text-foreground hover:bg-accent"
      : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}

function selectDesktopUpdateState(state: RootState) {
  return state.desktopUpdate;
}

function successMessage(state: DesktopUpdateState): string | null {
  if (state.status === "up-to-date") {
    return `OpenWarden ${state.currentVersion} is up to date.`;
  }

  if (state.status === "available" && state.availableVersion) {
    return `OpenWarden ${state.availableVersion} is available to download.`;
  }

  if (state.status === "downloaded") {
    return "Update downloaded. Restart OpenWarden to install it.";
  }

  return null;
}

function failureMessage(state: DesktopUpdateState): string {
  return state.message ?? "The update action did not complete.";
}

async function runUpdateAction(status: ReturnType<typeof selectDesktopUpdateState>["status"]) {
  if (status === "available") {
    return desktop.downloadUpdate();
  }

  if (status === "downloaded") {
    return desktop.installUpdate();
  }

  return desktop.checkForUpdates();
}

export function DesktopUpdateButton() {
  const state = useAppSelector(selectDesktopUpdateState);

  if (!state.hydrated || !state.enabled) {
    return null;
  }

  const Icon = buttonIcon(state);
  const disabled = state.status === "checking" || state.status === "downloading";

  return (
    <button
      type="button"
      className={buttonClassName(state)}
      onClick={() => {
        void runUpdateAction(state.status)
          .then((result) => {
            if (!result.accepted) {
              return;
            }

            if (!result.completed) {
              toast.error(failureMessage(result.state));
              return;
            }

            const message = successMessage(result.state);
            if (message) {
              toast.success(message);
            }
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(message);
          });
      }}
      title={buttonTitle(state)}
      aria-label={buttonTitle(state)}
      disabled={disabled}
    >
      <Icon className={iconClassName(state)} />
    </button>
  );
}
