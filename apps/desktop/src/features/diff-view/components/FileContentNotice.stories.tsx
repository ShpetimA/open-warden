import type { Meta, StoryObj } from "@storybook/react-vite";

import { FileContentNotice } from "./FileContentNotice";

const metadata = { kind: "binary" as const, name: "assets/company-logo.png", byteLength: 18_420 };

const meta = {
  title: "Diff/File content notice",
  component: FileContentNotice,
  parameters: { layout: "fullscreen" },
  args: {
    activePath: metadata.name,
    metadata,
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
    metadata: { kind: "too-large", name: "archive/export.zip", byteLength: 52_428_800 },
    oldFile: null,
    newFile: { kind: "too-large", name: "archive/export.zip", byteLength: 52_428_800 },
  },
};
