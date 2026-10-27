import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { SidebarPanelRegistryProvider } from "@/components/layout/SidebarPanelRegistry";
import type { GuidanceDocument } from "@/platform/desktop/guidance";
import { GuidanceView } from "./GuidanceView";
import { GuidanceExplanation } from "./GuidanceExplanation";

export const exampleGuidance: GuidanceDocument = {
  id: "guide-114",
  repoPath: "/projects/invoice",
  providerId: "github",
  owner: "team",
  repo: "invoice",
  pullRequestNumber: 114,
  headSha: "b7c9e40a1d",
  title: "Follow an invoice through validation",
  summary:
    "This change rejects invalid invoice amounts before they reach persistence. Review the request path first, then the regression tests.",
  steps: [
    {
      id: "validation",
      title: "Reject invalid amounts at the boundary",
      body: "The request handler now checks the amount before calling the repository.\n\nCheck that **zero remains valid**, and that a negative amount returns a useful validation error. The storage layer should never see invalid input.",
      references: [
        { path: "src/invoices/createInvoice.ts", side: "head", startLine: 18, endLine: 22 },
      ],
    },
    {
      id: "tests",
      title: "Verify the boundary cases",
      body: "The regression tests cover a negative amount and zero. Look for an assertion that persistence was not called for the rejected request.",
      references: [
        { path: "src/invoices/createInvoice.test.ts", side: "head", startLine: 32, endLine: 39 },
      ],
    },
    {
      id: "wrap-up",
      title: "Check the remaining risk",
      body: "The UI may still submit values with too many decimal places. Decide whether that belongs in this PR or a follow-up.",
      references: [],
    },
  ],
  selectedStepId: "validation",
  reviewedStepIds: [],
  messages: [
    {
      id: "question-1",
      role: "user",
      body: "Should this also reject amounts with more than two decimal places?",
      stepId: "validation",
      stepTitle: "Reject invalid amounts at the boundary",
      headSha: "b7c9e40a1d",
      createdAt: "2026-10-25T18:00:00Z",
    },
    {
      id: "reply-1",
      role: "agent",
      body: "That is a separate precision rule. This guard handles sign validation; add a decimal-precision case if the API contract requires it.",
      stepId: "validation",
      stepTitle: "Reject invalid amounts at the boundary",
      headSha: "b7c9e40a1d",
      createdAt: "2026-10-25T18:01:00Z",
    },
  ],
  acknowledgedMessageIds: ["question-1"],
  updatedAt: "2026-10-25T18:01:00Z",
};
const meta = {
  title: "Pull requests/Guidance",
  includeStories: [
    "Walkthrough",
    "MultipleFiles",
    "StaleRevision",
    "LongExplanations",
    "TextOnly",
    "AgentWorking",
    "LongConversation",
    "EmptyConversation",
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({
  stale = false,
  initialGuide = exampleGuidance,
  working = false,
}: {
  stale?: boolean;
  initialGuide?: GuidanceDocument;
  working?: boolean;
}) {
  const [guide, setGuide] = useState(initialGuide);
  return (
    <SidebarPanelRegistryProvider>
      <div className="h-screen">
        <GuidanceView
          guide={guide}
          activity={
            working
              ? {
                  repoPath: guide.repoPath,
                  pullRequestNumber: guide.pullRequestNumber,
                  id: "activity-1",
                  headSha: guide.headSha,
                  status: "working",
                  message: "Reading the export request and regression tests…",
                  updatedAt: guide.updatedAt,
                }
              : null
          }
          onClearMessages={async () => {
            setGuide((current) => ({ ...current, messages: [], acknowledgedMessageIds: [] }));
            return true;
          }}
          stale={stale}
          busy={false}
          error=""
          onSelectStep={(id) => setGuide((current) => ({ ...current, selectedStepId: id }))}
          onReviewed={(id, reviewed) =>
            setGuide((current) => ({
              ...current,
              reviewedStepIds: reviewed
                ? [...new Set([...current.reviewedStepIds, id])]
                : current.reviewedStepIds.filter((item) => item !== id),
            }))
          }
          onMessage={async (stepId, body) => {
            setGuide((current) => ({
              ...current,
              messages: [
                ...current.messages,
                {
                  id: `message-${current.messages.length}`,
                  role: "user",
                  body,
                  stepId,
                  stepTitle: current.steps.find((step) => step.id === stepId)?.title ?? null,
                  headSha: current.headSha,
                  createdAt: current.updatedAt,
                },
              ],
            }));
            return true;
          }}
          renderDiff={(reference, step) => (
            <div className="bg-surface h-full overflow-auto">
              <div className="border-border border-b px-4 py-3 font-mono text-xs">
                {reference.path}
              </div>
              {step.references
                .filter((item) => item.path === reference.path)
                .map((item) => (
                  <div key={`${item.side}:${item.startLine}:${item.endLine}`}>
                    <div className="px-3">
                      <GuidanceExplanation
                        title={step.title}
                        body={item.note ?? step.body}
                        referenceLabel={`L${item.startLine}–${item.endLine}`}
                      />
                    </div>
                    <pre className="bg-diff-addition-surface text-diff-addition border-diff-addition border-l-2 px-4 py-2 text-xs leading-6">{`${item.startLine}  if (input.amount < 0) {\n${item.startLine + 1}    return invalidAmount(input.amount);\n${item.startLine + 2}  }`}</pre>
                  </div>
                ))}
            </div>
          )}
        />
      </div>
    </SidebarPanelRegistryProvider>
  );
}
export const Walkthrough: Story = { render: () => <Example /> };
export const MultipleFiles: Story = {
  render: () => (
    <Example
      initialGuide={{
        ...exampleGuidance,
        steps: exampleGuidance.steps.map((step) =>
          step.id === "validation"
            ? {
                ...step,
                references: [
                  ...step.references,
                  {
                    path: "src/invoices/createInvoice.ts",
                    side: "head",
                    startLine: 30,
                    endLine: 35,
                    note: "Keep the successful request path intact after validation.",
                  },
                  {
                    path: "src/invoices/createInvoice.test.ts",
                    side: "head",
                    startLine: 32,
                    endLine: 39,
                    note: "Check both the rejected amount and the zero boundary.",
                  },
                ],
              }
            : step,
        ),
      }}
    />
  ),
};
export const StaleRevision: Story = { render: () => <Example stale /> };

export const LongExplanations: Story = {
  render: () => (
    <Example
      initialGuide={{
        ...exampleGuidance,
        steps: exampleGuidance.steps.map((step) => ({
          ...step,
          body: Array.from({ length: 12 }, () => step.body).join("\n\n"),
        })),
      }}
    />
  ),
};
export const TextOnly: Story = {
  render: () => <Example initialGuide={{ ...exampleGuidance, selectedStepId: "wrap-up" }} />,
};

export const AgentWorking: Story = { render: () => <Example working /> };

export const LongConversation: Story = {
  render: () => (
    <Example
      initialGuide={{
        ...exampleGuidance,
        messages: exampleGuidance.messages.map((message) => ({
          ...message,
          stepTitle:
            "Preserve incoming behavior and mobile layout while reviewing export contracts and boundary conditions",
          body: Array.from(
            { length: 8 },
            () => `${message.body}\n\n- Verify the API contract.\n- Check the zero boundary.`,
          ).join("\n\n"),
        })),
      }}
    />
  ),
};
export const EmptyConversation: Story = {
  render: () => (
    <Example initialGuide={{ ...exampleGuidance, messages: [], acknowledgedMessageIds: [] }} />
  ),
};
