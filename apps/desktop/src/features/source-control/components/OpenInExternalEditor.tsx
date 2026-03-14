import { useEffect, useState } from "react";
import { ChevronDown, Copy, FolderOpen } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { desktop } from "@/platform/desktop";
import { Spinner } from "@/components/ui/spinner";

const OPEN_APP_PREFERENCE_KEY = "open-warden.open-app";

const OPEN_APPS = [
  "finder",
  "vscode",
  "cursor",
  "zed",
  "textmate",
  "antigravity",
  "terminal",
  "iterm2",
  "ghostty",
  "warp",
  "xcode",
  "android-studio",
  "powershell",
  "sublime-text",
] as const;

type OpenApp = (typeof OPEN_APPS)[number];
type DesktopOS = "macos" | "windows" | "linux" | "unknown";
type OpenTarget = "repository" | "file";

type OpenOption = {
  id: OpenApp;
  label: string;
  openWith?: string;
};

type EditorOption = {
  id: Exclude<OpenApp, "finder">;
  label: string;
  openWith: string;
};

const MAC_APPS: EditorOption[] = [
  { id: "vscode", label: "VS Code", openWith: "Visual Studio Code" },
  { id: "cursor", label: "Cursor", openWith: "Cursor" },
  { id: "zed", label: "Zed", openWith: "Zed" },
  { id: "textmate", label: "TextMate", openWith: "TextMate" },
  { id: "antigravity", label: "Antigravity", openWith: "Antigravity" },
  { id: "terminal", label: "Terminal", openWith: "Terminal" },
  { id: "iterm2", label: "iTerm2", openWith: "iTerm" },
  { id: "ghostty", label: "Ghostty", openWith: "Ghostty" },
  { id: "warp", label: "Warp", openWith: "Warp" },
  { id: "xcode", label: "Xcode", openWith: "Xcode" },
  { id: "android-studio", label: "Android Studio", openWith: "Android Studio" },
  { id: "sublime-text", label: "Sublime Text", openWith: "Sublime Text" },
];

const WINDOWS_APPS: EditorOption[] = [
  { id: "vscode", label: "VS Code", openWith: "code" },
  { id: "cursor", label: "Cursor", openWith: "cursor" },
  { id: "zed", label: "Zed", openWith: "zed" },
  { id: "powershell", label: "PowerShell", openWith: "powershell" },
  { id: "sublime-text", label: "Sublime Text", openWith: "Sublime Text" },
];

const LINUX_APPS: EditorOption[] = [
  { id: "vscode", label: "VS Code", openWith: "code" },
  { id: "cursor", label: "Cursor", openWith: "cursor" },
  { id: "zed", label: "Zed", openWith: "zed" },
  { id: "sublime-text", label: "Sublime Text", openWith: "Sublime Text" },
];

function detectOS(): DesktopOS {
  if (typeof navigator !== "object") return "unknown";

  const value = navigator.platform || navigator.userAgent;
  if (/Mac/i.test(value)) return "macos";
  if (/Win/i.test(value)) return "windows";
  if (/Linux/i.test(value)) return "linux";
  return "unknown";
}

function fileManagerOption(os: DesktopOS): OpenOption {
  if (os === "macos") return { id: "finder", label: "Finder" };
  if (os === "windows") return { id: "finder", label: "File Explorer" };
  return { id: "finder", label: "File Manager" };
}

function editorOptions(os: DesktopOS): EditorOption[] {
  if (os === "macos") return MAC_APPS;
  if (os === "windows") return WINDOWS_APPS;
  return LINUX_APPS;
}

function isOpenApp(value: string): value is OpenApp {
  return OPEN_APPS.includes(value as OpenApp);
}

