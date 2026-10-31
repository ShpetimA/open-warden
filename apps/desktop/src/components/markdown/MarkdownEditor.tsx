import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from "react";

import { getCaretCoordinates } from "@/components/markdown/get-caret-coordinates";
import { Markdown } from "@/components/markdown/Markdown";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Bold,
  Code,
  Heading,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  MoreHorizontal,
} from "lucide-react";

export type MentionCandidate = {
  id: string;
  label: string;
  avatarUrl?: string;
  secondary?: string;
};

export type MentionConfig = {
  candidates: MentionCandidate[];
  onActivate?: () => void;
  isLoading?: boolean;
};

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  compact?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  mentions?: MentionConfig;
};

type MentionState = {
  query: string;
  triggerIndex: number;
} | null;

function useMentions(
  editorRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (value: string) => void,
  config?: MentionConfig,
) {
  const [mentionState, setMentionState] = useState<MentionState>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const activatedRef = useRef(false);

  const filtered = useMemo(() => {
    if (!mentionState || !config) return [];
    const q = mentionState.query.toLowerCase();
    return config.candidates.filter((candidate) => candidate.label.toLowerCase().includes(q));
  }, [mentionState, config]);

  const detectMention = useCallback(() => {
    const textarea = editorRef.current;
    if (!textarea || !config) return;

    const cursor = textarea.selectionStart;
    const text = value.slice(0, cursor);

    let triggerIdx = -1;
    for (let index = text.length - 1; index >= 0; index -= 1) {
      const ch = text[index];
      if (ch === "@") {
        if (index === 0 || /\s/.test(text[index - 1])) {
          triggerIdx = index;
        }
        break;
      }
      if (/\s/.test(ch)) break;
    }

    if (triggerIdx === -1) {
      setMentionState(null);
      return;
    }

    const query = text.slice(triggerIdx + 1);
    setMentionState({ query, triggerIndex: triggerIdx });
    setActiveIndex(0);

    if (!activatedRef.current) {
      activatedRef.current = true;
      config.onActivate?.();
    }

    const coords = getCaretCoordinates(textarea, cursor);
    const rect = textarea.getBoundingClientRect();
    setDropdownPos({
      top: rect.top + coords.top + 20,
      left: rect.left + coords.left,
    });
  }, [editorRef, value, config]);

  const selectCandidate = useCallback(
    (candidate: MentionCandidate) => {
      if (!mentionState) return;
      const textarea = editorRef.current;
      if (!textarea) return;

      const before = value.slice(0, mentionState.triggerIndex);
      const after = value.slice(mentionState.triggerIndex + 1 + mentionState.query.length);
      const insertion = `@${candidate.label} `;
      const nextValue = before + insertion + after;
      onChange(nextValue);

      const cursorPos = mentionState.triggerIndex + insertion.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });

      setMentionState(null);
    },
    [mentionState, value, onChange, editorRef],
  );

  const handleMentionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!mentionState || filtered.length === 0) return false;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((index) => (index + 1) % filtered.length);
          return true;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((index) => (index <= 0 ? filtered.length - 1 : index - 1));
          return true;
        case "Enter":
        case "Tab":
          event.preventDefault();
          selectCandidate(filtered[activeIndex]);
          return true;
        case "Escape":
          event.preventDefault();
          setMentionState(null);
          return true;
        default:
          return false;
      }
    },
    [mentionState, filtered, activeIndex, selectCandidate],
  );

  const dismiss = useCallback(() => setMentionState(null), []);

  return {
    mentionState,
    filtered,
    activeIndex,
    dropdownPos,
    isLoading: config?.isLoading ?? false,
    detectMention,
    handleMentionKeyDown,
    selectCandidate,
    dismiss,
  };
}

