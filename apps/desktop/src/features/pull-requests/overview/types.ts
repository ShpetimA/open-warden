import type { ReactNode } from "react";

import type { PullRequestActivityEvent } from "@/platform/desktop";

export type PersonView = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  isBot?: boolean;
};

export type PullRequestStateView = "open" | "draft" | "merged" | "closed";

export type ReviewerView = PersonView & {
  /** What the provider addresses this reviewer by when adding or removing them. */
  id: string;
  state: "approved" | "changes-requested" | "commented" | "requested";
  reviewedAt: string | null;
};

export type CheckView = {
  id: string;
  name: string;
  description: string | null;
  state: "passed" | "failed" | "pending";
  url: string | null;
};

export type MergeabilityView = "mergeable" | "conflicting" | "unknown";

export type PullRequestOverviewView = {
  number: number;
  title: string;
  body: string;
  state: PullRequestStateView;
  repository: string;
  baseRef: string;
  headRef: string;
  author: PersonView;
  createdAt: string;
  updatedAt: string;
  reviewers: ReviewerView[] | null;
  requiredApprovals: number | null;
  checks: CheckView[] | null;
  mergeability: MergeabilityView;
  commentCount: number;
  unresolvedThreadCount: number;
  fileStats: { changedFiles: number; additions: number; deletions: number } | null;
  labels: string[];
};

export type TimelineEventKind = Exclude<
  PullRequestActivityEvent,
  "approved" | "changes-requested" | "reviewed"
>;

export type TimelineEntry =
  | {
      kind: "comment";
      id: string;
      author: PersonView;
      createdAt: string;
      body: string;
      url: string | null;
      footer?: ReactNode;
    }
  | {
      kind: "review";
      id: string;
      author: PersonView;
      createdAt: string;
      state: "approved" | "changes-requested" | "reviewed";
      body: string;
    }
  | {
      kind: "commit";
      id: string;
      author: PersonView | null;
      createdAt: string;
      sha: string;
      message: string;
    }
  | {
      kind: "event";
      id: string;
      actor: PersonView | null;
      createdAt: string;
      event: TimelineEventKind;
      detail: string | null;
    }
  | {
      /** Anything the timeline only positions, such as an inline review thread with its code. */
      kind: "custom";
      id: string;
      createdAt: string;
      node: ReactNode;
    };

/** What the timeline renders once repeated pushes and provider updates are folded together. */
export type TimelineItem =
  | Exclude<TimelineEntry, { kind: "commit" | "event" }>
  | {
      kind: "commits";
      id: string;
      author: PersonView | null;
      createdAt: string;
      commits: Array<Extract<TimelineEntry, { kind: "commit" }>>;
    }
  | (Extract<TimelineEntry, { kind: "event" }> & { count: number; lastAt: string });
