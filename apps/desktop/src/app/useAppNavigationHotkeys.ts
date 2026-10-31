import { useHotkey } from "@tanstack/react-hotkeys";

export function useAppNavigationHotkeys({
  openProject,
  openSettings,
}: {
  openProject: () => void;
  openSettings: () => void;
}) {
  useHotkey("Mod+T", openProject, { ignoreInputs: false });
  useHotkey("Mod+O", openProject, { ignoreInputs: false });
  useHotkey("Mod+,", openSettings, { ignoreInputs: false });
}
