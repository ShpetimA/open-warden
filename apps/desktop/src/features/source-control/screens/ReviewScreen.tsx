import { skipToken } from "@reduxjs/toolkit/query";
import { ArrowRightLeft, GitCompare } from "lucide-react";
import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import {
  useGetBranchesQuery,
  useGetBranchFilesQuery,
  useGetBranchFileVersionsQuery,
  useGetGitSnapshotQuery,
} from "@/features/source-control/api";
import { usePrefetchReviewDiffs } from "@/features/source-control/hooks/usePrefetchNearbyDiffs";
import { useReviewKeyboardNav } from "@/features/source-control/hooks/useReviewKeyboardNav";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import {
  clearReviewSelection,
  setReviewActivePath,
  setReviewBaseRef,
  setReviewHeadRef,
} from "@/features/source-control/sourceControlSlice";
import { FileListRow } from "@/features/source-control/components/FileListRow";
import { SourceControlFileBrowser } from "@/features/source-control/components/SourceControlFileBrowser";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { FileItem } from "@/features/source-control/types";

function firstAvailableBranch(branches: string[]): string {
  return branches[0] ?? "";
}

function preferredBaseBranch(branches: string[]): string {
  if (branches.includes("main")) return "main";
  if (branches.includes("master")) return "master";
  const remoteMain = branches.find((branch) => branch.endsWith("/main"));
  if (remoteMain) return remoteMain;
  const remoteMaster = branches.find((branch) => branch.endsWith("/master"));
  if (remoteMaster) return remoteMaster;
  return firstAvailableBranch(branches);
}

function firstDifferentBranch(branches: string[], current: string): string {
  const found = branches.find((branch) => branch !== current);
  return found ?? current;
}

const EMPTY_BRANCHES: string[] = [];
const EMPTY_BRANCH_FILES: FileItem[] = [];

type BranchSelectFieldProps = {
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  onChange: (value: string) => void;
};

function BranchSelectField({
  label,
  value,
  placeholder,
  options,
  onChange,
}: BranchSelectFieldProps) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 w-full text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((branch) => (
            <SelectItem key={`${label}-${branch}`} value={branch}>
              {branch}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type ReviewSelectionSyncProps = {
  readyForDiff: boolean;
  branchFiles: FileItem[];
  hasBranchFilesData: boolean;
};

function ReviewSelectionSync({
  readyForDiff,
  branchFiles,
  hasBranchFilesData,
}: ReviewSelectionSyncProps) {
  const dispatch = useAppDispatch();
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath);

  useEffect(() => {
    if (!readyForDiff) {
      if (reviewActivePath) dispatch(setReviewActivePath(""));
      return;
    }

    if (!hasBranchFilesData) return;

    if (branchFiles.length === 0) {
      if (reviewActivePath) dispatch(setReviewActivePath(""));
      return;
    }

    const existing = branchFiles.find((file) => file.path === reviewActivePath);
    if (!existing) {
      dispatch(setReviewActivePath(branchFiles[0].path));
    }
  }, [branchFiles, dispatch, hasBranchFilesData, readyForDiff, reviewActivePath]);

  return null;
}

type ReviewFileListProps = {
  branchFiles: FileItem[];
  activeRepo: string;
  reviewBaseRef: string;
  reviewHeadRef: string;
};

function ReviewFileList({
  branchFiles,
  activeRepo,
  reviewBaseRef,
  reviewHeadRef,
}: ReviewFileListProps) {
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );

  useReviewKeyboardNav();

  return (
    <div data-nav-region="review-files" className="h-full overflow-auto">
      <SourceControlFileBrowser
        files={branchFiles}
        mode={fileBrowserMode}
        className="space-y-0.5 p-0.5"
        renderFile={({ depth, file, mode, name, navIndex }) => (
          <ReviewFileRow
            key={file.path}
            file={file}
            activeRepo={activeRepo}
            reviewBaseRef={reviewBaseRef}
            reviewHeadRef={reviewHeadRef}
            depth={mode === "tree" ? depth : 0}
            label={mode === "tree" ? name : undefined}
            navIndex={navIndex}
            showDirectoryPath={mode !== "tree"}
          />
        )}
      />
    </div>
  );
}

type ReviewFileRowProps = {
  file: FileItem;
  activeRepo: string;
  reviewBaseRef: string;
  reviewHeadRef: string;
  depth: number;
  label?: string;
  navIndex: number;
  showDirectoryPath: boolean;
};

