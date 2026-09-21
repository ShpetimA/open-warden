import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Plus, X } from "lucide-react";
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type WorkspaceTabItem = Readonly<{
  id: string;
  label: string;
  context?: string;
  icon: ReactNode;
  status?: ReactNode;
  closable?: boolean;
}>;

type WorkspaceAddItem = Readonly<{
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
}>;

type WorkspaceTabsProps = Readonly<{
  items: readonly WorkspaceTabItem[];
  activeId: string;
  ariaLabel?: string;
  addLabel?: string;
  className?: string;
  onActivate: (id: string) => void;
  onClose?: (id: string) => void;
  onAdd?: () => void;
  addItems?: readonly WorkspaceAddItem[];
  onAddSelect?: (id: string) => void;
}>;

function focusWorkspaceTab(
  event: KeyboardEvent<HTMLButtonElement>,
  item: WorkspaceTabItem,
  onActivate: (id: string) => void,
) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

  const tabList = event.currentTarget.closest('[data-workspace-tab-list="true"]');
  const tabs = Array.from(
    tabList?.querySelectorAll<HTMLButtonElement>("[data-workspace-tab-id]") ?? [],
  );
  const currentIndex = tabs.indexOf(event.currentTarget);
  if (currentIndex < 0) return;

  const targetIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
  const target = tabs[targetIndex];
  if (!target) return;

  event.preventDefault();
  target.focus();
  const targetId = target.dataset.workspaceTabId;
  if (targetId && targetId !== item.id) onActivate(targetId);
}

function WorkspaceTabs({
  items,
  activeId,
  ariaLabel = "Open workspaces",
  addLabel = "Open project (⌘O)",
  className,
  onActivate,
  onClose,
  onAdd,
  addItems,
  onAddSelect,
}: WorkspaceTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    const active = listRef.current?.querySelector<HTMLButtonElement>('[aria-current="page"]');
    active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    if (restoreFocus.current) {
      (active ?? addRef.current)?.focus();
      restoreFocus.current = false;
    }
  }, [activeId, items.length]);
  return (
    <div
      data-slot="workspace-tabs"
      className={cn(
        "border-border/70 bg-surface-toolbar flex h-8 min-w-0 items-center border-b",
        className,
      )}
    >
      <div
        ref={listRef}
        role="navigation"
        aria-label={ariaLabel}
        data-workspace-tab-list="true"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overflow-y-hidden px-1 py-0.5"
      >
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <div
              data-active={active || undefined}
              className={cn(
                "app-no-drag group/tab flex min-w-0 shrink-0 items-center rounded-md pl-2 transition-[background-color,color,box-shadow,--tw-ring-color] duration-150 ease-out motion-reduce:transition-none",
                active
                  ? "bg-surface-active text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              key={item.id}
            >
              <button
                type="button"
                aria-label={item.context ? `${item.label}, ${item.context}` : item.label}
                title={item.context ? `${item.label} · ${item.context}` : item.label}
                aria-current={active ? "page" : undefined}
                data-workspace-tab-id={item.id}
                tabIndex={active ? 0 : -1}
                className={cn(
                  "flex h-7 min-w-0 max-w-56 items-center gap-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm",
                  item.closable === false || !onClose ? "pr-2" : "pr-0.5",
                )}
                onClick={() => onActivate(item.id)}
                onKeyDown={(event) => focusWorkspaceTab(event, item, onActivate)}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 [&>svg]:size-3",
                    active ? "text-primary" : "text-foreground/55",
                  )}
                >
                  {item.icon}
                </span>
                <span className="block truncate text-xs font-medium">{item.label}</span>
                {item.context ? <span className="sr-only">{` · ${item.context}`}</span> : null}
                {item.status && !onClose ? (
                  <span className="ml-auto shrink-0 pl-1">{item.status}</span>
                ) : null}
              </button>
              {item.status && onClose ? (
                <span className="shrink-0 pl-1 pr-1.5">{item.status}</span>
              ) : null}
              {item.closable !== false && onClose ? (
                <button
                  type="button"
                  aria-label={`Close ${item.label}`}
                  tabIndex={active ? 0 : -1}
                  title={`Close ${item.label} (⌘W)`}
                  className={cn(
                    "text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-md transition-[background-color,color,opacity] motion-reduce:transition-none group-hover/tab:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring/60",
                    active ? "opacity-100" : "opacity-0",
                  )}
                  onClick={() => {
                    restoreFocus.current = true;
                    onClose(item.id);
                  }}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {items.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="All open workspaces"
            title="All open workspaces"
            className="app-no-drag size-7 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto max-w-96">
            {items.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => onActivate(item.id)}>
                <span aria-hidden="true">{item.icon}</span>
                <span className="truncate">{item.label}</span>
                {item.id === activeId ? (
                  <span className="ml-auto" aria-label="Active">
                    ✓
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {addItems && addItems.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={addLabel}
            className="app-no-drag focus-visible:ring-ring/60 ml-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-[background-color,color] hover:bg-accent hover:text-foreground focus-visible:ring-1 data-[state=open]:bg-accent data-[state=open]:text-foreground"
          >
            <Plus className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {addItems.map((addItem) => (
              <DropdownMenuItem key={addItem.id} onSelect={() => onAddSelect?.(addItem.id)}>
                {addItem.icon ? (
                  <span aria-hidden="true" className="[&>svg]:size-3.5">
                    {addItem.icon}
                  </span>
                ) : null}
                {addItem.label}
                {addItem.shortcut ? (
                  <span className="text-muted-foreground ml-auto pl-6 font-mono text-[10px] tracking-[0.08em]">
                    {addItem.shortcut}
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : onAdd ? (
        <button
          type="button"
          aria-label={addLabel}
          className="app-no-drag text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/60 ml-0.5 flex size-7 shrink-0 items-center justify-center rounded-md outline-none transition-[background-color,color] focus-visible:ring-1"
          ref={addRef}
          title={addLabel}
          onClick={onAdd}
        >
          <Plus className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export { WorkspaceTabs };
export type { WorkspaceAddItem, WorkspaceTabItem, WorkspaceTabsProps };
