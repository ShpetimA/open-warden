import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inlineNoticeVariants = cva(
  "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-xl px-3 py-2.5 text-sm ring-1 ring-inset [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-surface-alt text-foreground ring-border [&>svg]:text-muted-foreground",
        info: "bg-info-surface text-foreground ring-info-border [&>svg]:text-info",
        success: "bg-success-surface text-foreground ring-success-border [&>svg]:text-success",
        warning: "bg-warning-surface text-foreground ring-warning-border [&>svg]:text-warning",
        danger:
          "bg-destructive-surface text-foreground ring-destructive-border [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

type InlineNoticeProps = React.ComponentProps<"div"> & VariantProps<typeof inlineNoticeVariants>;

function InlineNotice({ className, tone = "neutral", ...props }: InlineNoticeProps) {
  return (
    <div
      data-slot="inline-notice"
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
      className={cn(inlineNoticeVariants({ tone }), className)}
      {...props}
    />
  );
}

function InlineNoticeContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="inline-notice-content" className={cn("min-w-0", className)} {...props} />;
}

function InlineNoticeTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="inline-notice-title" className={cn("font-medium", className)} {...props} />
  );
}

function InlineNoticeDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="inline-notice-description"
      className={cn("text-foreground/70 mt-0.5 text-xs leading-5 text-pretty", className)}
      {...props}
    />
  );
}

function InlineNoticeAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="inline-notice-action" className={cn("self-center", className)} {...props} />
  );
}

export {
  InlineNotice,
  InlineNoticeAction,
  InlineNoticeContent,
  InlineNoticeDescription,
  InlineNoticeTitle,
};
