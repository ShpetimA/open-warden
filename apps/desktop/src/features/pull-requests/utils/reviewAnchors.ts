import type { DiffLineAnnotation } from "@pierre/diffs";

import type {
  CommentItem,
  DiffAnnotationItem,
  PullRequestReviewAnchor,
} from "@/features/source-control/types";
import type { PullRequestReviewThread, GitProviderId } from "@/platform/desktop";

export type PullRequestAnchorFile = {
  path: string;
  previousPath?: string | null;
};

function normalizePath(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^\.\/+/, "");
}

function toAnchorSide(diffSide: PullRequestReviewThread["diffSide"]) {
  return diffSide === "LEFT" ? "deletions" : "additions";
}

function toAnchorRange(startLine: number | null | undefined, endLine: number | null | undefined) {
  const normalizedStart = startLine && startLine > 0 ? startLine : null;
  const normalizedEnd = endLine && endLine > 0 ? endLine : null;
  const firstLine = normalizedStart ?? normalizedEnd;
  const lastLine = normalizedEnd ?? normalizedStart;

  if (!firstLine || !lastLine) {
    return null;
  }

  return {
    startLine: Math.min(firstLine, lastLine),
    endLine: Math.max(firstLine, lastLine),
  };
}

function pendingDraftOrder(comment: CommentItem) {
  const prefix = Number.parseInt(comment.id.split("-")[0] ?? "", 10);
  return Number.isFinite(prefix) ? prefix : Number.MAX_SAFE_INTEGER;
}

function remoteThreadOrder(thread: PullRequestReviewThread) {
  const createdAt = thread.comments[0]?.createdAt ?? "";
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function comparePendingDrafts(left: CommentItem, right: CommentItem) {
  const leftOrder = pendingDraftOrder(left);
  const rightOrder = pendingDraftOrder(right);
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.id.localeCompare(right.id);
}

function compareRemoteThreads(left: PullRequestReviewThread, right: PullRequestReviewThread) {
  const leftOrder = remoteThreadOrder(left);
  const rightOrder = remoteThreadOrder(right);
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.id.localeCompare(right.id);
}

function compareAnchors(left: PullRequestReviewAnchor, right: PullRequestReviewAnchor) {
  if (left.startLine !== right.startLine) {
    return left.startLine - right.startLine;
  }

  if (left.endLine !== right.endLine) {
    return left.endLine - right.endLine;
  }

  if (left.side !== right.side) {
    return left.side === "deletions" ? -1 : 1;
  }

  return left.key.localeCompare(right.key);
}

function resolveFileLookup(files: PullRequestAnchorFile[]) {
  const fileByPath = new Map<string, PullRequestAnchorFile>();

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    if (normalizedPath) {
      fileByPath.set(normalizedPath, file);
    }

    const normalizedPreviousPath = normalizePath(file.previousPath);
    if (normalizedPreviousPath) {
      fileByPath.set(normalizedPreviousPath, file);
    }
  }

  return fileByPath;
}

function createAnchorKey(input: {
  path: string;
  side: PullRequestReviewAnchor["side"];
  startLine: number;
  endLine: number;
}) {
  return `${input.path}:${input.side}:${String(input.startLine)}:${String(input.endLine)}`;
}

function getOrCreateAnchor(
  anchorMap: Map<string, PullRequestReviewAnchor>,
  input: {
    path: string;
    previousPath: string | null;
    side: PullRequestReviewAnchor["side"];
    startLine: number;
    endLine: number;
  },
) {
  const key = createAnchorKey(input);
  const existingAnchor = anchorMap.get(key);
  if (existingAnchor) {
    return existingAnchor;
  }

  const nextAnchor: PullRequestReviewAnchor = {
    key,
    path: input.path,
    previousPath: input.previousPath,
    side: input.side,
    startLine: input.startLine,
    endLine: input.endLine,
    remoteThreads: [],
    pendingDrafts: [],
  };

  anchorMap.set(key, nextAnchor);
  return nextAnchor;
}

export function buildPullRequestReviewAnchors(args: {
  files: PullRequestAnchorFile[];
  reviewThreads: PullRequestReviewThread[];
  pendingDrafts: CommentItem[];
}) {
  const fileLookup = resolveFileLookup(args.files);
  const anchorMap = new Map<string, PullRequestReviewAnchor>();

  for (const thread of args.reviewThreads) {
    const matchedFile = fileLookup.get(normalizePath(thread.path));
    if (!matchedFile) {
      continue;
    }

    const range = toAnchorRange(thread.startLine, thread.line);
    if (!range) {
      continue;
    }

    const anchor = getOrCreateAnchor(anchorMap, {
      path: matchedFile.path,
      previousPath: matchedFile.previousPath ?? null,
      side: toAnchorSide(thread.diffSide),
      startLine: range.startLine,
      endLine: range.endLine,
    });
    anchor.remoteThreads.push(thread);
  }

  for (const draft of args.pendingDrafts) {
    const matchedFile = fileLookup.get(normalizePath(draft.filePath));
    if (!matchedFile) {
      continue;
    }

    const range = toAnchorRange(draft.startLine, draft.endLine);
    if (!range) {
      continue;
    }

    const anchor = getOrCreateAnchor(anchorMap, {
      path: matchedFile.path,
      previousPath: matchedFile.previousPath ?? null,
      side: draft.endSide ?? draft.side,
      startLine: range.startLine,
      endLine: range.endLine,
    });
    anchor.pendingDrafts.push(draft);
  }

  const anchorsByFile: Record<string, PullRequestReviewAnchor[]> = {};
  const allAnchors: PullRequestReviewAnchor[] = [];

  for (const file of args.files) {
    const fileAnchors = Array.from(anchorMap.values())
      .filter((anchor) => anchor.path === file.path)
      .toSorted(compareAnchors)
      .map((anchor) => ({
        ...anchor,
        remoteThreads: anchor.remoteThreads.toSorted(compareRemoteThreads),
        pendingDrafts: anchor.pendingDrafts.toSorted(comparePendingDrafts),
      }));

    anchorsByFile[file.path] = fileAnchors;
    allAnchors.push(...fileAnchors);
  }

  const pendingAnchors = allAnchors.filter((anchor) => anchor.pendingDrafts.length > 0);
  const remoteAnchors = allAnchors.filter(
    (anchor) => anchor.remoteThreads.length > 0 && anchor.pendingDrafts.length === 0,
  );

  return {
    anchorsByFile,
    allAnchors,
    pendingAnchors,
    remoteAnchors,
  };
}

export function buildPullRequestAnchorAnnotations(args: {
  anchors: PullRequestReviewAnchor[];
  repoPath: string;
  pullRequestNumber: number;
  compareBaseRef: string;
  compareHeadRef: string;
  providerId?: GitProviderId;
}): DiffLineAnnotation<DiffAnnotationItem>[] {
  return args.anchors.map((anchor) => ({
    lineNumber: anchor.endLine,
    side: anchor.side,
    metadata: {
      type: "pull-request-anchor",
      anchor,
      repoPath: args.repoPath,
      pullRequestNumber: args.pullRequestNumber,
      compareBaseRef: args.compareBaseRef,
      compareHeadRef: args.compareHeadRef,
      providerId: args.providerId,
    },
  }));
}

export function pullRequestAnchorLabel(
  anchor: Pick<PullRequestReviewAnchor, "startLine" | "endLine">,
) {
  if (anchor.startLine === anchor.endLine) {
    return `L${String(anchor.endLine)}`;
  }

  return `L${String(anchor.startLine)}-${String(anchor.endLine)}`;
}
