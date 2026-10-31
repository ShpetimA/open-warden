import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        info: "bg-info-surface text-foreground ring-1 ring-inset ring-info-border",
        success: "bg-success-surface text-foreground ring-1 ring-inset ring-success-border",
        warning: "bg-warning-surface text-foreground ring-1 ring-inset ring-warning-border",
        danger: "bg-destructive-surface text-foreground ring-1 ring-inset ring-destructive-border",
      },
      size: {
        sm: "h-4 px-1.5 text-[10px]",
        md: "h-5 px-2 text-[11px]",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "md",
    },
  },
);

const statusDotVariants = cva("size-1.5 shrink-0 rounded-full", {
  variants: {
    tone: {
      neutral: "bg-muted-foreground",
      info: "bg-info",
      success: "bg-success",
      warning: "bg-warning",
      danger: "bg-destructive",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

type StatusBadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof statusBadgeVariants> & {
    showDot?: boolean;
  };

function StatusBadge({
  className,
  tone = "neutral",
  size = "md",
  showDot = true,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      data-size={size}
      className={cn(statusBadgeVariants({ tone, size }), className)}
      {...props}
    >
      {showDot ? <span aria-hidden="true" className={statusDotVariants({ tone })} /> : null}
      {children}
    </span>
  );
}

export { StatusBadge };
