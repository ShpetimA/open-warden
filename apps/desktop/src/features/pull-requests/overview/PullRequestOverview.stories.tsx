import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { PullRequestReviewButton } from "@/features/pull-requests/components/PullRequestReviewControl";

import { PullRequestHeaderActions } from "./PullRequestHeaderActions";
import { PullRequestMergeBox } from "./PullRequestMergeBox";
import { PullRequestOverviewHeader } from "./PullRequestOverviewHeader";
import { PullRequestOverviewLayout } from "./PullRequestOverviewLayout";
import { PullRequestReviewerList } from "./PullRequestReviewerList";
import { PullRequestTimeline, TimelineComment } from "./PullRequestTimeline";
import type { PersonView, PullRequestOverviewView, TimelineEntry } from "./types";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const shpetim: PersonView = { login: "shpetim_alimi", name: "Shpetim Alimi", avatarUrl: null };
const betim: PersonView = { login: "betim", name: "Betim Prevalla", avatarUrl: null };
const ngadhnjim: PersonView = { login: "ngadhnjim", name: "Ngadhnjim Istrefi", avatarUrl: null };
const autoReview: PersonView = {
  login: "auto-review",
  name: "Auto Review",
  avatarUrl: null,
  isBot: true,
};

const screenshot =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300"><rect width="640" height="300" fill="#f4f5f7"/><rect x="24" y="24" width="592" height="40" rx="6" fill="#dfe3ea"/><rect x="24" y="84" width="380" height="16" rx="4" fill="#c9cfd9"/><rect x="24" y="112" width="300" height="16" rx="4" fill="#c9cfd9"/><rect x="24" y="160" width="592" height="116" rx="8" fill="#fff" stroke="#dfe3ea"/><text x="44" y="226" font-family="sans-serif" font-size="20" fill="#334">Invoice total: €64.85</text></svg>`,
  );

const body = `## Summary

Scanned receipts mix number formats: lines use \`54,958\` while the total is \`64.85 EUR\`. We parsed everything with the invariant culture, so a €64.85 receipt was saved as €64,850.44.

## Changes Made

- **Parsing:** each OCR amount is parsed on its own.
- **Ambiguous readings:** we use the reading where subtotal + tax = total (within 0.05).
- **Review issues:** a new \`OcrReview\` on invoices created by OCR.

| Code | Meaning |
| --- | --- |
| \`amounts_reinterpreted\` | Scanned was read as Value instead of Alternative |
| \`amounts_unreconciled\` | Subtotal + tax never matches the total |

![Invoice preview](${screenshot})

![Invoice preview after the fix](${screenshot})`;

const pullRequest: PullRequestOverviewView = {
  number: 111,
  title: "Fix OCR amounts read as thousands and expose OCR review issues",
  body,
  state: "open",
  repository: "ndbusinessit/invoice-service",
  baseRef: "development",
  headRef: "fix/ocr-amount-parsing",
  author: shpetim,
  createdAt: minutesAgo(60 * 24 * 7),
  updatedAt: minutesAgo(25),
  reviewers: [
    { ...betim, id: "betim", state: "approved", reviewedAt: minutesAgo(90) },
    { ...ngadhnjim, id: "ngadhnjim", state: "approved", reviewedAt: minutesAgo(40) },
  ],
  requiredApprovals: 2,
  checks: [
    {
      id: "build",
      name: "Build",
      description: "dotnet build",
      state: "passed",
      url: "https://example.com",
    },
    {
      id: "tests",
      name: "Unit tests",
      description: "412 passed",
      state: "passed",
      url: "https://example.com",
    },
    {
      id: "lint",
      name: "Analyzers",
      description: "2 warnings",
      state: "failed",
      url: "https://example.com",
    },
  ],
  mergeability: "mergeable",
  commentCount: 3,
  unresolvedThreadCount: 1,
  changedFiles: 13,
  additions: 5533,
  deletions: 23,
  labels: [],
};

