import { FilePaneEmpty, FilePaneHeader } from "./FilePaneHeader";
import { filePaneCount, filterFilePaths } from "./filePaneFilter";
import { useRepositoryTrash } from "../hooks/useRepositoryTrash";
import { RepositoryEntryContextMenu } from "./RepositoryEntryContextMenu";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useEffect, useState, type ReactNode } from "react";
import { RetainedFileList } from "./RetainedFileList";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import { useGetRepoFilesQuery } from "@/features/source-control/api";
import {
  openFileViewer,
  setRepoTreeActivePath,
} from "@/features/source-control/sourceControlSlice";
import { selectRepoFilePath } from "../fileSelection";
import { CreateRepositoryEntry, InlineRepositoryEntry } from "./CreateRepositoryEntry";
import {
  cancelPierreFileTreeFocus,
  getPierreFileTreeCreationContext,
  requestPierreFileTreeFocus,
} from "../pierreFileTreeNavigation";
import { FileList } from "./FileList";
import type { RepoFileItem } from "../types";

const EMPTY_FILES: readonly RepoFileItem[] = [];

export function RepoFilesTab() {
  const dispatch = useAppDispatch();
  const [filter, setFilter] = useState("");
  const [creation, setCreation] = useState<{
    repoPath: string;
    prefix: string;
    path: string;
    returnPath: string | null;
    anchorPath?: string;
  } | null>(null);
  useEffect(() => () => cancelPierreFileTreeFocus("repo-files"), []);
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const comments = useAppSelector((state) => state.comments);
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const { repoFiles, hasFilesData } = useGetRepoFilesQuery(activeRepo, {
    skip: !activeRepo,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    selectFromResult: ({ currentData }) => ({
      repoFiles: currentData ?? EMPTY_FILES,
      hasFilesData: currentData !== undefined,
    }),
  });
  const visibleFiles = filterFilePaths(repoFiles, filter);

  const openRepoFilePath = (path: string) => {
    if (!activeRepo) {
      dispatch(setRepoTreeActivePath(path));
      return;
    }

    dispatch(
      openFileViewer({
        repoPath: activeRepo,
        relPath: path,
      }),
    );
  };

  const activeCreation = creation?.repoPath === activeRepo ? creation : null;
  const { trash, busy: trashing } = useRepositoryTrash(activeRepo, Boolean(activeCreation));
  function startCreation() {
    const { prefix, anchorPath, returnPath } = getPierreFileTreeCreationContext("repo-files");
    let path = `${prefix}.new-entry`;
    let suffix = 1;
    while (repoFiles.some((file) => file.path === path || file.path.startsWith(`${path}/`))) {
      path = `${prefix}.new-entry-${suffix}`;
      suffix += 1;
    }
    setCreation({
      repoPath: activeRepo,
      prefix,
      path,
      returnPath,
      anchorPath,
    });
  }

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r">
      <FilePaneHeader
        title="Repository files"
        summary={hasFilesData ? filePaneCount(visibleFiles.length, repoFiles.length) : undefined}
        filter={filter}
        onFilterChange={setFilter}
        actions={
          <CreateRepositoryEntry
            repoPath={activeRepo}
            active={Boolean(activeCreation)}
            busy={trashing}
            onStart={startCreation}
          />
        }
      />
      <RepositoryFileReadState repoPath={activeRepo}>
        {visibleFiles.length === 0 && !activeCreation ? (
          <FilePaneEmpty
            filtered={Boolean(filter.trim())}
            description="No repository files found. Create a file or folder to get started."
            onClear={() => setFilter("")}
          />
        ) : (
          <FileList
            files={visibleFiles}
            renderContextMenu={(file, _item, context) => (
              <RepositoryEntryContextMenu
                context={context}
                disabled={trashing || Boolean(activeCreation)}
                onTrash={() => void trash({ path: file.path, kind: "file" })}
              />
            )}
            renderDirectoryContextMenu={(item, context) => (
              <RepositoryEntryContextMenu
                context={context}
                disabled={trashing || Boolean(activeCreation)}
                onTrash={() => void trash({ path: item.path, kind: "directory" })}
              />
            )}
            inlineEditor={
              activeCreation
                ? {
                    path: activeCreation.path,
                    anchorPath: activeCreation.anchorPath,
                    children: (
                      <InlineRepositoryEntry
                        key={activeCreation.path}
                        repoPath={activeRepo}
                        prefix={activeCreation.prefix}
                        onClose={({ restoreFocus }) => {
                          setCreation(null);
                          if (restoreFocus)
                            requestPierreFileTreeFocus(
                              "repo-files",
                              activeCreation.returnPath ?? undefined,
                            );
                        }}
                      />
                    ),
                  }
                : undefined
            }
            mode={fileBrowserMode}
            selection={selectRepoFilePath}
            navRegion="repo-files"
            initialExpansion="closed"
            autoFocus={false}
            onActivatePath={(path) => {
              openRepoFilePath(path);
            }}
            getCommentCount={(file) =>
              countCommentsForPathInRepoContext(comments, activeRepo, file.path)
            }
          />
        )}
      </RepositoryFileReadState>
    </aside>
  );
}

function RepositoryFileReadState({
  repoPath,
  children,
}: {
  repoPath: string;
  children: ReactNode;
}) {
  const { hasData, fetching, error, refetch } = useGetRepoFilesQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData, isFetching, error }) => ({
      hasData: currentData !== undefined,
      fetching: isFetching,
      error,
    }),
  });
  return (
    <RetainedFileList
      hasData={hasData}
      fetching={fetching}
      error={error}
      loadingLabel="Loading repository files…"
      errorTitle="Couldn’t load repository files"
      onRetry={() => {
        void refetch();
      }}
    >
      {children}
    </RetainedFileList>
  );
}