const formatting = {
  bold: {
    label: "Bold",
    before: "**",
    after: "**",
    placeholder: "bold",
    shortcut: "⌘B",
    icon: Bold,
  },
  italic: {
    label: "Italic",
    before: "_",
    after: "_",
    placeholder: "italic",
    shortcut: "⌘I",
    icon: Italic,
  },
  code: {
    label: "Code",
    before: "`",
    after: "`",
    placeholder: "code",
    shortcut: "⌘E",
    icon: Code,
  },
  link: {
    label: "Link",
    before: "[",
    after: "](url)",
    placeholder: "text",
    shortcut: "⌘K",
    icon: Link,
  },
  heading: {
    label: "Heading",
    before: "### ",
    after: "",
    placeholder: "heading",
    shortcut: "⌘H",
    icon: Heading,
  },
  quote: {
    label: "Quote",
    before: "> ",
    after: "",
    placeholder: "quote",
    shortcut: "⌘⇧.",
    icon: Quote,
  },
  unordered: {
    label: "Unordered list",
    before: "- ",
    after: "",
    placeholder: "item",
    shortcut: "⌘⇧8",
    icon: List,
  },
  ordered: {
    label: "Ordered list",
    before: "1. ",
    after: "",
    placeholder: "item",
    shortcut: "⌘⇧7",
    icon: ListOrdered,
  },
  task: {
    label: "Task list",
    before: "- [ ] ",
    after: "",
    placeholder: "task",
    shortcut: "",
    icon: ListTodo,
  },
} as const;

