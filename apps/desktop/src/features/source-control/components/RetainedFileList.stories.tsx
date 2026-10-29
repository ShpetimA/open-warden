import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { FileList } from "./FileList";
import { RetainedFileList } from "./RetainedFileList";

const files = [
  { path: "apps/web/src/invoices/InvoiceList.tsx" },
  { path: "apps/web/src/invoices/InvoiceRow.tsx" },
  { path: "apps/web/src/invoices/selection.ts" },
  { path: "apps/web/src/invoices/selection.test.ts" },
  { path: "packages/definitions/documents.ts" },
];

function Example({ state }: { state: "loaded" | "loading" | "refreshing" | "failed" }) {
  const [selected, setSelected] = useState(files[0]?.path ?? "");
  return (
    <div className="bg-surface-toolbar flex h-[360px] w-[320px] max-w-full flex-col border">
      <RetainedFileList
        hasData={state !== "loading"}
        fetching={state === "loading" || state === "refreshing"}
        error={
          state === "failed"
            ? {
                operation: "getGitSnapshot",
                code: "busy",
                message: "The repository is temporarily busy. Showing the last successful update.",
              }
            : undefined
        }
        loadingLabel="Loading changes…"
        errorTitle="Couldn’t load changes"
        onRetry={() => {}}
      >
        <FileList
          files={files}
          mode="tree"
          selection={selected}
          navRegion="retained-story"
          onActivatePath={setSelected}
          autoFocus={false}
        />
      </RetainedFileList>
    </div>
  );
}

const meta = { title: "Source control/Retained file list" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = { render: () => <Example state="loaded" /> };
export const InitialLoading: Story = { render: () => <Example state="loading" /> };
export const BackgroundRefresh: Story = { render: () => <Example state="refreshing" /> };
export const RefreshFailed: Story = { render: () => <Example state="failed" /> };
