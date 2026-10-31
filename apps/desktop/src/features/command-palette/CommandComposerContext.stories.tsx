import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { CommandComposerContext } from "./CommandComposerContext";
import { CommandComposerChoiceStep, type ComposerChoice } from "./CommandComposerChoiceStep";

import "./ChangeCommandComposer.css";

const branchChoices: ComposerChoice[] = [
  { id: "new", label: "Create branch", detail: "From HEAD", icon: Plus, section: "Actions" },
  ...[
    "auth",
    "base-uo",
    "cleanup-backup/2026-10-29/boi/customer-subscriptions",
    "feature/invoices",
  ].map(
    (name): ComposerChoice => ({
      id: name,
      label: name,
      labelFormat: "path",
      detail: "",
      section: "Local branches",
    }),
  ),
  { id: "origin/dev", label: "origin/dev", detail: "", section: "Remote branches" },
];

function BranchPicker({ initialQuery = "" }: { initialQuery?: string }) {
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [highlighted, setHighlighted] = useState("auth");
  const choices = branchChoices.filter((choice) => choice.label.includes(query));

  return (
    <div className="change-composer">
      <CommandComposerContext
        pane="choice"
        actionLabel="Branches"
        operandLabel="Branch"
        operandValue=""
        steps={[
          {
            id: "scope",
            label: "Scope",
            value: "Branches",
            active: false,
            onPress: () => setQuery(""),
          },
          { id: "branch", label: "Branch", value: "", active: true, onPress: () => {} },
        ]}
        onActionPress={() => {}}
        onOperandPress={() => {}}
      />
      <div className="change-composer-panel">
        <div className="change-composer-panel-heading">
          <p className="change-composer-panel-title">Choose branch</p>
          <span className="text-muted-foreground flex-1 text-xs">open-warden</span>
        </div>
        <CommandComposerChoiceStep
          pane="choice"
          operandLabel="Branch"
          choiceSearchLabel="branches"
          choices={choices}
          matchingCount={choices.length}
          query={query}
          activeChoiceId={highlighted}
          busy={false}
          searchRef={search}
          onQueryChange={setQuery}
          onHighlight={setHighlighted}
          onSelect={setHighlighted}
        />
        <div className="change-composer-footer">
          <span>
            <Kbd>↑↓</Kbd> Choose
          </span>
          <span>
            <Kbd>↵</Kbd> Select
          </span>
          <span>
            <Kbd>⌫</Kbd> Back
          </span>
          <span>
            <Kbd>Esc</Kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Quick actions/Compact layout",
  component: BranchPicker,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BranchPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Branches: Story = {};
export const NoMatches: Story = { args: { initialQuery: "no-matching-branch" } };
