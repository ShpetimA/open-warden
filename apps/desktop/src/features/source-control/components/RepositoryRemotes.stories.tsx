import type { Meta, StoryObj } from "@storybook/react-vite";

import { RepositoryConfigurationPanel } from "./RepositoryRemotes";

const meta = {
  title: "Source control/Remotes and upstream",
  component: RepositoryConfigurationPanel,
  parameters: { layout: "padded" },
  args: {
    configuration: {
      revision: "a".repeat(64),
      branch: "feature/invoice-export",
      upstream: "origin/feature/invoice-export",
      remoteBranches: ["origin/main", "origin/feature/invoice-export", "upstream/main"],
      remotes: [
        { name: "origin", fetchUrls: ["git@bitbucket.org:workspace/product.git"], pushUrls: [] },
        {
          name: "upstream",
          fetchUrls: ["https://github.com/organization/product.git"],
          pushUrls: [],
        },
      ],
    },
    busy: false,
    onRun: async () => true,
    onFetch: () => {},
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RepositoryConfigurationPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Configured: Story = {};

export const NoRemotes: Story = {
  args: {
    configuration: { ...meta.args.configuration, remotes: [], remoteBranches: [], upstream: null },
  },
};

export const FailedSave: Story = {
  args: {
    error: {
      code: "conflict",
      operation: "configureRepository",
      message: "Repository configuration changed. Refresh before saving.",
    },
  },
};
