import type { Meta, StoryObj } from "@storybook/react-vite";

import { FileContentNotice } from "./FileContentNotice";

const metadata = { kind: "binary" as const, name: "assets/company-logo.png", byteLength: 18_420 };

const meta = {
  title: "Diff/File content notice",
  component: FileContentNotice,
  parameters: { layout: "fullscreen" },
  args: {
    activePath: metadata.name,
    notice: { metadata },
    oldFile: { ...metadata, byteLength: 15_308 },
    newFile: metadata,
    mode: "comparison",
  },
  decorators: [
    (Story) => (
      <div className="h-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FileContentNotice>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Modified: Story = {};

export const Added: Story = { args: { oldFile: null } };

export const Deleted: Story = { args: { newFile: null } };

export const Renamed: Story = {
  args: { oldFile: { ...metadata, name: "assets/logo.png" } },
};

export const ConvertedToText: Story = {
  args: {
    activePath: "data/settings.txt",
    newFile: { name: "data/settings.txt", contents: "region=EU\n" },
  },
};

export const LargeFile: Story = {
  args: {
    activePath: "archive/export.zip",
    notice: { metadata: { kind: "too-large", name: "archive/export.zip", byteLength: 52_428_800 } },
    oldFile: null,
    newFile: { kind: "too-large", name: "archive/export.zip", byteLength: 52_428_800 },
  },
};

export const SymbolicLink: Story = {
  args: {
    activePath: "config/active.json",
    notice: {
      metadata: { kind: "symlink", name: "config/active.json", target: "../settings/staging.json" },
    },
    oldFile: {
      kind: "symlink",
      name: "config/active.json",
      target: "../settings/development.json",
    },
    newFile: { kind: "symlink", name: "config/active.json", target: "../settings/staging.json" },
  },
};

export const Submodule: Story = {
  args: {
    activePath: "vendor/shared-library",
    notice: {
      metadata: { kind: "submodule", name: "vendor/shared-library", commitId: "b".repeat(40) },
    },
    oldFile: { kind: "submodule", name: "vendor/shared-library", commitId: "a".repeat(40) },
    newFile: {
      kind: "submodule",
      name: "vendor/shared-library",
      commitId: "b".repeat(40),
      workingTree: { state: "checked-out", trackedChanges: true, untrackedChanges: true },
    },
  },
};

export const UninitializedSubmodule: Story = {
  args: {
    ...Submodule.args,
    newFile: {
      kind: "submodule",
      name: "vendor/shared-library",
      commitId: "a".repeat(40),
      workingTree: { state: "uninitialized" },
    },
  },
};

export const Permissions: Story = {
  args: {
    activePath: "scripts/deploy.sh",
    notice: { modeChange: { before: "100644", after: "100755" } },
    oldFile: { name: "scripts/deploy.sh", contents: "echo deploy\n" },
    newFile: { name: "scripts/deploy.sh", contents: "echo deploy\n" },
  },
};
