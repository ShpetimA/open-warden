import { cn } from "@/lib/utils";

function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="panel"
      className={cn(
        "bg-surface text-foreground flex min-h-0 flex-col overflow-hidden rounded-xl shadow-[var(--elevation-surface)]",
        className,
      )}
      {...props}
    />
  );
}

function PanelHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="panel-header"
      className={cn(
        "border-border/70 flex min-h-10 shrink-0 items-center gap-3 border-b px-3 py-1.5",
        className,
      )}
      {...props}
    />
  );
}

function PanelHeading({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="panel-heading" className={cn("min-w-0 flex-1", className)} {...props} />;
}

function PanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="panel-title"
      className={cn("truncate text-sm font-semibold tracking-[-0.006em]", className)}
      {...props}
    />
  );
}

function PanelDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="panel-description"
      className={cn("text-muted-foreground mt-0.5 truncate text-xs text-pretty", className)}
      {...props}
    />
  );
}

function PanelActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-actions"
      className={cn("ml-auto flex shrink-0 items-center gap-1", className)}
      {...props}
    />
  );
}

function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="panel-body" className={cn("min-h-0 flex-1", className)} {...props} />;
}

function PanelFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return (
    <footer
      data-slot="panel-footer"
      className={cn(
        "border-border/70 flex min-h-10 shrink-0 items-center gap-2 border-t px-3 py-1.5",
        className,
      )}
      {...props}
    />
  );
}

export {
  Panel,
  PanelActions,
  PanelBody,
  PanelDescription,
  PanelFooter,
  PanelHeader,
  PanelHeading,
  PanelTitle,
};
