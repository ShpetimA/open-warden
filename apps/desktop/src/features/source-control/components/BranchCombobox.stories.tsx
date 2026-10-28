import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { BranchCombobox } from "./BranchCombobox";

const branches = [
  "main",
  "dev",
  "origin/feature/invoice-validation",
  "origin/release/mobile-migration-with-a-long-branch-name",
  ...Array.from({ length: 100 }, (_, index) => `origin/feature/task-${index}`),
];
const meta = {
  title: "Source control/Branch Combobox",
  component: BranchCombobox,
  args: { label: "Base", value: "main", options: branches, onChange: () => undefined },
} satisfies Meta<typeof BranchCombobox>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Searchable: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-44">
        <BranchCombobox {...args} value={value} onChange={setValue} />
      </div>
    );
  },
};
