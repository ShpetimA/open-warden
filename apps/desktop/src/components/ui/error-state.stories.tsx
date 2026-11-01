import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ActionError, ErrorNotice, ErrorState } from "./error-state";
import { desktopFailure } from "@/platform/desktop/failure";
import { Button } from "./button";

const meta = {
  title: "Design system/Components/Error recovery",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const network = desktopFailure(
  "listPullRequests",
  "network",
  "Couldn’t reach Bitbucket. Check your connection and try again.",
);

function RetryExample() {
  const [busy, setBusy] = useState(false);
  const [recovered, setRecovered] = useState(false);
  return (
    <div className="w-[min(400px,100%)]">
      {recovered ? (
        <p className="p-3 text-sm">Pull requests are up to date.</p>
      ) : (
        <ErrorState
          title="Couldn’t load pull requests"
          error={network}
          busy={busy}
          recovery={{ label: "Retry", onAction: () => setBusy(true) }}
        />
      )}
      {busy ? (
        <Button
          className="ml-3"
          size="xs"
          onClick={() => {
            setBusy(false);
            setRecovered(true);
          }}
        >
          Simulate successful reply
        </Button>
      ) : null}
    </div>
  );
}
export const InitialFailure: Story = { render: () => <RetryExample /> };
export const RetainedContent: Story = {
  render: () => (
    <div className="w-[min(400px,100%)]">
      <ErrorNotice
        title="Couldn’t refresh commits"
        error={network}
        recovery={{ label: "Retry", onAction: () => {} }}
      />
      <p className="p-3 text-sm">Existing commits stay visible here.</p>
    </div>
  ),
};
export const SubmissionFailure: Story = {
  render: () => (
    <div className="max-w-md p-3">
      <ActionError
        title="Git operation failed"
        error={desktopFailure(
          "runGitCommand",
          "conflict",
          "Git found conflicts. Resolve them in Changes before continuing.",
        )}
        recovery={{ label: "Open Changes", onAction: () => {} }}
      />
    </div>
  ),
};
export const Reconnect: Story = {
  render: () => (
    <ErrorState
      title="Couldn’t load pull requests"
      error={desktopFailure(
        "listPullRequests",
        "authentication",
        "Your Bitbucket connection needs attention.",
      )}
      recovery={{ label: "Reconnect Bitbucket", onAction: () => {} }}
    />
  ),
};
export const Retrying: Story = {
  render: () => (
    <ErrorState
      title="Couldn’t load History"
      error={network}
      busy
      recovery={{ label: "Retry", onAction: () => {} }}
    />
  ),
};

function HookFailureExample({ busy = false }) {
  const [visible, setVisible] = useState(true);

  return (
    <div className="max-w-2xl p-3">
      {visible ? (
        <ActionError
          title="Couldn’t push commits"
          error={{
            ...desktopFailure(
              "runGitCommand",
              "git-failed",
              "Git couldn’t complete this operation. Refresh the repository to check its state.",
            ),
            git: {
              exitCode: 1,
              output:
                "pre-push: validation failed\nGit lock test exceeded 5000ms\nThe push was stopped before updating the remote.",
            },
          }}
          busy={busy}
          recovery={{ label: "Refresh status", onAction: () => setVisible(false) }}
          onDismiss={() => setVisible(false)}
        />
      ) : (
        <p className="text-sm">Repository status refreshed.</p>
      )}
    </div>
  );
}

export const HookFailure: Story = { render: () => <HookFailureExample /> };
export const RefreshingAfterHookFailure: Story = { render: () => <HookFailureExample busy /> };
