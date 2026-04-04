import { useEffect, useState } from "react";
import { ExternalLink, FileJson, Settings2 } from "lucide-react";

import { useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { SourceControlFileViewToggle } from "@/features/source-control/components/SourceControlFileViewToggle";
import { desktop } from "@/platform/desktop";

export function SettingsScreen() {
  const error = useAppSelector((state) => state.settings.error);
  const [settingsPath, setSettingsPath] = useState("");

  useEffect(() => {
    let cancelled = false;

    void desktop
      .getAppSettingsPath()
      .then((path) => {
        if (!cancelled) {
          setSettingsPath(path);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettingsPath("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
        <div className="space-y-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-surface-alt">
            <Settings2 className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-[-0.03em]">Settings</h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-6">
              Global preferences are stored in a JSON file and stay in sync with the app while it
              is open.
            </p>
          </div>
        </div>

        <section className="border-border/70 bg-surface-toolbar rounded-2xl border">
          <div className="border-border/70 flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">File Tree Views</div>
              <p className="text-muted-foreground text-sm leading-6">
                Choose the default render mode used across changes, history, review, and repository
                file trees.
              </p>
            </div>
            <SourceControlFileViewToggle />
          </div>

          <div className="flex items-start gap-3 px-5 py-4">
            <div className="bg-background text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/8">
              <FileJson className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-sm font-medium">Settings file</div>
              <p className="text-muted-foreground text-sm leading-6">
                Editing the JSON file updates the UI live. UI changes write back to the same file.
              </p>
              {settingsPath ? (
                <p className="text-muted-foreground truncate font-mono text-xs">{settingsPath}</p>
              ) : null}
              {error ? <p className="text-destructive text-sm">{error}</p> : null}
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={!settingsPath}
              onClick={() => {
                if (!settingsPath) {
                  return;
                }

                void desktop.openPath(settingsPath);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              Open JSON
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
