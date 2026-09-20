import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-border/70 bg-surface-alt px-3 py-1 text-base shadow-xs transition-[border-color,box-shadow,color] outline-none selection:bg-primary selection:text-primary-foreground hover:border-border file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:border-input/40 dark:bg-input/20 dark:hover:border-input/50 dark:shadow-none",
        "focus-visible:border-ring/70 focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:hover:border-ring/70",
        "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
