import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

const meta = { title: "Design system/Components/Tooltip" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Placement: Story = {
  render: () => (
    <TooltipProvider delayDuration={450} skipDelayDuration={300}>
      <div className="flex gap-3 p-16">
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <Tooltip key={side}>
            <TooltipTrigger asChild>
              <Button variant="outline">{side}</Button>
            </TooltipTrigger>
            <TooltipContent side={side}>
              <p className="font-medium">Fetch remote changes</p>
              <p className="text-muted-foreground">Choose a remote to fetch from</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  ),
};