const commonFormatting = ["bold", "italic", "code", "link"] as const;
const moreFormatting = ["heading", "quote", "unordered", "ordered", "task"] as const;

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Leave a comment...",
  label = "Comment",
  compact,
  onKeyDown: externalOnKeyDown,
  textareaRef: externalRef,
  mentions: mentionConfig,
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = externalRef || internalRef;

  const {
    mentionState,
    filtered,
    activeIndex,
    dropdownPos,
    isLoading: mentionLoading,
    detectMention,
    handleMentionKeyDown,
    selectCandidate,
    dismiss: dismissMention,
  } = useMentions(editorRef, value, onChange, mentionConfig);

  function applyFormatting(key: keyof typeof formatting) {
    const textarea = editorRef.current;

    if (!textarea) return;

    const action = formatting[key];
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const text = selected || action.placeholder;
    const nextValue = `${value.slice(0, start)}${action.before}${text}${action.after}${value.slice(end)}`;

    onChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();

      const cursorStart = start + action.before.length;
      textarea.setSelectionRange(cursorStart, cursorStart + text.length);
    });
  }

  const hotkeyOptions = { target: editorRef, ignoreInputs: false, enabled: tab === "write" };

  useHotkey("Mod+B", () => applyFormatting("bold"), hotkeyOptions);
  useHotkey("Mod+I", () => applyFormatting("italic"), hotkeyOptions);
  useHotkey("Mod+E", () => applyFormatting("code"), hotkeyOptions);
  useHotkey("Mod+K", () => applyFormatting("link"), hotkeyOptions);
  useHotkey("Mod+H", () => applyFormatting("heading"), hotkeyOptions);
  useHotkey({ key: ">", mod: true, shift: true }, () => applyFormatting("quote"), hotkeyOptions);
  useHotkey("Mod+Shift+8", () => applyFormatting("unordered"), hotkeyOptions);
  useHotkey("Mod+Shift+7", () => applyFormatting("ordered"), hotkeyOptions);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (handleMentionKeyDown(event)) return;

    externalOnKeyDown?.(event);
  }

  useEffect(() => {
    if (tab === "write" && mentionConfig) {
      detectMention();
    }
  }, [value, tab, mentionConfig, detectMention]);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (value === "write" || value === "preview") setTab(value);
      }}
      className="bg-background border-border/70 focus-within:border-ring/70 overflow-hidden rounded-md border"
    >
      <div className="border-border/70 bg-surface-toolbar flex flex-wrap items-center justify-between gap-1 border-b px-2 py-1">
        <TabsList aria-label="Comment editor" className="p-0">
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        {tab === "write" ? (
          <TooltipProvider delayDuration={450} skipDelayDuration={300} disableHoverableContent>
            <div
              role="group"
              aria-label="Markdown formatting"
              className="text-muted-foreground ml-auto flex items-center gap-0.5"
            >
              {commonFormatting.map((key) => {
                const action = formatting[key];
                const Icon = action.icon;

                return (
                  <MdToolbarButton
                    key={key}
                    label={action.label}
                    shortcut={action.shortcut}
                    onClick={() => applyFormatting(key)}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                  </MdToolbarButton>
                );
              })}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="More formatting"
                    title="More formatting"
                  >
                    <MoreHorizontal className="size-3.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {moreFormatting.map((key) => {
                    const action = formatting[key];
                    const Icon = action.icon;

                    return (
                      <DropdownMenuItem key={key} onSelect={() => applyFormatting(key)}>
                        <Icon aria-hidden="true" />
                        {action.label}
                        {action.shortcut ? (
                          <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut>
                        ) : null}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </TooltipProvider>
        ) : null}
      </div>
      <TabsContent value="write" className="relative">
        <Textarea
          ref={editorRef}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={compact ? 2 : 4}
          className={cn(
            "max-h-56 resize-y rounded-none border-0 bg-transparent px-3 py-2 font-sans text-sm leading-5 shadow-none focus-visible:ring-0 dark:bg-transparent",
            compact ? "min-h-16" : "min-h-24",
          )}
        />
        {tab === "write" && mentionState && dropdownPos ? (
          <MentionDropdown
            candidates={filtered}
            activeIndex={activeIndex}
            isLoading={mentionLoading}
            position={dropdownPos}
            onSelect={selectCandidate}
            onDismiss={dismissMention}
          />
        ) : null}
      </TabsContent>
      <TabsContent
        value="preview"
        className={cn("max-h-56 overflow-auto px-3 py-2", compact ? "min-h-16" : "min-h-24")}
      >
        {value ? (
          <Markdown>{value}</Markdown>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing to preview yet.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}

function MentionDropdown({
  candidates,
  activeIndex,
  isLoading,
  position,
  onSelect,
  onDismiss,
}: {
  candidates: MentionCandidate[];
  activeIndex: number;
  isLoading: boolean;
  position: { top: number; left: number };
  onSelect: (candidate: MentionCandidate) => void;
  onDismiss: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(event.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onDismiss]);

  const isEmpty = candidates.length === 0 && !isLoading;

  return createPortal(
    <div
      ref={listRef}
      role="group"
      aria-label="Mention suggestions"
      className="bg-surface-elevated border-border/70 fixed z-50 max-h-56 min-w-[240px] overflow-y-auto rounded-md border p-1 shadow-md"
      style={{ top: position.top, left: position.left }}
    >
      {isLoading && candidates.length === 0 ? (
        <div className="flex items-center justify-center px-3 py-2">
          <Spinner className="text-muted-foreground size-3.5" />
        </div>
      ) : null}
      {isEmpty ? (
        <div className="text-muted-foreground px-3 py-2 text-xs">No users found</div>
      ) : null}
      {candidates.map((candidate, index) => (
        <button
          key={candidate.id}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(candidate);
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors",
            index === activeIndex
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          {candidate.avatarUrl ? (
            <img src={candidate.avatarUrl} alt={candidate.label} className="size-4 rounded-full" />
          ) : (
            <div className="bg-muted size-4 rounded-full" />
          )}
          <span className="truncate">{candidate.label}</span>
          {candidate.secondary ? (
            <span className="text-muted-foreground ml-auto shrink-0 text-xs">
              {candidate.secondary}
            </span>
          ) : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}

function MdToolbarButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex items-center gap-1.5">
          {label}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