function ReviewFileRow({
  file,
  activeRepo,
  reviewBaseRef,
  reviewHeadRef,
  depth,
  label,
  navIndex,
  showDirectoryPath,
}: ReviewFileRowProps) {
  const dispatch = useAppDispatch();
  const commentCount = useAppSelector((state) =>
    countCommentsForPathInRepoContext(state.comments, activeRepo, file.path, {
      kind: "review",
      baseRef: reviewBaseRef,
      headRef: reviewHeadRef,
    }),
  );
  const isActive = useAppSelector((state) => state.sourceControl.reviewActivePath === file.path);

  return (
    <FileListRow
      path={file.path}
      status={file.status}
      commentCount={commentCount}
      isActive={isActive}
      navIndex={navIndex}
      depth={depth}
      label={label}
      showDirectoryPath={showDirectoryPath}
      onSelect={() => {
        dispatch(setReviewActivePath(file.path));
      }}
    />
  );
}

type ReviewDiffPaneProps = {
  activeRepo: string;
  reviewBaseRef: string;
  reviewHeadRef: string;
  readyForDiff: boolean;
  branchFiles: FileItem[];
};

function ReviewDiffPane({
  activeRepo,
  reviewBaseRef,
  reviewHeadRef,
  readyForDiff,
  branchFiles,
}: ReviewDiffPaneProps) {
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath);
  const diffFocusTarget = useAppSelector((state) => state.sourceControl.diffFocusTarget);
  usePrefetchReviewDiffs(branchFiles, activeRepo, reviewBaseRef, reviewHeadRef, reviewActivePath);
  const selectedReviewFile = branchFiles.find((file) => file.path === reviewActivePath);
  const previewSelection = useThrottledDiffSelection(
    reviewActivePath
      ? {
          path: reviewActivePath,
          previousPath: selectedReviewFile?.previousPath ?? undefined,
        }
      : null,
  );
  const branchFileVersionsQuery = useGetBranchFileVersionsQuery(
    readyForDiff && previewSelection
      ? {
          repoPath: activeRepo,
          baseRef: reviewBaseRef,
          headRef: reviewHeadRef,
          relPath: previewSelection.path,
          previousPath: previewSelection.previousPath,
        }
      : skipToken,
  );

  const reviewVersions = branchFileVersionsQuery.data;
  const oldFile = reviewVersions?.oldFile ?? null;
  const newFile = reviewVersions?.newFile ?? null;
  const loadingPatch = branchFileVersionsQuery.isFetching;
  const errorMessage = errorMessageFrom(branchFileVersionsQuery.error, "");
  const context = { kind: "review" as const, baseRef: reviewBaseRef, headRef: reviewHeadRef };
  const previewPath = previewSelection?.path ?? "";
  const focusedLineNumber =
    diffFocusTarget?.kind === "review" && diffFocusTarget.path === previewPath
      ? diffFocusTarget.lineNumber
      : null;
  const focusedLineIndex =
    diffFocusTarget?.kind === "review" && diffFocusTarget.path === previewPath
      ? diffFocusTarget.lineIndex
      : null;
  const focusedLineKey =
    diffFocusTarget?.kind === "review" && diffFocusTarget.path === previewPath
      ? diffFocusTarget.focusKey
      : null;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {errorMessage ? (
          <div className="text-destructive p-3 text-sm">{errorMessage}</div>
        ) : loadingPatch ? (
          <div className="text-muted-foreground p-3 text-sm">Loading diff...</div>
        ) : !reviewActivePath ? (
          <div className="text-muted-foreground p-3 text-sm">Select a file to view diff.</div>
        ) : !oldFile && !newFile ? (
          <div className="text-muted-foreground p-3 text-sm">No diff content.</div>
        ) : (
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <DiffWorkspace
              oldFile={oldFile}
              newFile={newFile}
              activePath={previewPath}
              commentContext={context}
              canComment
              fileViewerRevision={reviewHeadRef}
              lspJumpContextKind="review"
              focusedLineNumber={focusedLineNumber}
              focusedLineIndex={focusedLineIndex}
              focusedLineKey={focusedLineKey}
            />
          </div>
        )}
      </div>
    </section>
  );
}

