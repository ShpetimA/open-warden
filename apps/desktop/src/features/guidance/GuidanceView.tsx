import { useEffect, useRef, useState, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, Send } from "lucide-react";

import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { ExpandableMarkdown } from "@/components/markdown/ExpandableMarkdown";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ReviewNote } from "@/components/ui/review-note";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { PierreFileTreeBrowser } from "@/features/source-control/components/PierreFileTreeBrowser";
import {
  SOURCE_CONTROL_HOTKEY_OPTIONS,
  useVerticalNavigationHotkeys,
} from "@/features/source-control/hooks/keyboardNavigation";
import {
  movePierreFileTreeFocusByFile,
  movePierreFileTreeFocusFile,
} from "@/features/source-control/pierreFileTreeNavigation";
import { isTypingTarget } from "@/features/source-control/utils";
import { cn } from "@/lib/utils";
import type {
  GuidanceDocument,
  GuidanceReference,
  GuidanceStep,
} from "@/platform/desktop/guidance";
import { GuidanceExplanation } from "./GuidanceExplanation";

type Props = {
  guide: GuidanceDocument;
  stale: boolean;
  busy: boolean;
  error: string;
  onSelectStep(stepId: string): void;
  onReviewed(stepId: string, reviewed: boolean): void;
  onMessage(stepId: string, body: string): Promise<boolean>;
  renderDiff(reference: GuidanceReference, step: GuidanceStep): ReactNode;
};

export function GuidanceView({
  guide,
  stale,
  busy,
  error,
  onSelectStep,
  onReviewed,
  onMessage,
  renderDiff,
}: Props) {
  const [selection, setSelection] = useState<{ stepId: string; index: number } | null>(null);
  const step = guide.steps.find((item) => item.id === guide.selectedStepId) ?? guide.steps[0];
  if (!step) return null;

  const referenceIndex = selection?.stepId === step.id ? selection.index : 0;
  const reference = step.references[referenceIndex] ?? step.references[0];
  const stepIndex = guide.steps.findIndex((item) => item.id === step.id);
  const previous = guide.steps[stepIndex - 1];
  const next = guide.steps[stepIndex + 1];
  const reviewed = guide.reviewedStepIds.includes(step.id);
  const selectReference = (index: number) => setSelection({ stepId: step.id, index });

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="border-border bg-surface-toolbar flex min-h-10 shrink-0 items-center gap-3 border-b px-3 py-1">
        <BookOpen className="text-muted-foreground size-3.5 shrink-0" />
        <h1 className="min-w-0 flex-1 truncate text-xs font-medium">{guide.title}</h1>
        <p className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
          {guide.reviewedStepIds.length} of {guide.steps.length} reviewed ·{" "}
          {guide.headSha.slice(0, 8)}
        </p>
        <div className="flex shrink-0 gap-1">
          <Button
            size="xs"
            variant="ghost"
            disabled={!previous || busy}
            onClick={() => {
              if (previous) onSelectStep(previous.id);
            }}
          >
            <ArrowLeft />
            Previous
            <Kbd aria-hidden="true" className="h-4 px-1 text-[10px]">
              h
            </Kbd>
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={!next || busy}
            onClick={() => {
              if (next) onSelectStep(next.id);
            }}
          >
            Next
            <Kbd aria-hidden="true" className="h-4 px-1 text-[10px]">
              l
            </Kbd>
            <ArrowRight />
          </Button>
        </div>
      </header>
      {stale ? (
        <p
          role="status"
          className="border-warning-border bg-warning-surface border-b px-3 py-2 text-xs"
        >
          New commits are available. Ask your agent to refresh this walkthrough before reviewing
          more steps.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive border-b px-3 py-2 text-xs">
          {error}
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        <ResizableSidebarLayout
          panelId="primary"
          sidebarDefaultSize={24}
          sidebarMinSize="220px"
          sidebarMaxSize={40}
          sidebar={
            <GuidanceSidebar
              guide={guide}
              step={step}
              stepIndex={stepIndex}
              reference={reference}
              busy={busy}
              onSelectStep={onSelectStep}
              onSelectReference={selectReference}
              onMessage={onMessage}
            />
          }
          content={
            <main
              className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
              aria-label="Referenced changes"
            >
              <div className="border-border bg-surface-toolbar flex min-h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  Step {stepIndex + 1} of {guide.steps.length}
                </span>
                <Button
                  size="xs"
                  variant={reviewed ? "secondary" : "outline"}
                  disabled={stale || busy}
                  onClick={() => onReviewed(step.id, !reviewed)}
                >
                  <Check />
                  {reviewed ? "Reviewed — mark unreviewed" : "Mark step reviewed"}
                </Button>
              </div>
              {stale || !reference ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <GuidanceExplanation key={step.id} title={step.title} body={step.body} />
                  <p className="text-muted-foreground mt-2 text-xs">
                    {stale
                      ? "Refresh this walkthrough to view references against the latest PR."
                      : "No file is attached to this step."}
                  </p>
                </div>
              ) : (
                renderDiff(reference, step)
              )}
            </main>
          }
        />
      </div>
    </div>
  );
}

