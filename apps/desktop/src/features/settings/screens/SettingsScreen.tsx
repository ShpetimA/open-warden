import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router";

import { ThemeSwitcher } from "@/app/ThemeSwitcher";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { ActionError } from "@/components/ui/error-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GuidanceConnectionSettings } from "@/features/guidance/GuidanceConnectionSettings";
import { restoreAppSettings, updateFileTreeRenderMode } from "@/features/settings/actions";
import { SourceControlFileViewToggle } from "@/features/source-control/components/SourceControlFileViewToggle";
import { selectActiveWorkspace } from "@/features/workspaces/workspacesSlice";
import { workspacePath } from "@/features/workspaces/workspaceRoutes";
import { desktop } from "@/platform/desktop";
import type { DesktopFailure, DesktopResult } from "@/platform/desktop/failure";
import { KeyboardShortcuts } from "../components/KeyboardShortcuts";

const sections = [
  { id: "preferences", label: "Preferences" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "integrations", label: "Integrations" },
  { id: "advanced", label: "Advanced" },
] as const;

type Section = (typeof sections)[number]["id"];

function SettingsPage({
  content,
  notice,
  onBack,
}: {
  content: Readonly<Record<Section, ReactNode>>;
  notice?: ReactNode;
  onBack: () => void;
}) {
  const [section, setSection] = useState<Section>("preferences");

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-4">
        <header className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" aria-label="Back to workspace" onClick={onBack}>
            <ArrowLeft />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        </header>
        {notice}
        <Tabs
          value={section}
          onValueChange={(value) => {
            const next = sections.find((item) => item.id === value);

            if (next) setSection(next.id);
          }}
          className="gap-4"
        >
          <TabsList aria-label="Settings sections" className="bg-surface-toolbar">
            {sections.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((item) => (
            <TabsContent key={item.id} value={item.id}>
              {section === item.id ? content[item.id] : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function SettingsPreferences({
  themeControl,
  fileLayoutControl,
}: {
  themeControl: ReactNode;
  fileLayoutControl: ReactNode;
}) {
  return (
    <section
      aria-label="Preferences"
      className="border-border/70 bg-surface-toolbar divide-border/70 divide-y rounded-md border"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-medium">Theme</h2>
          <p className="text-muted-foreground text-xs">Light, dark, or follow your system.</p>
        </div>
        {themeControl}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-medium">File layout</h2>
          <p className="text-muted-foreground text-xs">Use folders or a flat list in file panes.</p>
        </div>
        {fileLayoutControl}
      </div>
    </section>
  );
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const workspace = useAppSelector(selectActiveWorkspace);
  const savedPath = useAppSelector((state) =>
    workspace ? state.workspaces.locations[workspace.id] : undefined,
  );

  return (
    <SettingsPage
      onBack={() => navigate(savedPath ?? (workspace ? workspacePath(workspace) : "/changes"))}
      notice={<PreferencesFailure />}
      content={{
        preferences: (
          <SettingsPreferences
            themeControl={<ThemeSwitcher />}
            fileLayoutControl={<SourceControlFileViewToggle />}
          />
        ),
        shortcuts: <KeyboardShortcuts />,
        integrations: <GuidanceConnectionSettings />,
        advanced: <SettingsFile />,
      }}
    />
  );
}

function PreferencesFailure() {
  const dispatch = useAppDispatch();
  const error = useAppSelector((state) => state.settings.error);
  const mode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );

  if (!error) return null;

  return (
    <ActionError
      title="Preferences couldn’t be saved or loaded"
      error={error}
      recovery={{
        label: "Retry",
        onAction: () => {
          if (error.operation === "saveAppSettings") void dispatch(updateFileTreeRenderMode(mode));
          else void dispatch(restoreAppSettings());
        },
      }}
    />
  );
}

function SettingsFile() {
  const [pathResult, setPathResult] = useState<DesktopResult<string> | null>(null);
  const [openError, setOpenError] = useState<DesktopFailure | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void desktop.getAppSettingsPath().then((result) => {
      if (!cancelled) setPathResult(result);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function findPath() {
    setBusy(true);

    setPathResult(await desktop.getAppSettingsPath());

    setBusy(false);
  }

  async function openFile() {
    if (!pathResult?.ok || busy) return;

    setBusy(true);
    setOpenError(null);

    const result = await desktop.openPath(pathResult.value);

    if (!result.ok) setOpenError(result.error);

    setBusy(false);
  }

  return (
    <section
      aria-labelledby="settings-file-title"
      className="border-border/70 bg-surface-toolbar space-y-3 rounded-md border p-4"
    >
      <div className="space-y-1">
        <h2 id="settings-file-title" className="text-sm font-medium">
          Settings file
        </h2>
        <p className="text-muted-foreground text-xs">
          Edit preferences that are not available in this screen.
        </p>
      </div>
      {!pathResult ? (
        <p role="status" className="text-muted-foreground text-xs">
          Finding settings file…
        </p>
      ) : null}
      {pathResult?.ok ? (
        <>
          <p className="text-muted-foreground break-all font-mono text-xs">{pathResult.value}</p>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void openFile()}>
            <ExternalLink />
            {busy ? "Opening…" : "Open settings file"}
          </Button>
        </>
      ) : null}
      {pathResult && !pathResult.ok ? (
        <ActionError
          title="Couldn’t locate settings file"
          error={pathResult.error}
          busy={busy}
          recovery={{ label: "Retry", onAction: () => void findPath() }}
        />
      ) : null}
      {openError ? (
        <ActionError
          title="Couldn’t open settings file"
          error={openError}
          busy={busy}
          recovery={{ label: "Retry", onAction: () => void openFile() }}
        />
      ) : null}
    </section>
  );
}