function readPreferredApp(): OpenApp {
  if (typeof window !== "object") return "finder";
  const saved = window.localStorage.getItem(OPEN_APP_PREFERENCE_KEY);
  if (!saved || !isOpenApp(saved)) return "finder";
  return saved;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function resolveOpenPath(repoPath: string, filePath?: string): string {
  if (!repoPath) return "";
  if (!filePath) return repoPath;
  if (/^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(filePath)) return filePath;

  const cleanedFilePath = filePath.replace(/^[/\\]+/, "");
  if (/^[a-zA-Z]:[\\/]/.test(repoPath) || repoPath.includes("\\")) {
    const base = repoPath.replace(/[\\/]+$/, "");
    return `${base}\\${cleanedFilePath.replace(/\//g, "\\")}`;
  }

  const base = repoPath.replace(/\/+$/, "");
  return `${base}/${cleanedFilePath.replace(/\\/g, "/")}`;
}

function targetLabel(target: OpenTarget): string {
  if (target === "file") return "file";
  return "repository";
}

async function checkAppExists(appName: string): Promise<boolean> {
  try {
    return await desktop.checkAppExists(appName);
  } catch {
    return false;
  }
}

type OpenInExternalEditorProps = {
  repoPath: string;
  filePath?: string;
  target?: OpenTarget;
  disabled?: boolean;
  compact?: boolean;
};

export function OpenInExternalEditor({
  repoPath,
  filePath,
  target,
  disabled = false,
  compact = false,
}: OpenInExternalEditorProps) {
  const [preferredApp, setPreferredApp] = useState<OpenApp>(readPreferredApp);
  const [openingApp, setOpeningApp] = useState<OpenApp | null>(null);
  const [exists, setExists] = useState<Partial<Record<OpenApp, boolean>>>({ finder: true });

  const os = detectOS();
  const apps = editorOptions(os);
  const options: OpenOption[] = [fileManagerOption(os), ...apps.filter((app) => exists[app.id])];
  const current = options.find((option) => option.id === preferredApp) ?? options[0];
  const path = resolveOpenPath(repoPath, filePath);
  const currentTarget = target ?? (filePath ? "file" : "repository");
  const noun = targetLabel(currentTarget);
  const opening = openingApp !== null;
  const openDisabled = disabled || !path || !current || opening;

  useEffect(() => {
    if (typeof window !== "object") return;
    window.localStorage.setItem(OPEN_APP_PREFERENCE_KEY, preferredApp);
  }, [preferredApp]);

  useEffect(() => {
    let cancelled = false;
    const list = editorOptions(os);

    setExists({ finder: true });

    void Promise.all(
      list.map(async (app) => {
        const value = await checkAppExists(app.openWith);
        return [app.id, value] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Partial<Record<OpenApp, boolean>> = { finder: true };
      for (const [id, value] of entries) {
        next[id] = value;
      }
      setExists(next);
    });

    return () => {
      cancelled = true;
    };
  }, [os]);

  const openPathInApp = async (app: OpenApp) => {
    if (!path || opening) return;

    const option = options.find((item) => item.id === app);
    if (!option) return;

    setPreferredApp(app);
    setOpeningApp(app);

    try {
      await desktop.openPath(path, option.openWith ?? null);
    } catch (error) {
      toast.error(`Failed to open ${noun}`, { description: errorMessage(error) });
    } finally {
      setOpeningApp(null);
    }
  };

  const copyPath = async () => {
    if (!path) return;

    try {
      await navigator.clipboard.writeText(path);
      if (currentTarget === "file") toast.success("File path copied");
      if (currentTarget === "repository") toast.success("Repository path copied");
    } catch (error) {
      toast.error(`Failed to copy ${noun} path`, { description: errorMessage(error) });
    }
  };

  if (!current) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex h-6 w-6 items-center justify-center"
          title={`Open ${noun} in ${current.label}`}
          aria-label={`Open ${noun} in ${current.label}`}
          disabled={openDisabled}
          onClick={() => {
            void openPathInApp(current.id);
          }}
        >
          {opening ? <Spinner className="size-3.5" /> : <FolderOpen className="h-3.5 w-3.5" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground inline-flex h-6 w-5 items-center justify-center"
              aria-label={`Choose app for opening ${noun}`}
              disabled={openDisabled}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Open in</DropdownMenuLabel>

            <DropdownMenuRadioGroup
              value={current.id}
              onValueChange={(value) => {
                if (!isOpenApp(value)) return;
                setPreferredApp(value);
              }}
            >
              {options.map((option) => (
                <DropdownMenuRadioItem
                  key={option.id}
                  value={option.id}
                  disabled={openDisabled}
                  onSelect={() => {
                    void openPathInApp(option.id);
                  }}
                >
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              disabled={!path}
              onSelect={() => {
                void copyPath();
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy path
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="border-border/70 bg-surface-alt/50 flex h-6 items-center overflow-hidden rounded-md border">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground inline-flex h-full items-center gap-1.5 border-none px-2 text-[11px] font-medium"
        title={`Open ${noun} in ${current.label}`}
        aria-label={`Open ${noun} in ${current.label}`}
        disabled={openDisabled}
        onClick={() => {
          void openPathInApp(current.id);
        }}
      >
        {opening ? <Spinner className="size-3.5" /> : <FolderOpen className="h-3.5 w-3.5" />}
        <span>Open</span>
      </button>

      <div className="bg-border/70 h-full w-px" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground inline-flex h-full w-6 items-center justify-center"
            aria-label={`Choose app for opening ${noun}`}
            disabled={openDisabled}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Open in</DropdownMenuLabel>

          <DropdownMenuRadioGroup
            value={current.id}
            onValueChange={(value) => {
              if (!isOpenApp(value)) return;
              setPreferredApp(value);
            }}
          >
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.id}
                value={option.id}
                disabled={openDisabled}
                onSelect={() => {
                  void openPathInApp(option.id);
                }}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={!path}
            onSelect={() => {
              void copyPath();
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy path
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