type SidebarTab = "steps" | "files" | "messages";
type GuidanceSidebarProps = Pick<Props, "guide" | "busy" | "onSelectStep" | "onMessage"> & {
  step: GuidanceStep;
  stepIndex: number;
  reference: GuidanceReference | undefined;
  onSelectReference(index: number): void;
};

function GuidanceSidebar({
  guide,
  step,
  stepIndex,
  reference,
  busy,
  onSelectStep,
  onSelectReference,
  onMessage,
}: GuidanceSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>("steps");

  function navigateStep(event: KeyboardEvent, next: boolean) {
    if (busy || isTypingTarget(event.target)) return;
    const adjacent = guide.steps[stepIndex + (next ? 1 : -1)];
    if (!adjacent) return;
    event.preventDefault();
    onSelectStep(adjacent.id);
  }

  function navigate(event: KeyboardEvent, next: boolean) {
    if (tab === "steps") {
      navigateStep(event, next);
      return;
    }
    if (tab !== "files" || isTypingTarget(event.target)) return;
    const byFile = event.key.toLowerCase() === "j" || event.key.toLowerCase() === "k";
    const file = byFile
      ? movePierreFileTreeFocusByFile("guidance-files", next)
      : movePierreFileTreeFocusFile("guidance-files", next);
    if (!file) return;
    const index = step.references.findIndex((item) => item.path === (file.realPath ?? file.path));
    if (index < 0) return;
    event.preventDefault();
    onSelectReference(index);
  }

  useVerticalNavigationHotkeys({
    onNext: (event) => navigate(event, true),
    onPrevious: (event) => navigate(event, false),
  });
  useHotkey("H", (event) => navigateStep(event, false), SOURCE_CONTROL_HOTKEY_OPTIONS);
  useHotkey("L", (event) => navigateStep(event, true), SOURCE_CONTROL_HOTKEY_OPTIONS);

  return (
    <aside
      aria-label="Guided review"
      className="bg-surface-toolbar flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "steps" || value === "files" || value === "messages") setTab(value);
        }}
        className="h-full min-h-0"
      >
        <div className="border-border flex h-9 shrink-0 items-center border-b px-2">
          <TabsList aria-label="Guidance navigation" className="p-0">
            <TabsTrigger value="steps">Steps</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="messages">
              Messages
              {guide.messages.length ? (
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {guide.messages.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="steps">
          <div className="flex h-full min-h-0 flex-col">
            <details className="border-border shrink-0 border-b px-3 py-2">
              <summary className="text-muted-foreground cursor-pointer text-xs">
                About this walkthrough
              </summary>
              <div className="pt-2">
                <ExpandableMarkdown previewHeight={120}>{guide.summary}</ExpandableMarkdown>
              </div>
            </details>
            <GuidanceSteps
              guide={guide}
              step={step}
              busy={busy}
              active={tab === "steps"}
              onSelectStep={onSelectStep}
            />
          </div>
        </TabsContent>
        <TabsContent value="files">
          <GuidanceFiles step={step} reference={reference} onSelectReference={onSelectReference} />
        </TabsContent>
        <TabsContent value="messages">
          <div className="h-full min-h-0 overflow-y-auto p-3">
            <p className="text-muted-foreground mb-3 text-xs leading-5">
              Saved for your agent. Ask it to check Open Warden for messages.
            </p>
            <GuidanceMessages guide={guide} />
            <div className="mt-3 border-t pt-3">
              <MessageComposer key={step.id} onSend={(body) => onMessage(step.id, body)} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function GuidanceSteps({
  guide,
  step,
  busy,
  active,
  onSelectStep,
}: Pick<Props, "guide" | "busy" | "onSelectStep"> & { step: GuidanceStep; active: boolean }) {
  const navigationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (active)
      navigationRef.current
        ?.querySelector<HTMLElement>('[aria-current="step"]')
        ?.scrollIntoView?.({ block: "nearest" });
  }, [step.id, active]);

  return (
    <nav
      ref={navigationRef}
      aria-label="Walkthrough steps"
      className="min-h-0 flex-1 overflow-y-auto"
    >
      {guide.steps.map((item, index) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === step.id ? "step" : undefined}
          disabled={busy}
          onClick={() => onSelectStep(item.id)}
          className={cn(
            "hover:bg-accent flex min-h-10 w-full items-start gap-2 border-l-2 border-transparent px-2 py-1.5 text-left",
            item.id === step.id && "border-primary bg-surface-active",
          )}
        >
          <span className="text-muted-foreground flex size-5 shrink-0 items-center justify-center text-[11px] tabular-nums">
            {guide.reviewedStepIds.includes(item.id) ? (
              <CheckCircle2 className="text-success size-3.5" aria-label="Reviewed" />
            ) : (
              index + 1
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{item.title}</span>
            <span className="text-muted-foreground mt-0.5 block text-[11px] tabular-nums">
              {item.references.length} code range{item.references.length === 1 ? "" : "s"}
            </span>
          </span>
        </button>
      ))}
    </nav>
  );
}

function GuidanceFiles({
  step,
  reference,
  onSelectReference,
}: {
  step: GuidanceStep;
  reference: GuidanceReference | undefined;
  onSelectReference(index: number): void;
}) {
  const files = [...new Set(step.references.map((item) => item.path))].map((path) => ({ path }));
  const selectPath = (path: string) => {
    const index = step.references.findIndex((item) => item.path === path);
    if (index >= 0) onSelectReference(index);
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden"
      aria-label="Files for this step"
    >
      <div className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-xs font-semibold">
          Files for this step{" "}
          <span className="text-muted-foreground tabular-nums">({files.length})</span>
        </h2>
        <span className="text-muted-foreground text-xs">
          <Kbd>j</Kbd> / <Kbd>k</Kbd>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {files.length ? (
          <PierreFileTreeBrowser
            files={files}
            className="h-full"
            selectedPath={reference?.path ?? ""}
            navRegion="guidance-files"
            onActivatePath={selectPath}
          />
        ) : (
          <p className="text-muted-foreground p-3 text-xs">No files attached.</p>
        )}
      </div>
      {reference ? (
        <div
          className="border-border flex shrink-0 flex-wrap gap-1 border-t p-2"
          aria-label="Code ranges"
        >
          {step.references.map((item, index) =>
            item.path === reference.path ? (
              <Button
                key={`${item.side}:${item.startLine}:${item.endLine}`}
                variant={item === reference ? "secondary" : "ghost"}
                className="h-8 px-2 text-xs tabular-nums"
                aria-pressed={item === reference}
                onClick={() => onSelectReference(index)}
              >
                {item.side === "head" ? "Head" : "Base"} · Lines {item.startLine}–{item.endLine}
              </Button>
            ) : null,
          )}
        </div>
      ) : null}
    </section>
  );
}

function GuidanceMessages({ guide }: { guide: GuidanceDocument }) {
  return (
    <section aria-label="Guidance messages" className="space-y-2">
      {guide.messages.length === 0 ? (
        <p className="text-muted-foreground text-xs">No messages yet.</p>
      ) : null}
      {guide.messages.map((message, index) => {
        const author = message.role === "user" ? "You" : "Agent";
        const title = message.stepTitle ? `${author} · ${message.stepTitle}` : author;
        let status: string | undefined;
        if (message.headSha !== guide.headSha) {
          status = "Earlier revision";
        } else if (message.role === "user") {
          status = guide.acknowledgedMessageIds.includes(message.id)
            ? "Read by agent"
            : "Waiting for agent";
        }

        return (
          <ReviewNote
            key={message.id}
            label={`${message.role === "user" ? "Your" : "Agent"} message`}
            title={title}
            body={message.body}
            defaultCollapsed={index < guide.messages.length - 1}
            metadata={status}
          />
        );
      })}
    </section>
  );
}

function MessageComposer({ onSend }: { onSend(body: string): Promise<boolean> }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    if (!body.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      if (await onSend(body.trim())) setBody("");
      else setError("Your message could not be saved. Try again.");
    } catch {
      setError("Your message could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <label htmlFor="guidance-message" className="text-xs font-medium">
        Ask or leave a note
      </label>
      <Textarea
        id="guidance-message"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="What would you like the agent to explain?"
        maxLength={20000}
        className="min-h-20 text-[13px]"
        disabled={saving}
      />
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" className="w-full" disabled={saving || !body.trim()}>
        {saving ? <Spinner aria-hidden="true" /> : <Send />}Save message for agent
      </Button>
    </form>
  );
}