const timeline: TimelineEntry[] = [
  {
    kind: "commit",
    id: "c1",
    author: shpetim,
    createdAt: minutesAgo(60 * 24 * 7 - 1),
    sha: "0659e74c1a",
    message: "Parse OCR amounts per value",
  },
  {
    kind: "commit",
    id: "c2",
    author: shpetim,
    createdAt: minutesAgo(60 * 24 * 7 - 2),
    sha: "1b2c3d4e5f",
    message: "Pick the reading where subtotal + tax = total",
  },
  {
    kind: "commit",
    id: "c3",
    author: shpetim,
    createdAt: minutesAgo(60 * 24 * 7 - 3),
    sha: "2c3d4e5f6a",
    message: "Store OcrReview on documents",
  },
  ...Array.from(
    { length: 7 },
    (_, index): TimelineEntry => ({
      kind: "event",
      id: `u${index}`,
      actor: shpetim,
      createdAt: minutesAgo(60 * 24 * 2 - index * 60),
      event: "edited",
      detail: null,
    }),
  ),
  {
    kind: "review",
    id: "r1",
    author: betim,
    createdAt: minutesAgo(90),
    state: "approved",
    body: "",
  },
  {
    kind: "custom",
    id: "t1",
    createdAt: minutesAgo(80),
    node: (
      <TimelineComment
        author={ngadhnjim}
        createdAt={minutesAgo(80)}
        body="Parenthesized negative amounts like `(12,50)` are read as positive here."
        badge={
          <span className="text-muted-foreground font-mono text-[11px]">
            src/InvoiceService.Infrastructure/Services/OcrAmountParser.cs:32
          </span>
        }
      />
    ),
  },
  {
    kind: "comment",
    id: "k1",
    author: shpetim,
    createdAt: minutesAgo(45),
    body: "/review",
    url: null,
  },
  {
    kind: "comment",
    id: "k2",
    author: autoReview,
    createdAt: minutesAgo(44),
    body: "Starting AI code review.",
    url: null,
  },
  {
    kind: "review",
    id: "r2",
    author: ngadhnjim,
    createdAt: minutesAgo(40),
    state: "approved",
    body: "Looks good once the negative amounts case is covered.",
  },
  {
    kind: "commit",
    id: "c4",
    author: shpetim,
    createdAt: minutesAgo(30),
    sha: "e3db95df11",
    message: "Merge remote-tracking branch 'origin/development' into fix/ocr-amount-parsing",
  },
  {
    kind: "comment",
    id: "k3",
    author: autoReview,
    createdAt: minutesAgo(25),
    body: `**1 issue** (1 risk)\n\n- \`src/InvoiceService.Infrastructure/Services/OcrAmountParser.cs:32\` — Parenthesized negative amounts read as positive.\n\n${"The parser strips parentheses before reading the number, so a credit line on a receipt becomes a charge. Consider detecting a leading `(` and trailing `)` and negating the parsed value. ".repeat(3)}`,
    url: null,
  },
];

function OverviewPreview({ pullRequest }: { pullRequest: PullRequestOverviewView }) {
  const [checksOpen, setChecksOpen] = useState(false);
  return (
    <TooltipProvider>
      <div className="h-screen">
        <PullRequestOverviewLayout
          header={
            <PullRequestOverviewHeader
              pullRequest={pullRequest}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <PullRequestReviewButton
                    disabledReason={
                      pullRequest.state !== "open"
                        ? "Only open pull requests ready for review can be reviewed"
                        : undefined
                    }
                    onReview={() => {}}
                  />
                  <PullRequestHeaderActions
                    lifecycleActions={["edit", "draft", "update-branch", "close"]}
                    opening={null}
                    refreshing={false}
                    onAction={() => {}}
                    onLifecycle={() => {}}
                  />
                </div>
              }
              onBack={() => {}}
              onCopyBranch={() => {}}
              onOpenFiles={() => {}}
              onOpenChecks={() => setChecksOpen(true)}
            />
          }
          aside={
            <PullRequestMergeBox
              pullRequest={pullRequest}
              checksOpen={checksOpen}
              onChecksOpenChange={setChecksOpen}
              canAutoMerge
              onMerge={() => {}}
              onAutoMerge={() => {}}
              reviewers={
                <PullRequestReviewerList
                  reviewers={pullRequest.reviewers}
                  candidates={[{ id: "shpetim_alimi", label: "Shpetim Alimi" }]}
                  onAdd={async () => true}
                  onRerequest={() => {}}
                  onRemove={() => {}}
                />
              }
            />
          }
        >
          <PullRequestTimeline
            description={{
              author: pullRequest.author,
              createdAt: pullRequest.createdAt,
              body: pullRequest.body,
            }}
            entries={timeline}
            viewer={shpetim}
            onOpenCommit={() => {}}
            onSubmitComment={async () => true}
          />
        </PullRequestOverviewLayout>
      </div>
    </TooltipProvider>
  );
}

const meta = {
  title: "Design system/Compositions/Pull Request Overview",
  component: OverviewPreview,
  parameters: { layout: "fullscreen", a11y: { test: "todo" } },
  args: { pullRequest },
} satisfies Meta<typeof OverviewPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const ChangesRequestedWithConflicts: Story = {
  args: {
    pullRequest: {
      ...pullRequest,
      reviewers: [
        { ...betim, id: "betim", state: "changes-requested", reviewedAt: minutesAgo(90) },
        { ...ngadhnjim, id: "ngadhnjim", state: "requested", reviewedAt: null },
      ],
      mergeability: "conflicting",
      labels: ["ocr", "needs-tests"],
    },
  },
};

export const Merged: Story = {
  args: { pullRequest: { ...pullRequest, state: "merged" } },
};
