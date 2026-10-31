import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-border/70 bg-surface-alt placeholder:text-muted-foreground/80 aria-invalid:border-destructive dark:border-input/40 dark:bg-input/20 aria-invalid:ring-[3px] dark:aria-invalid:ring-destructive/30 flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-base shadow-xs transition-[border-color,box-shadow,color] outline-none hover:border-border dark:hover:border-input/50 focus-visible:border-ring/70 focus-visible:ring-[3px] focus-visible:ring-ring/20 dark:shadow-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
