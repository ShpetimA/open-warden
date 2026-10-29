import type { ComponentProps, ReactNode } from "react";

import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type ToolbarActionProps = Omit<
  ComponentProps<typeof Button>,
  "variant" | "size" | "title" | "aria-label" | "disabled" | "children"
> & {
  label: string;
  description?: string;
  disabledReason?: string;
  children: ReactNode;
};

export function ToolbarAction({
  label,
  description,
  disabledReason,
  children,
  ...props
}: ToolbarActionProps) {
  const detail = disabledReason ?? description;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <Button
            {...props}
            variant="toolbar"
            size="icon-sm"
            aria-label={label}
            aria-description={detail}
            disabled={Boolean(disabledReason)}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="max-w-64 rounded-md text-left motion-reduce:animate-none"
      >
        <p className="font-medium">{label}</p>
        {detail ? <p className="text-muted-foreground mt-0.5 leading-relaxed">{detail}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}
