import { useAppSelector } from "@/app/hooks";
import { GeneralFileViewer } from "@/features/source-control/components/GeneralFileViewer";
import { useChangesKeyboardNav } from "@/features/source-control/hooks/useChangesKeyboardNav";

export function ChangesFilesScreen() {
  useChangesKeyboardNav("files");

  const fileViewerTarget = useAppSelector((state) => state.sourceControl.fileViewerTarget);

  return fileViewerTarget ? (
    <GeneralFileViewer />
  ) : (
    <div className="text-muted-foreground p-3 text-sm">Select a file from the tree.</div>
  );
}
