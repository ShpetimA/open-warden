import { useState } from "react";
import { Copy, MessageSquare, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ExpandableMarkdown } from "@/components/markdown/ExpandableMarkdown";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { GuidanceDocument, GuidanceStep } from "@/platform/desktop/guidance";

type Props = {
  guide: GuidanceDocument;
  step: GuidanceStep;
  open: boolean;
  onOpenChange(open: boolean): void;
  onMessage(stepId: string, body: string): Promise<boolean>;
  onClear(): Promise<boolean>;
};

export function GuidanceConversation({
  guide,
  step,
  open,
  onOpenChange,
  onMessage,
  onClear,
}: Props) {
  const [draft, setDraft] = useState({ stepId: step.id, title: step.title, body: "" });
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const waiting = guide.messages.filter(
    (message) => message.role === "user" && !guide.acknowledgedMessageIds.includes(message.id),
  ).length;

  function changeOpen(next: boolean) {
    if (next && !draft.body.trim()) setDraft({ stepId: step.id, title: step.title, body: "" });
    onOpenChange(next);
  }

  async function send() {
    if (!draft.body.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await onMessage(draft.stepId, draft.body.trim());
      if (saved) setDraft({ stepId: step.id, title: step.title, body: "" });
      else setError("Your message could not be saved. Try again.");
    } catch {
      setError("Your message could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setClearing(true);
    setError("");
    try {
      if (!(await onClear())) setError("Messages could not be cleared. Try again.");
    } catch {
      setError("Messages could not be cleared. Try again.");
    } finally {
      setClearing(false);
    }
  }

  async function copy() {
    const text = guide.messages
      .map(
        (message) =>
          `**${message.role === "user" ? "You" : "Agent"}${message.stepTitle ? ` · ${message.stepTitle}` : ""}**\n\n${message.body}`,
      )
      .join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied guidance conversation");
    } catch {
      setError("The conversation could not be copied. Try again.");
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="bg-surface-elevated absolute bottom-3 left-3 size-10 rounded-full shadow-md"
                aria-label="Ask guidance agent"
              >
                <MessageSquare className="size-4" />
                {waiting > 0 ? (
                  <span className="bg-primary text-primary-foreground absolute -right-1 -top-1 min-w-4 rounded-full px-1 text-[10px] leading-4 tabular-nums">
                    {waiting}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Ask guidance agent</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        aria-label="Guidance conversation"
        className="flex max-h-[min(640px,calc(100dvh-100px))] w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden p-0 font-sans"
      >
        <header className="flex min-h-10 shrink-0 items-center gap-1 px-3">
          <h2 className="flex-1 text-xs font-semibold">Guidance conversation</h2>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Copy guidance conversation"
            disabled={!guide.messages.length}
            onClick={() => void copy()}
          >
            <Copy />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Clear guidance conversation"
            disabled={!guide.messages.length || clearing || saving}
            onClick={() => void clear()}
          >
            {clearing ? <Spinner /> : <Trash2 />}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Close guidance conversation"
            onClick={() => onOpenChange(false)}
          >
            <X />
          </Button>
        </header>
        <div
          className="border-border min-h-0 overflow-y-auto border-t empty:hidden"
          aria-label="Saved guidance messages"
        >
          {guide.messages.map((message) => (
            <article
              key={message.id}
              className="border-border space-y-1 border-b px-3 py-2.5 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-2 text-[11px]">
                <span className="shrink-0 font-semibold">
                  {message.role === "user" ? "You" : "Agent"}
                </span>
                <span
                  className="text-muted-foreground truncate"
                  title={message.stepTitle ?? undefined}
                >
                  {message.stepTitle}
                </span>
              </div>
              <ExpandableMarkdown previewHeight={120}>{message.body}</ExpandableMarkdown>
              {message.headSha !== guide.headSha ? (
                <p className="text-muted-foreground text-[11px]">Earlier revision</p>
              ) : message.role === "user" ? (
                <p className="text-muted-foreground text-[11px]">
                  {guide.acknowledgedMessageIds.includes(message.id)
                    ? "Read by agent"
                    : "Waiting for agent"}
                </p>
              ) : null}
            </article>
          ))}
        </div>
        <form
          className="border-border shrink-0 space-y-2 border-t p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div>
            <label htmlFor="guidance-message" className="text-xs font-medium">
              Ask about this step
            </label>
            <p className="text-muted-foreground mt-0.5 truncate text-[11px]" title={draft.title}>
              {draft.title}
            </p>
          </div>
          <Textarea
            id="guidance-message"
            value={draft.body}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            placeholder="What would you like explained?"
            maxLength={20000}
            className="min-h-20 max-h-40 resize-y text-[13px]"
            disabled={saving}
          />
          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-[11px]">
              Ask your agent to check messages
            </span>
            <Button type="submit" size="xs" disabled={saving || clearing || !draft.body.trim()}>
              {saving ? <Spinner /> : <Send />}Save message
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
