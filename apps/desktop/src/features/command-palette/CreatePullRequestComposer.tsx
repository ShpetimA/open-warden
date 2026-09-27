import { useEffect, useRef, useState } from "react";
import { GitBranch, GitPullRequest, LoaderCircle, PencilLine } from "lucide-react";
import { toast } from "sonner";

import { useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreatePullRequestMutation,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import { useGetGitRepositoryStateQuery } from "@/features/source-control/gitOperationsApi";

import { CommandComposerCards } from "./CommandComposerCards";
import type { ComposerCardStep } from "./CommandComposerCards";
import { CommandComposerLayout, useCommandComposerRootRef } from "./CommandComposerLayout";
import { CommandComposerChoiceStep } from "./CommandComposerChoiceStep";
import type { ComposerChoice } from "./CommandComposerChoiceStep";
import { failureMessage } from "./commandComposerModel";
import { useCommandComposerHotkeys } from "./useCommandComposerHotkeys";

type Step = "head" | "base" | "details" | "confirm" | "execute";

export function CreatePullRequestComposer({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const { hostedRepo } = useResolveHostedRepoQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData }) => ({ hostedRepo: currentData }),
  });
  const { repository } = useGetGitRepositoryStateQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData }) => ({ repository: currentData }),
  });
  const [createPullRequest] = useCreatePullRequestMutation();
  const [step, setStep] = useState<Step>("head");
  const [query, setQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [headRef, setHeadRef] = useState("");
  const [baseRef, setBaseRef] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useCommandComposerRootRef();
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const runRef = useRef<HTMLButtonElement>(null);
  const runningRef = useRef(false);
  const localBranches =
    repository?.branches.filter((branch) => !branch.remote).map((branch) => branch.name) ?? [];
  const branchChoices: ComposerChoice[] = localBranches
    .filter(
      (branch) =>
        (step === "head" || branch !== headRef) &&
        branch.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .map((branch) => ({
      id: branch,
      label: branch,
      detail: branch === repository?.branch ? "Current branch" : "Local branch",
    }));
  const activeChoice =
    branchChoices.find((choice) => choice.id === highlightedId) ?? branchChoices[0];
  const pane =
    step === "head" || step === "base" ? "choice" : step === "execute" ? "execute" : "review";
  const canAdvance = Boolean(title.trim() && headRef && baseRef && hostedRepo && !busy);
  const canRun = step === "details" ? canAdvance : step === "confirm" && canAdvance;

  useEffect(() => {
    if (step === "head" || step === "base") searchRef.current?.focus();
    else if (step === "details") titleRef.current?.focus();
    else if (step === "confirm") runRef.current?.focus();
    else rootRef.current?.focus({ preventScroll: true });
  }, [rootRef, step]);

  function selectBranch(branch: string) {
    if (!localBranches.includes(branch)) return;
    setError("");
    setQuery("");
    setHighlightedId(null);
    if (step === "head") {
      setHeadRef(branch);
      setBaseRef("");
      setStep("base");
    } else if (step === "base" && branch !== headRef) {
      setBaseRef(branch);
      setStep("details");
    }
  }

  function goBack() {
    if (busy) return;
    setError("");
    if (step === "head") onBack();
    else if (step === "base") {
      setHighlightedId(headRef);
      setStep("head");
    } else if (step === "details") {
      setHighlightedId(baseRef);
      setStep("base");
    } else if (step === "confirm") setStep("details");
  }

  async function advanceOrRun() {
    if (!canRun) return;
    if (step === "details") {
      setStep("confirm");
      return;
    }
    if (step !== "confirm" || runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    setError("");
    setStep("execute");
    try {
      const created = await createPullRequest({
        repoPath,
        title: title.trim(),
        body: body.trim(),
        headRef,
        baseRef,
      }).unwrap();
      toast.success(`Pull request #${created.number} created`);
      onClose();
    } catch (cause) {
      setError(failureMessage(cause));
      setStep("confirm");
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }

  useCommandComposerHotkeys({
    rootRef,
    searchRef,
    runButtonRef: runRef,
    pane,
    query,
    enabledChoiceIds: branchChoices.map((choice) => choice.id),
    activeChoiceId: activeChoice?.id,
    canRun,
    hasError: Boolean(error),
    busy,
    onHighlight: setHighlightedId,
    onSelect: selectBranch,
    onBack: goBack,
    onClose,
    onRun: () => void advanceOrRun(),
  });

  const cardSteps: ComposerCardStep[] = [
    {
      id: "action",
      label: "Action",
      value: "Create pull request",
      icon: GitPullRequest,
      active: false,
      onPress: () => {
        if (!busy) onBack();
      },
    },
    {
      id: "head",
      label: "Head",
      value: step === "head" ? (activeChoice?.label ?? "Choose head") : headRef,
      previewKey: step === "head" ? activeChoice?.id : undefined,
      icon: GitBranch,
      active: step === "head",
      onPress: () => {
        if (busy) return;
        if (step === "head" && activeChoice) selectBranch(activeChoice.id);
        else {
          setQuery("");
          setHighlightedId(headRef);
          setStep("head");
        }
      },
    },
  ];

  if (step !== "head") {
    cardSteps.push({
      id: "base",
      label: "Base",
      value: step === "base" ? (activeChoice?.label ?? "Choose base") : baseRef,
      previewKey: step === "base" ? activeChoice?.id : undefined,
      icon: GitBranch,
      active: step === "base",
      onPress: () => {
        if (busy) return;
        if (step === "base" && activeChoice) selectBranch(activeChoice.id);
        else {
          setQuery("");
          setHighlightedId(baseRef);
          setStep("base");
        }
      },
    });
  }

  if (step === "details" || step === "confirm" || step === "execute") {
    cardSteps.push({
      id: "details",
      label: "Details",
      value: title.trim() || "Write details",
      icon: PencilLine,
      active: true,
      onPress: () => {
        if (busy) return;
        if (step === "details") titleRef.current?.focus();
        else setStep("details");
      },
    });
  }

  return (
    <CommandComposerLayout pane={pane}>
      <CommandComposerCards
        pane={pane}
        steps={cardSteps}
        actionLabel="Create pull request"
        previewAction="create-pr"
        operandLabel={step === "head" ? "Head" : step === "base" ? "Base" : "Branches"}
        operandValue={
          step === "head"
            ? (activeChoice?.label ?? "Choose head")
            : step === "base"
              ? (activeChoice?.label ?? "Choose base")
              : `${headRef} → ${baseRef}`
        }
        operandIcon={GitBranch}
        onActionPress={goBack}
        onOperandPress={() => {
          if (pane === "choice" && activeChoice) selectBranch(activeChoice.id);
          else if (step === "details") titleRef.current?.focus();
          else if (step === "confirm") runRef.current?.focus();
        }}
      />
      <div className="change-composer-panel">
        <div className="change-composer-panel-heading">
          <p className="change-composer-panel-title">
            {step === "head"
              ? "Choose source branch"
              : step === "base"
                ? "Choose target branch"
                : step === "details"
                  ? "Write pull request"
                  : step === "confirm"
                    ? "Confirm create pull request"
                    : "Creating pull request"}
          </p>
          <Button variant="ghost" size="sm" onClick={goBack} disabled={busy}>
            Back
          </Button>
        </div>
        {pane === "choice" ? (
          <CommandComposerChoiceStep
            pane="choice"
            action="create-pr"
            operandLabel={step === "head" ? "Head branch" : "Base branch"}
            choiceSearchLabel="branches"
            query={query}
            choices={branchChoices}
            matchingCount={branchChoices.length}
            activeChoiceId={activeChoice?.id}
            busy={busy}
            searchRef={searchRef}
            onQueryChange={(value) => {
              setQuery(value);
              setHighlightedId(null);
            }}
            onHighlight={setHighlightedId}
            onSelect={selectBranch}
            choiceIcon={GitBranch}
          />
        ) : step === "details" ? (
          <div className="change-composer-review-content">
            <p className="change-composer-help text-muted-foreground text-xs">
              {headRef} → {baseRef}. Push the source branch before creating the PR.
            </p>
            <label className="change-composer-panel-label" htmlFor="composer-pr-title">
              Title
            </label>
            <Input
              id="composer-pr-title"
              ref={titleRef}
              className="min-w-0 text-sm"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What changed?"
            />
            <label className="change-composer-panel-label" htmlFor="composer-pr-body">
              Description
            </label>
            <Textarea
              id="composer-pr-body"
              className="min-h-24 min-w-0 text-sm"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Add context for reviewers…"
            />
            <Button onClick={() => void advanceOrRun()} disabled={!canRun}>
              Review pull request
            </Button>
          </div>
        ) : step === "confirm" ? (
          <div className="change-composer-review-content">
            <div className="change-composer-review" role="group" aria-label="Pull request preview">
              <span className="change-composer-review-icon">
                <GitPullRequest className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{title.trim()}</p>
                <p className="change-composer-help text-muted-foreground text-xs">
                  {headRef} → {baseRef} · {hostedRepo?.owner}/{hostedRepo?.repo}
                </p>
              </div>
              {body.trim() ? (
                <p className="text-muted-foreground col-span-2 line-clamp-3 text-xs">
                  {body.trim()}
                </p>
              ) : null}
            </div>
            <Button ref={runRef} onClick={() => void advanceOrRun()} disabled={!canRun}>
              Confirm create pull request
            </Button>
          </div>
        ) : (
          <div className="change-composer-execution" role="status">
            <LoaderCircle className="size-5 animate-spin" /> Creating pull request…
          </div>
        )}
        {error ? (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        ) : null}
        <div className="change-composer-footer">
          <span>
            <Kbd>↑↓</Kbd> Choose
          </span>
          <span>
            <Kbd>↵</Kbd> Continue
          </span>
          <span>
            <Kbd>Esc</Kbd> Back
          </span>
        </div>
      </div>
    </CommandComposerLayout>
  );
}
