import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { useAppSelector } from "@/app/hooks";
import { GeneralFileViewer } from "@/features/source-control/components/GeneralFileViewer";
import { RepoFilesSidebar } from "@/features/source-control/components/RepoFilesSidebar";
import { useChangesKeyboardNav } from "@/features/source-control/hooks/useChangesKeyboardNav";

export function ChangesFilesScreen() {
  useChangesKeyboardNav("files");

  const fileViewerTarget = useAppSelector((state) => state.sourceControl.fileViewerTarget);

  return (
    <ResizableSidebarLayout
      panelId="primary"
      sidebarDefaultSize={22}
      sidebarMinSize={14}
      sidebarMaxSize={34}
      sidebar={<RepoFilesSidebar />}
      content={
        fileViewerTarget ? (
          <GeneralFileViewer />
        ) : (
          <div className="text-muted-foreground p-3 text-sm">Select a file from the tree.</div>
        )
      }
    />
  );
}
