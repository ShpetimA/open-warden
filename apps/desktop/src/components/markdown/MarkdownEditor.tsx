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
import { Markdown, highlightCode } from "@/components/markdown/Markdown";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Bold, Code, Heading, Italic, Link, List, ListOrdered, ListTodo, Quote } from "lucide-react";

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

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Leave a comment...",
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

  const insertMarkdown = useCallback(
    (before: string, after = "", placeholderText = "") => {
      const textarea = editorRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.slice(start, end);
      const text = selected || placeholderText;
      const nextValue = `${value.slice(0, start)}${before}${text}${after}${value.slice(end)}`;
      onChange(nextValue);
      requestAnimationFrame(() => {
        textarea.focus();
        const cursorStart = start + before.length;
        textarea.setSelectionRange(cursorStart, cursorStart + text.length);
      });
    },
    [value, onChange, editorRef],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (handleMentionKeyDown(event)) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod) {
        const shortcuts: Record<string, () => void> = {
          b: () => insertMarkdown("**", "**", "bold"),
          i: () => insertMarkdown("_", "_", "italic"),
          e: () => insertMarkdown("`", "`", "code"),
          k: () => insertMarkdown("[", "](url)", "text"),
          h: () => insertMarkdown("### ", "", "heading"),
        };
        const shiftShortcuts: Record<string, () => void> = {
          ".": () => insertMarkdown("> ", "", "quote"),
          "8": () => insertMarkdown("- ", "", "item"),
          "7": () => insertMarkdown("1. ", "", "item"),
        };

        const key = event.key.toLowerCase();
        const action = event.shiftKey ? shiftShortcuts[key] : shortcuts[key];

        if (action) {
          event.preventDefault();
          action();
          return;
        }
      }
      externalOnKeyDown?.(event);
    },
    [handleMentionKeyDown, insertMarkdown, externalOnKeyDown],
  );

  const handleChange = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
    },
    [onChange],
  );

  useEffect(() => {
    if (tab === "write" && mentionConfig) {
      detectMention();
    }
  }, [value, tab, mentionConfig, detectMention]);

  return (
    <div className="bg-surface-elevated border-border/70 overflow-hidden border">
      <div className="border-border/60 flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1 rounded-full bg-transparent p-1">
          <button
            type="button"
            onClick={() => setTab("write")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold tracking-[-0.01em] transition-colors",
              tab === "write"
                ? "bg-surface-alt"
                : "text-muted-foreground hover:bg-black/20 hover:text-foreground",
            )}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold tracking-[-0.01em] transition-colors",
              tab === "preview"
                ? "bg-surface-alt"
                : "text-muted-foreground hover:bg-black/20 hover:text-foreground",
            )}
          >
            Preview
          </button>
        </div>

        <TooltipProvider delayDuration={300}>
          <div
            className={cn(
              "text-muted-foreground flex items-center gap-0.5",
              tab !== "write" && "invisible",
            )}
          >
            <MdToolbarButton
              label="Heading"
              shortcut="⌘H"
              onClick={() => insertMarkdown("### ", "", "heading")}
            >
              <Heading />
            </MdToolbarButton>
            <MdToolbarButton
              label="Bold"
              shortcut="⌘B"
              onClick={() => insertMarkdown("**", "**", "bold")}
            >
              <Bold />
            </MdToolbarButton>
            <MdToolbarButton
              label="Italic"
              shortcut="⌘I"
              onClick={() => insertMarkdown("_", "_", "italic")}
            >
              <Italic />
            </MdToolbarButton>
            <span className="bg-border/70 mx-1.5 h-5 w-px" />
            <MdToolbarButton
              label="Code"
              shortcut="⌘E"
              onClick={() => insertMarkdown("`", "`", "code")}
            >
              <Code />
            </MdToolbarButton>
            <MdToolbarButton
              label="Link"
              shortcut="⌘K"
              onClick={() => insertMarkdown("[", "](url)", "text")}
            >
              <Link />
            </MdToolbarButton>
            <MdToolbarButton
              label="Quote"
              shortcut="⌘⇧."
              onClick={() => insertMarkdown("> ", "", "quote")}
            >
              <Quote />
            </MdToolbarButton>
            <span className="bg-border/70 mx-1.5 h-5 w-px" />
            <MdToolbarButton
              label="Unordered list"
              shortcut="⌘⇧8"
              onClick={() => insertMarkdown("- ", "", "item")}
            >
              <List />
            </MdToolbarButton>
            <MdToolbarButton
              label="Ordered list"
              shortcut="⌘⇧7"
              onClick={() => insertMarkdown("1. ", "", "item")}
            >
              <ListOrdered />
            </MdToolbarButton>
            <MdToolbarButton label="Task list" onClick={() => insertMarkdown("- [ ] ", "", "task")}>
              <ListTodo />
            </MdToolbarButton>
          </div>
        </TooltipProvider>
      </div>

      {tab === "write" ? (
        <div className="relative max-h-[14rem]">
          {compact ? (
            <textarea
              ref={editorRef}
              value={value}
              onChange={(event) => handleChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={2}
              className="placeholder:text-muted-foreground w-full resize-y bg-transparent px-5 py-5 font-mono text-[15px] leading-7 outline-none" />
          ) : (
            <HighlightedMarkdownEditor
              value={value}
              onChange={handleChange}
              placeholder={placeholder}
              textareaRef={editorRef}
              onKeyDown={handleKeyDown}
            />
          )}
          {mentionState && dropdownPos ? (
            <MentionDropdown
              candidates={filtered}
              activeIndex={activeIndex}
              isLoading={mentionLoading}
              position={dropdownPos}
              onSelect={selectCandidate}
              onDismiss={dismissMention}
            />
          ) : null}
        </div>
      ) : (
        <div className={cn("px-5 py-5", compact ? "min-h-[6.3rem]" : "min-h-[200px]")}>
          {value ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-muted-foreground text-sm italic">Nothing to preview</p>
          )}
        </div>
      )}
    </div>
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
      className="bg-surface-elevated border-border/70 fixed z-50 max-h-56 min-w-[240px] overflow-y-auto rounded-2xl border p-1 shadow-2xl"
      style={{ top: position.top, left: position.left }}
    >
      {isLoading && candidates.length === 0 ? (
        <div className="flex items-center justify-center px-3 py-2">
          <Spinner className="text-muted-foreground size-3.5" />
        </div>
      ) : null}
      {isEmpty ? <div className="text-muted-foreground px-3 py-2 text-xs">No users found</div> : null}
      {candidates.map((candidate, index) => (
        <button
          key={candidate.id}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(candidate);
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
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
        <button
          type="button"
          onClick={onClick}
          className="hover:bg-accent/70 hover:text-foreground flex size-8 items-center justify-center rounded-full transition-colors"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height={15}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 24 24"
            width={15}
          >
            {children}
          </svg>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex items-center gap-1.5">
          {label}
          {shortcut ? (
            <kbd className="bg-foreground/10 rounded-full px-1.5 py-0.5 font-mono text-[10px]">{shortcut}</kbd>
          ) : null}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function HighlightedMarkdownEditor({
  value,
  onChange,
  placeholder,
  textareaRef: externalRef,
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
}) {
  const [highlightedHtml, setHighlightedHtml] = useState("");
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setHighlightedHtml("");
      return;
    }
    void highlightCode(value, "markdown").then((html) => {
      if (!cancelled) {
        setHighlightedHtml(html);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const syncScroll = () => {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  return (
    <div className="relative">
      <div
        ref={highlightRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-auto p-5 whitespace-pre-wrap break-words [scrollbar-width:none] [word-break:break-all] [&::-webkit-scrollbar]:hidden [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!whitespace-pre-wrap [&_pre]:!break-words [&_pre]:font-mono [&_pre]:text-sm [&_pre]:!leading-[1.625] [&_code]:!font-mono [&_code]:!text-sm [&_code]:!leading-[1.625]"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: html from shiki highlighter is trusted
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        className="placeholder:text-muted-foreground caret-foreground relative h-full w-full resize-y bg-transparent p-5 font-mono text-sm leading-[1.625] whitespace-pre-wrap break-words text-transparent outline-none [word-break:break-all]"
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );
}
