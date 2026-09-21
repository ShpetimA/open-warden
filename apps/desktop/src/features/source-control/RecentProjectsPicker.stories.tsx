import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecentProjectsPicker } from "./RecentProjectsPicker";
const meta = {
  title: "Features/Projects/Open project",
  component: RecentProjectsPicker,
  args: {
    open: true,
    activeRepo: "/projects/open-warden",
    recentRepos: ["/projects/open-warden", "/projects/t3code", "/projects/marketplace"],
    onOpenChange: () => {},
    onSelectRepo: async () => true,
    onChooseFolder: () => {},
    browseDirectory: async () => ({
      ok: true,
      path: "/Users/demo/proj",
      parentPath: "/Users/demo",
      entries: ["open-warden", "t3code", "marketplace"].map((name) => ({
        name,
        path: `/Users/demo/proj/${name}`,
      })),
    }),
  },
} satisfies Meta<typeof RecentProjectsPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Interactive: Story = {};
export const Empty: Story = { args: { recentRepos: [] } };
export const FailedOpen: Story = { args: { onSelectRepo: async () => false } };
