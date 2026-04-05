import type {
  AppSettings as ContractAppSettings,
  Bucket as ContractBucket,
  DiffFile as ContractDiffFile,
  FileItem as ContractFileItem,
  FileStatus as ContractFileStatus,
  FileVersions as ContractFileVersions,
  GitSnapshot as ContractGitSnapshot,
  HistoryCommit as ContractHistoryCommit,
  LspDiagnostic as ContractLspDiagnostic,
  LspLocation as ContractLspLocation,
  RepoFileItem as ContractRepoFileItem,
  PullRequestReviewThread,
} from "@/platform/desktop";

export type Bucket = ContractBucket;

export type FileStatus = ContractFileStatus;

export type HistoryNavTarget = "commits" | "files";

export type DiffStyle = "split" | "unified";

export type FileBrowserMode = ContractAppSettings["sourceControl"]["fileTreeRenderMode"];

export type FileItem = ContractFileItem;

export type RepoFileItem = ContractRepoFileItem;

export type LspLocation = ContractLspLocation;

export type BucketedFile = FileItem & { bucket: Bucket };

export type SelectedFile = {
  bucket: Bucket;
  path: string;
};

export type FileViewerTarget = {
  repoPath: string;
  relPath: string;
  revision?: string | null;
  line?: number | null;
  column?: number | null;
  focusKey?: number | null;
};

export type SymbolPeekKind = "definitions" | "references";

export type SymbolPeekSourceDocument = {
  repoPath: string;
  relPath: string;
};

export type SymbolPeekAnchor = {
  lineNumber: number;
  lineIndex: string | null;
};

export type SymbolPeekState = {
  kind: SymbolPeekKind;
  locations: LspLocation[];
  activeIndex: number;
  query: string;
  sourceDocument: SymbolPeekSourceDocument;
  anchor: SymbolPeekAnchor;
};

export type ChangesSidebarMode = "changes" | "files" | "pull-request";

export type HistoryCommit = ContractHistoryCommit;

export type LspDiagnostic = ContractLspDiagnostic;

export type SelectionRange = {
  start: number;
  end: number;
  side?: "deletions" | "additions";
  endSide?: "deletions" | "additions";
};

export type CommentContext =
  | { kind: "changes" }
  | { kind: "review"; baseRef: string; headRef: string };

export type CommentItem = {
  type: "annotation";
  id: string;
  repoPath: string;
  filePath: string;
  bucket: Bucket;
  startLine: number;
  endLine: number;
  side: "deletions" | "additions";
  endSide?: "deletions" | "additions";
  text: string;
  contextKind?: CommentContext["kind"];
  baseRef?: string;
  headRef?: string;
};

export type ComposerAnnotation = {
  type: "composer";
  side: "deletions" | "additions";
  endSide?: "deletions" | "additions";
  startLine: number;
  endLine: number;
};

export type DiagnosticAnnotation = {
  type: "diagnostic";
  diagnostic: LspDiagnostic;
};

export type PullRequestThreadAnnotation = {
  type: "pull-request-thread";
  thread: PullRequestReviewThread;
  repoPath: string;
  pullRequestNumber: number;
};

export type DiffAnnotationItem =
  | CommentItem
  | ComposerAnnotation
  | DiagnosticAnnotation
  | PullRequestThreadAnnotation;

export type GitSnapshot = ContractGitSnapshot;

export type DiffFile = ContractDiffFile;

export type FileVersions = ContractFileVersions;

export type RunningAction =
  | ""
  | "stage-all"
  | "unstage-all"
  | "discard-changes"
  | "commit"
  | `file:stage:${string}`
  | `file:unstage:${string}`
  | `file:discard:${string}`;
