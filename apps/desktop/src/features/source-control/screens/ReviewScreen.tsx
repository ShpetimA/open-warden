import { ErrorNotice, ErrorState } from "@/components/ui/error-state";
import { skipToken } from "@reduxjs/toolkit/query";
import { ArrowRightLeft, GitCompare } from "lucide-react";
import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { Button } from "@/components/ui/button";
import { BranchCombobox } from "../components/BranchCombobox";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import {
  useGetCommitDetailsQuery,
  useGetBranchesQuery,
  useGetBranchFilesQuery,
  useGetBranchFileVersionsQuery,
  useGetGitSnapshotQuery,
} from "@/features/source-control/api";
import {
  ReviewFileList,
  ReviewSelectionSync,
} from "@/features/source-control/components/ReviewFileList";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import {
  clearReviewSelection,
  setReviewActivePath,
  setReviewBaseRef,
  setReviewHeadRef,
} from "@/features/source-control/sourceControlSlice";
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

  const reviewVersions = branchFileVersionsQuery.currentData;
  const oldFile = reviewVersions?.oldFile ?? null;
  const newFile = reviewVersions?.newFile ?? null;
  const loadingPatch = !reviewVersions && branchFileVersionsQuery.isFetching;
  const errorMessage = reviewVersions ? "" : errorMessageFrom(branchFileVersionsQuery.error, "");
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
          <ErrorState
            title="Couldn’t load this diff"
            error={branchFileVersionsQuery.error}
            recovery={{
              label: "Retry",
              onAction: () => {
                void branchFileVersionsQuery.refetch();
              },
            }}
            busy={branchFileVersionsQuery.isFetching}
          />
        ) : loadingPatch ? (
          <div className="text-muted-foreground p-3 text-sm">Loading diff...</div>
        ) : !reviewActivePath ? (
          <div className="text-muted-foreground p-3 text-sm">Select a file to view diff.</div>
        ) : !oldFile && !newFile ? (
          <div className="text-muted-foreground p-3 text-sm">No diff content.</div>
        ) : (
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            {branchFileVersionsQuery.error ? (
              <ErrorNotice
                title="Couldn’t refresh this comparison"
                error={branchFileVersionsQuery.error}
                busy={branchFileVersionsQuery.isFetching}
                lastUpdated={branchFileVersionsQuery.fulfilledTimeStamp}
                recovery={{
                  label: "Retry",
                  onAction: () => {
                    void branchFileVersionsQuery.refetch();
                  },
                }}
              />
            ) : null}
            <DiffWorkspace
              modeChange={reviewVersions?.modeChange}
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
  const {
    branchList,
    loadingBranches,
    fetchingBranches,
    branchesError,
    refetch: retryBranches,
  } = useGetBranchesQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ currentData, isFetching, error }) => ({
      branchList: currentData ?? EMPTY_BRANCHES,
      loadingBranches: isFetching && !currentData,
      branchesError: error,
      fetchingBranches: isFetching,
    }),
  });
  const baseRevision = useGetCommitDetailsQuery(
    activeRepo && reviewBaseRef ? { repoPath: activeRepo, commitId: reviewBaseRef } : skipToken,
    {
      selectFromResult: ({ currentData, error, isFetching }) => ({
        id: currentData?.commitId ?? "",
        error,
        isFetching,
      }),
    },
  );
  const headRevision = useGetCommitDetailsQuery(
    activeRepo && reviewHeadRef ? { repoPath: activeRepo, commitId: reviewHeadRef } : skipToken,
    {
      selectFromResult: ({ currentData, error, isFetching }) => ({
        id: currentData?.commitId ?? "",
        error,
        isFetching,
      }),
    },
  );
  const readyForDiff = Boolean(activeRepo && baseRevision.id && headRevision.id);
  const revisionError = baseRevision.error ?? headRevision.error;

  const {
    branchFiles,
    hasBranchFilesData,
    loadingBranchFiles,
    branchFilesError,
    refetch: retryComparedFiles,
  } = useGetBranchFilesQuery(
    readyForDiff
      ? { repoPath: activeRepo, baseRef: baseRevision.id, headRef: headRevision.id }
      : skipToken,
    {
      selectFromResult: ({ currentData, isFetching, error }) => ({
        branchFiles: currentData ?? EMPTY_BRANCH_FILES,
        hasBranchFilesData: Boolean(currentData),
        loadingBranchFiles: isFetching,
        branchFilesError: error,
      }),
    },
  );

  useEffect(() => {
    if (!activeRepo) {
      dispatch(clearReviewSelection());
      return;
    }
    if (branchList.length === 0) {
      if (loadingBranches || branchesError) return;
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
  }, [
    activeBranch,
    activeRepo,
    branchList,
    branchesError,
    loadingBranches,
    dispatch,
    reviewBaseRef,
    reviewHeadRef,
  ]);

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
                <BranchCombobox
                  label="Base"
                  value={reviewBaseRef}
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

                <BranchCombobox
                  label="Compare"
                  value={reviewHeadRef}
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
            <ReviewFileList
              title="BRANCH REVIEW"
              subtitle={undefined}
              branchFiles={branchFiles}
              hasData={hasBranchFilesData}
              isLoading={
                fetchingBranches ||
                loadingBranchFiles ||
                baseRevision.isFetching ||
                headRevision.isFetching
              }
              error={branchesError || branchFilesError || revisionError}
              onRetry={() => {
                if (revisionError) {
                  void baseRevision.refetch();
                  void headRevision.refetch();
                } else void (branchesError ? retryBranches() : retryComparedFiles());
              }}
              activeRepo={activeRepo}
              reviewBaseRef={baseRevision.id}
              reviewHeadRef={headRevision.id}
              paneClassName="border-0 bg-transparent"
              headerClassName="hidden"
              bodyClassName="space-y-0.5 p-0.5"
              scrollAreaClassName="min-h-0 flex-1 overflow-hidden"
              emptyState={
                !reviewBaseRef || !reviewHeadRef ? (
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
                ) : (
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
                )
              }
            />
          </div>
        </aside>
      }
      content={
        <ReviewDiffPane
          activeRepo={activeRepo}
          reviewBaseRef={baseRevision.id}
          reviewHeadRef={headRevision.id}
          readyForDiff={readyForDiff}
          branchFiles={branchFiles}
        />
      }
    />
  );
}