export function ReviewScreen() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const reviewBaseRef = useAppSelector((state) => state.sourceControl.reviewBaseRef);
  const reviewHeadRef = useAppSelector((state) => state.sourceControl.reviewHeadRef);

  const { activeBranch } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      activeBranch: data?.branch ?? "",
    }),
  });
  const { branchList } = useGetBranchesQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      branchList: data ?? EMPTY_BRANCHES,
    }),
  });
  const readyForDiff = Boolean(activeRepo && reviewBaseRef && reviewHeadRef);

  const { branchFiles, hasBranchFilesData } = useGetBranchFilesQuery(
    readyForDiff
      ? { repoPath: activeRepo, baseRef: reviewBaseRef, headRef: reviewHeadRef }
      : skipToken,
    {
      selectFromResult: ({ data }) => ({
        branchFiles: data ?? EMPTY_BRANCH_FILES,
        hasBranchFilesData: Boolean(data),
      }),
    },
  );

  useEffect(() => {
    if (!activeRepo) {
      dispatch(clearReviewSelection());
      return;
    }
    if (branchList.length === 0) {
      if (reviewBaseRef) dispatch(setReviewBaseRef(""));
      if (reviewHeadRef) dispatch(setReviewHeadRef(""));
      dispatch(clearReviewSelection());
      return;
    }

    const hasBase = branchList.includes(reviewBaseRef);
    const hasHead = branchList.includes(reviewHeadRef);

    const nextBase = hasBase ? reviewBaseRef : preferredBaseBranch(branchList);
    if (nextBase !== reviewBaseRef) {
      dispatch(setReviewBaseRef(nextBase));
    }

    const preferredHead = activeBranch && branchList.includes(activeBranch) ? activeBranch : "";
    const nextHead = hasHead
      ? reviewHeadRef
      : preferredHead || firstDifferentBranch(branchList, nextBase);
    if (nextHead !== reviewHeadRef) {
      dispatch(setReviewHeadRef(nextHead));
    }
  }, [activeBranch, activeRepo, branchList, dispatch, reviewBaseRef, reviewHeadRef]);

  return (
    <ResizableSidebarLayout
      panelId="review"
      sidebarDefaultSize={24}
      sidebarMinSize={16}
      sidebarMaxSize={40}
      sidebar={
        <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r">
          <div className="border-border border-b p-2.5">
            <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
              BRANCH REVIEW
            </div>
            <div className="border-input bg-surface mt-2 rounded-md border p-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1.5">
                <BranchSelectField
                  label="Base"
                  value={reviewBaseRef}
                  placeholder="Base ref"
                  options={branchList}
                  onChange={(value) => {
                    dispatch(setReviewBaseRef(value));
                    dispatch(setReviewActivePath(""));
                  }}
                />

                <Button
                  size="icon-xs"
                  variant="outline"
                  className="mb-0.5"
                  onClick={() => {
                    const nextBase = reviewHeadRef;
                    const nextHead = reviewBaseRef;
                    dispatch(setReviewBaseRef(nextBase));
                    dispatch(setReviewHeadRef(nextHead));
                    dispatch(setReviewActivePath(""));
                  }}
                  disabled={!reviewBaseRef || !reviewHeadRef}
                  title="Swap branches"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                </Button>

                <BranchSelectField
                  label="Compare"
                  value={reviewHeadRef}
                  placeholder="Compare ref"
                  options={branchList}
                  onChange={(value) => {
                    dispatch(setReviewHeadRef(value));
                    dispatch(setReviewActivePath(""));
                  }}
                />
              </div>
            </div>
          </div>

          <ReviewSelectionSync
            readyForDiff={readyForDiff}
            branchFiles={branchFiles}
            hasBranchFilesData={hasBranchFilesData}
          />

          <div className="min-h-0 flex-1 overflow-hidden">
            {!reviewBaseRef || !reviewHeadRef ? (
              <Empty className="h-auto border-0 p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <GitCompare className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>Select branches</EmptyTitle>
                  <EmptyDescription>
                    Select both base and compare branches to start review.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : branchFiles.length === 0 ? (
              <Empty className="h-auto border-0 p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <GitCompare className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>No changes</EmptyTitle>
                  <EmptyDescription>
                    No changed files between the selected branches.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ReviewFileList
                branchFiles={branchFiles}
                activeRepo={activeRepo}
                reviewBaseRef={reviewBaseRef}
                reviewHeadRef={reviewHeadRef}
              />
            )}
          </div>
        </aside>
      }
      content={
        <ReviewDiffPane
          activeRepo={activeRepo}
          reviewBaseRef={reviewBaseRef}
          reviewHeadRef={reviewHeadRef}
          readyForDiff={readyForDiff}
          branchFiles={branchFiles}
        />
      }
    />
  );
}
