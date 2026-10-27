import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Check, CheckCircle2 } from "lucide-react";

import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { ExpandableMarkdown } from "@/components/markdown/ExpandableMarkdown";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { PierreFileTreeBrowser } from "@/features/source-control/components/PierreFileTreeBrowser";
import { cn } from "@/lib/utils";
import type {
  GuidanceActivity,
  GuidanceDocument,
  GuidanceReference,
  GuidanceStep,
} from "@/platform/desktop/guidance";
import { GuidanceExplanation } from "./GuidanceExplanation";
import { GuidanceConversation } from "./GuidanceConversation";
import { GuidanceActivityStatus } from "./GuidanceActivityStatus";
import { useGuidancePaneNavigation } from "./useGuidancePaneNavigation";

type Props = {
  guide: GuidanceDocument;
  activity?: GuidanceActivity | null;
  stale: boolean;
  busy: boolean;
  error: string;
  onSelectStep(stepId: string): void;
  onReviewed(stepId: string, reviewed: boolean): void;
  onMessage(stepId: string, body: string): Promise<boolean>;
  onClearMessages(): Promise<boolean>;
  renderDiff(reference: GuidanceReference, step: GuidanceStep): ReactNode;
};

export function GuidanceView({
  guide,
  activity = null,
  stale,
  busy,
  error,
  onSelectStep,
  onReviewed,
  onMessage,
  onClearMessages,
  renderDiff,
}: Props) {
  const [selection, setSelection] = useState<{ stepId: string; index: number } | null>(null);
  const [conversationOpen, setConversationOpen] = useState(false);
  const step = guide.steps.find((item) => item.id === guide.selectedStepId) ?? guide.steps[0];
  const referenceIndex = selection?.stepId === step?.id ? (selection?.index ?? 0) : 0;
  const reference = step?.references[referenceIndex] ?? step?.references[0];
  const selectReference = (index: number) => {
    if (step) setSelection({ stepId: step.id, index });
  };
  const target = useGuidancePaneNavigation({
    steps: guide.steps,
    step,
    reference,
    busy,
    blocked: conversationOpen,
    onSelectStep,
    onSelectReference: selectReference,
  });
  if (!step) return null;

  const stepIndex = guide.steps.findIndex((item) => item.id === step.id);
  const reviewed = guide.reviewedStepIds.includes(step.id);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="border-border bg-surface-toolbar flex min-h-10 shrink-0 items-center gap-3 border-b px-3 py-1">
        <BookOpen className="text-muted-foreground size-3.5 shrink-0" />
        <h1 className="min-w-0 flex-1 truncate text-xs font-medium">{guide.title}</h1>
        <GuidanceActivityStatus activity={activity} />
        <p className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
          {guide.reviewedStepIds.length} of {guide.steps.length} reviewed ·{" "}
          {guide.headSha.slice(0, 8)}
        </p>
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
          sidebarDefaultSize={22}
          sidebarMinSize="200px"
          sidebarMaxSize={36}
          sidebar={
            <GuidanceSidebar
              guide={guide}
              step={step}
              onActivate={() => {
                target.current = "steps";
              }}
              busy={busy}
              onSelectStep={onSelectStep}
            />
          }
          content={
            <ResizableSidebarLayout
              panelId="pr-files"
              sidebarDefaultSize={28}
              sidebarMinSize="180px"
              sidebarMaxSize={45}
              sidebar={
                <GuidanceFiles
                  step={step}
                  reference={reference}
                  onSelectReference={selectReference}
                  onActivate={() => {
                    target.current = "files";
                  }}
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
          }
        />
      </div>
      <GuidanceConversation
        guide={guide}
        step={step}
        open={conversationOpen}
        onOpenChange={setConversationOpen}
        onMessage={onMessage}
        onClear={onClearMessages}
      />
    </div>
  );
}

type GuidanceSidebarProps = Pick<Props, "guide" | "busy" | "onSelectStep"> & {
  step: GuidanceStep;
  onActivate(): void;
};

function GuidanceSidebar({ guide, step, onActivate, busy, onSelectStep }: GuidanceSidebarProps) {
  return (
    <aside
      aria-label="Guidance steps"
      className="bg-surface-toolbar flex h-full min-h-0 min-w-0 flex-col overflow-hidden pb-16"
      onPointerDown={onActivate}
      onFocusCapture={onActivate}
    >
      <div className="border-border flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h2 className="text-xs font-semibold">
          Steps <span className="text-muted-foreground tabular-nums">({guide.steps.length})</span>
        </h2>
        <Kbd aria-label="Focus steps">h</Kbd>
      </div>
      <details className="border-border shrink-0 border-b px-3 py-2">
        <summary className="text-muted-foreground cursor-pointer text-xs">
          About this walkthrough
        </summary>
        <div className="pt-2">
          <ExpandableMarkdown previewHeight={120}>{guide.summary}</ExpandableMarkdown>
        </div>
      </details>
      <GuidanceSteps guide={guide} step={step} busy={busy} onSelectStep={onSelectStep} />
    </aside>
  );
}

function GuidanceSteps({
  guide,
  step,
  busy,
  onSelectStep,
}: Pick<Props, "guide" | "busy" | "onSelectStep"> & { step: GuidanceStep }) {
  const navigationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navigationRef.current
      ?.querySelector<HTMLElement>('[aria-current="step"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [step.id]);

  return (
    <nav
      ref={navigationRef}
      aria-label="Walkthrough steps"
      data-nav-region="guidance-steps"
      className="min-h-0 flex-1 overflow-y-auto"
    >
      {guide.steps.map((item, index) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === step.id ? "step" : undefined}
          data-nav-index={index}
          disabled={busy}
          onClick={() => onSelectStep(item.id)}
          className={cn(
            "hover:bg-accent focus-visible:ring-ring/50 flex min-h-10 w-full items-start gap-2 border-l-2 border-transparent px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset",
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
  onActivate,
}: {
  step: GuidanceStep;
  reference: GuidanceReference | undefined;
  onSelectReference(index: number): void;
  onActivate(): void;
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
      tabIndex={-1}
      onPointerDown={onActivate}
      onFocusCapture={onActivate}
    >
      <div className="border-border bg-surface-toolbar flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h2 className="text-xs font-semibold">
          Files <span className="text-muted-foreground tabular-nums">({files.length})</span>
        </h2>
        <Kbd aria-label="Focus files">l</Kbd>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {files.length ? (
          <PierreFileTreeBrowser
            files={files}
            className="h-full"
            autoFocus={false}
            selectedPath={reference?.path ?? ""}
            navRegion="guidance-files"
            onActivatePath={selectPath}
          />
        ) : (
          <p className="text-muted-foreground p-3 text-xs">No files attached.</p>
        )}
      </div>
    </section>
  );
}
