import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, GitBranch, LoaderCircle, Plus } from "lucide-react";
import { useNavigate } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import {
  commitAction,
  setCommitMessageValue,
  stageAllAction,
  unstageAllAction,
  openRepo,
  selectHistoryPullRequestCommit,
} from "@/features/source-control/actions";
import { forgetProject } from "@/features/workspaces/actions";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import {
  useGetGitRepositoryStateQuery,
  useGetGitStashPatchQuery,
  useRunGitCommandMutation,
} from "@/features/source-control/gitOperationsApi";
import { desktop } from "@/platform/desktop";
import { useResolveHostedRepoQuery } from "@/features/hosted-repos/api";

import { CommandComposerCards } from "./CommandComposerCards";
import type { ComposerCardStep } from "./CommandComposerCards";
import { CommandComposerLayout, useCommandComposerRootRef } from "./CommandComposerLayout";
import { CommandComposerChoiceStep } from "./CommandComposerChoiceStep";
import type { ComposerChoice } from "./CommandComposerChoiceStep";
import {
  actionFromId,
  actions,
  branchActions,
  commandFor,
  composerScopes,
  count,
  eligibleBranch,
  failureMessage,
  hasOverlappingChanges,
  nameActions,
  remoteActions,
  selectionActions,
  scopeForAction,
  scopeFromId,
  specialActions,
  stashActions,
  tagActions,
  worktreeActions,
} from "./commandComposerModel";
import type { ComposerAction } from "./commandComposerModel";
import type { ComposerScope } from "./commandComposerModel";
import { paneAfterAction, previousPane } from "./commandComposerFlow";
import type { ComposerPane } from "./commandComposerFlow";
import { usePullRequestLinkChoice } from "./usePullRequestLinkChoice";
import { useCommandComposerHotkeys } from "./useCommandComposerHotkeys";

import "./ChangeCommandComposer.css";

export function ChangeCommandComposer({
  initialAction,
  onClose,
  onOpenSpecial,
}: {
  initialAction: ComposerAction | null;
  onClose: () => void;
  onOpenSpecial: (action: ComposerAction | "pull-requests") => void;
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const existingMessage = useAppSelector((state) => state.sourceControl.commitMessage);
  const { repository } = useGetGitRepositoryStateQuery(repoPath, {
    skip: !repoPath,
    pollingInterval: 15000,
    refetchOnFocus: true,
    selectFromResult: ({ currentData }) => ({ repository: currentData }),
  });
  const { hostedRepo } = useResolveHostedRepoQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData }) => ({ hostedRepo: currentData }),
  });
  const { stagedCount, unstageableCount, hasMixedFile } = useGetGitSnapshotQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData }) => ({
      stagedCount: currentData?.staged.length ?? 0,
      unstageableCount: (currentData?.unstaged.length ?? 0) + (currentData?.untracked.length ?? 0),
      hasMixedFile: hasOverlappingChanges(currentData),
    }),
  });
  const [execute, mutation] = useRunGitCommandMutation({ fixedCacheKey: repoPath });
  const [pane, setPane] = useState<ComposerPane>(
    paneAfterAction(initialAction, repository?.remotes.length ?? 0),
  );
  const [action, setAction] = useState<ComposerAction | null>(initialAction);
  const [scope, setScope] = useState<Exclude<ComposerScope, "pull-requests"> | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState(
    initialAction && remoteActions.has(initialAction) && repository?.remotes.length === 1
      ? (repository.remotes[0] ?? "")
      : "",
  );
  const [draft, setDraft] = useState(initialAction === "save-stash" ? "Work in progress" : "");
  const [message, setMessage] = useState(existingMessage);
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useCommandComposerRootRef();
  const searchRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const runningRef = useRef(false);
  const openedRepoPath = useRef(repoPath);

  useEffect(() => {
    if (repoPath !== openedRepoPath.current) onClose();
  }, [onClose, repoPath]);

  useEffect(() => {
    if (pane === "action" || pane === "choice") searchRef.current?.focus();
    else if (pane === "execute") rootRef.current?.focus({ preventScroll: true });
    else if (action === "commit") messageRef.current?.focus();
    else if (action && (nameActions.has(action) || action === "create-worktree"))
      nameRef.current?.focus();
    else runButtonRef.current?.focus();
  }, [action, pane, rootRef]);

  const { currentData: stashPatch, isFetching: stashPatchLoading } = useGetGitStashPatchQuery(
    { repoPath, oid: selection },
    {
      skip: !repoPath || pane !== "review" || !action || !stashActions.has(action) || !selection,
    },
  );
  const busy = working || mutation.isLoading || Boolean(runningAction);
  const clean = stagedCount === 0 && unstageableCount === 0;
  const otherBranches =
    repository?.branches.filter((branch) =>
      eligibleBranch("switch-branch", branch, repoPath, repository.branch),
    ) ?? [];
  const localBranches =
    repository?.branches.filter((branch) =>
      eligibleBranch("delete-branch", branch, repoPath, repository.branch),
    ) ?? [];
  const worktreeBranches =
    repository?.branches.filter((branch) =>
      eligibleBranch("create-worktree", branch, repoPath, repository.branch),
    ) ?? [];
  const removableWorktrees = repository?.worktrees.filter((item) => item.path !== repoPath) ?? [];
  const hasStashes = Boolean(repository?.stashes.length);
  const availability: Record<ComposerAction, boolean> = {
    "open-repository": true,
    "open-pr": Boolean(repoPath && hostedRepo),
    "open-pr-worktree": Boolean(repoPath && hostedRepo),
    "copy-pr-link": Boolean(repoPath && hostedRepo),
    "comment-pr": Boolean(repoPath && hostedRepo),
    "submit-review": Boolean(repoPath && hostedRepo),
    "create-pr": Boolean(repoPath && hostedRepo && repository?.branch),
    "approve-pr": Boolean(repoPath && hostedRepo),
    "request-changes": Boolean(repoPath && hostedRepo),
    "merge-pr": Boolean(repoPath && hostedRepo),
    pull: Boolean(
      repoPath &&
      repository?.upstream &&
      repository.behind > 0 &&
      !repository.ahead &&
      !repository.operation,
    ),
    push: Boolean(
      repoPath &&
      repository?.upstream &&
      repository.ahead > 0 &&
      !repository.behind &&
      !repository.operation,
    ),
    commit: Boolean(repoPath && stagedCount > 0),
    "stage-all": Boolean(repoPath && unstageableCount > 0),
    "unstage-all": Boolean(repoPath && stagedCount > 0),
    "stash-staged": Boolean(repoPath && stagedCount > 0 && !hasMixedFile && !repository?.operation),
    fetch: Boolean(repoPath && repository?.remotes.length),
    publish: Boolean(
      repoPath &&
      repository?.branch &&
      !repository.upstream &&
      repository.remotes.length &&
      !repository.operation,
    ),
    "switch-branch": otherBranches.length > 0 && !repository?.operation,
    "create-branch": Boolean(repoPath && repository?.branch && !repository.operation),
    "rename-branch": Boolean(repoPath && repository?.branch && !repository.operation),
    "stash-switch": otherBranches.length > 0 && !repository?.operation,
    "delete-branch": localBranches.length > 0 && !repository?.operation,
    "merge-branch": clean && otherBranches.length > 0 && !repository?.operation,
    "rebase-branch":
      clean && otherBranches.length > 0 && Boolean(repository?.branch) && !repository?.operation,
    "save-stash": Boolean(repoPath && (stagedCount || unstageableCount) && !repository?.operation),
    "apply-stash": hasStashes && !repository?.operation,
    "pop-stash": hasStashes && !repository?.operation,
    "drop-stash": hasStashes && !repository?.operation,
    "view-incoming": Boolean(repository?.incoming.length),
    "view-outgoing": Boolean(repository?.outgoing.length),
    "view-tags": Boolean(repoPath),
    "blame-file": Boolean(repoPath),
    "create-tag": Boolean(repoPath && repository?.lastCommit && !repository.operation),
    "delete-tag": Boolean(repository?.tags.length && !repository.operation),
    "create-worktree": Boolean(worktreeBranches.length && !repository?.operation),
    "remove-worktree": Boolean(removableWorktrees.length && !repository?.operation),
  };
  const details: Record<ComposerAction, string> = {
    "open-repository": "Recent repository or folder path",
    "open-pr": "Find a pull request and open its review",
    "open-pr-worktree": "Check out a PR in a separate worktree",
    "copy-pr-link": "Copy a pull request URL",
    "comment-pr": "Write a pull request comment",
    "submit-review": "Choose a decision, note, and pending inline comments",
    "create-pr": "Choose branches, write details, then confirm",
    "approve-pr": "Approve a reviewed pull request",
    "request-changes": "Send a review requesting changes",
    "merge-pr": "Choose a merge method and confirm",
    pull: !repository?.upstream
      ? "No upstream branch"
      : repository.ahead && repository.behind
        ? "Branch has diverged"
        : repository.behind
          ? `${count(repository.behind, "commit")} incoming`
          : "Up to date",
    push: !repository?.upstream
      ? "Publish this branch first"
      : repository.ahead && repository.behind
        ? "Branch has diverged"
        : repository.ahead
          ? `${count(repository.ahead, "commit")} outgoing`
          : "Nothing to push",
    commit: stagedCount ? `${count(stagedCount, "staged file")}` : "No staged changes",
    "stage-all": unstageableCount
      ? `${count(unstageableCount, "change")} to stage`
      : "No unstaged changes",
    "unstage-all": stagedCount ? count(stagedCount, "staged file") : "No staged changes",
    "stash-staged": hasMixedFile
      ? "Staged path has other changes"
      : stagedCount
        ? `${count(stagedCount, "staged file")} to stash`
        : "No staged changes",
    fetch: repository?.remotes.length ? "Update remote-tracking branches" : "No remote configured",
    publish: repository?.upstream ? "Branch is already published" : "Push and set upstream",
    "switch-branch": otherBranches.length
      ? `${count(otherBranches.length, "branch", "branches")} available`
      : "No other branch",
    "create-branch": "Create from HEAD and switch",
    "rename-branch": repository?.branch ? `Rename ${repository.branch}` : "No current branch",
    "stash-switch": otherBranches.length ? "Save work, then switch" : "No other branch",
    "delete-branch": localBranches.length
      ? "Delete a merged local branch"
      : "No eligible local branch",
    "merge-branch": clean ? "Merge into the current branch" : "Commit or stash local changes first",
    "rebase-branch": clean ? "Rebase the current branch" : "Commit or stash local changes first",
    "save-stash": stagedCount || unstageableCount ? "Save local changes" : "No local changes",
    "apply-stash": hasStashes ? "Restore a saved stash" : "No saved stashes",
    "pop-stash": hasStashes ? "Restore and remove a stash" : "No saved stashes",
    "drop-stash": hasStashes ? "Delete a saved stash" : "No saved stashes",
    "view-incoming": repository?.incoming.length
      ? count(repository.incoming.length, "incoming commit")
      : "No incoming commits",
    "view-outgoing": repository?.outgoing.length
      ? count(repository.outgoing.length, "outgoing commit")
      : "No outgoing commits",
    "view-tags": `${repository?.tags.length ?? 0} local tags`,
    "blame-file": "Show who last changed each line of a file",
    "create-tag": "Name an annotated tag at HEAD",
    "delete-tag": repository?.tags.length ? "Delete a local tag" : "No local tags",
    "create-worktree": worktreeBranches.length
      ? "Choose a branch and folder"
      : "No free local branch",
    "remove-worktree": removableWorktrees.length
      ? "Remove a clean linked checkout"
      : "No other worktree",
  };
  const normalizedQuery = query.trim().toLowerCase();
  const { choice: linkChoice, openLink } = usePullRequestLinkChoice(query, onClose);
  const scopeAvailability: Record<ComposerScope, boolean> = {
    "pull-requests": Boolean(repoPath && hostedRepo),
    branches: Boolean(repoPath && repository),
    stashes: Boolean(repoPath && repository),
    tags: Boolean(repoPath && repository),
  };
  const scopeDetails: Record<ComposerScope, string> = {
    "pull-requests": "Choose a PR, then an action",
    branches: "Choose a branch, then an action",
    stashes: "Choose a stash, then an action",
    tags: "Choose a tag, then an action",
  };
  const scopeSearchAliases: Record<ComposerScope, string> = {
    "pull-requests": "open review tab open in worktree",
    branches: "",
    stashes: "",
    tags: "open tagged commit",
  };
  const rootChoices: ComposerChoice[] = [
    ...composerScopes.map((item) => ({
      id: item.id,
      label: item.label,
      detail: scopeDetails[item.id],
      icon: item.icon,
      disabled: !scopeAvailability[item.id],
      section: scopeAvailability[item.id] ? "Available now" : "Unavailable",
    })),
    ...actions
      .filter((item) => scopeForAction(item.id) === null)
      .map((item) => ({
        id: item.id,
        label: item.label,
        detail: details[item.id],
        icon: item.icon,
        disabled: !availability[item.id],
        section: availability[item.id] ? "Available now" : "Unavailable",
      })),
  ];
  const matchingRootChoices = rootChoices
    .filter((item) => {
      if (!normalizedQuery) return true;
      if (`${item.label} ${item.detail}`.toLowerCase().includes(normalizedQuery)) return true;
      const matchingScope = scopeFromId(item.id);
      if (matchingScope && scopeSearchAliases[matchingScope].includes(normalizedQuery)) return true;
      return Boolean(
        matchingScope &&
        composerScopes
          .find((candidate) => candidate.id === matchingScope)
          ?.actionIds.some((id) =>
            actions
              .find((actionItem) => actionItem.id === id)
              ?.label.toLowerCase()
              .includes(normalizedQuery),
          ),
      );
    })
    .toSorted(
      (first, second) => Number(Boolean(first.disabled)) - Number(Boolean(second.disabled)),
    );
  const availableActionCount = rootChoices.filter((item) => !item.disabled).length;
  const selectedBranch = repository?.branches.find((branch) => branch.name === selection);
  const scopeActionIds: ComposerAction[] = [];
  if (scope === "branches") {
    scopeActionIds.push(
      "switch-branch",
      "stash-switch",
      "merge-branch",
      "rebase-branch",
      "delete-branch",
      "create-worktree",
    );
  } else if (scope === "stashes") {
    scopeActionIds.push("apply-stash", "pop-stash", "drop-stash");
  } else if (scope === "tags") {
    scopeActionIds.push("view-tags", "delete-tag");
  }
  const matchingScopeActions: ComposerChoice[] = scopeActionIds
    .map((id) => actions.find((item) => item.id === id))
    .filter((item) => item !== undefined)
    .filter(
      (item) =>
        !normalizedQuery ||
        item.label.toLowerCase().includes(normalizedQuery) ||
        (item.id === "view-tags" && "open tagged commit".includes(normalizedQuery)),
    )
    .map((item) => {
      const eligible =
        scope !== "branches" ||
        (selectedBranch !== undefined &&
          eligibleBranch(item.id, selectedBranch, repoPath, repository?.branch ?? ""));
      const enabled = item.id === "view-tags" || (availability[item.id] && eligible);
      return {
        id: item.id,
        label: item.id === "view-tags" ? "Open tagged commit" : item.label,
        detail: item.id === "view-tags" ? "Open this tag in History" : details[item.id],
        icon: item.icon,
        disabled: !enabled,
        section: enabled ? "Available now" : "Unavailable",
      };
    })
    .toSorted(
      (first, second) => Number(Boolean(first.disabled)) - Number(Boolean(second.disabled)),
    );
  const actionChoices = linkChoice
    ? [linkChoice]
    : scope
      ? matchingScopeActions
      : matchingRootChoices;
  const branches =
    action && branchActions.has(action)
      ? (repository?.branches.filter((branch) =>
          eligibleBranch(action, branch, repoPath, repository.branch),
        ) ?? [])
      : [];
  function buildScopeObjectChoices(): ComposerChoice[] {
    if (scope === "branches") {
      return [
        {
          id: "new:create-branch",
          label: "Create branch",
          detail: "Create from HEAD and switch",
          icon: Plus,
          disabled: !availability["create-branch"],
          section: "New",
        },
        {
          id: "new:rename-branch",
          label: "Rename current branch",
          detail: repository?.branch ?? "No current branch",
          disabled: !availability["rename-branch"],
          section: "Current branch",
        },
        ...otherBranches.map((branch) => ({
          id: branch.name,
          label: branch.name,
          detail: branch.remote ? "Remote branch" : "Local branch",
          section: "Branches",
        })),
      ];
    }

    if (scope === "stashes") {
      return [
        {
          id: "new:save-stash",
          label: "Save stash",
          detail: "Save local changes",
          icon: Plus,
          disabled: !availability["save-stash"],
          section: "New",
        },
        ...(repository?.stashes.map((stash) => ({
          id: stash.oid,
          label: stash.label,
          detail: stash.oid.slice(0, 8),
          section: "Saved stashes",
        })) ?? []),
      ];
    }

    if (scope === "tags") {
      return [
        {
          id: "new:create-tag",
          label: "Create tag",
          detail: "Tag the current commit",
          icon: Plus,
          disabled: !availability["create-tag"],
          section: "New",
        },
        ...(repository?.tags.map((tag) => ({
          id: tag.name,
          label: tag.name,
          detail: tag.commitId.slice(0, 8),
          section: "Local tags",
        })) ?? []),
      ];
    }

    return [];
  }

  const scopeObjectChoices = buildScopeObjectChoices();
  const operandChoices: ComposerChoice[] = scope
    ? scopeObjectChoices
    : action && branchActions.has(action)
      ? branches.map((branch) => ({
          id: branch.name,
          label: branch.name,
          detail: branch.remote ? "Remote branch" : "Local branch",
        }))
      : action && remoteActions.has(action)
        ? (repository?.remotes.map((remote) => ({ id: remote, label: remote, detail: "Remote" })) ??
          [])
        : action && stashActions.has(action)
          ? (repository?.stashes.map((stash) => ({
              id: stash.oid,
              label: stash.label,
              detail: stash.oid.slice(0, 8),
            })) ?? [])
          : action && tagActions.has(action)
            ? (repository?.tags.map((tag) => ({
                id: tag.name,
                label: tag.name,
                detail: tag.commitId.slice(0, 8),
              })) ?? [])
            : action && worktreeActions.has(action)
              ? removableWorktrees.map((item) => ({
                  id: item.path,
                  label: item.path,
                  detail: item.branch || "Detached HEAD",
                }))
              : [];
  const matchingChoices =
    pane === "action"
      ? actionChoices
      : operandChoices.filter((item) =>
          `${item.label} ${item.detail}`.toLowerCase().includes(normalizedQuery),
        );
  const visibleChoices = matchingChoices.slice(0, 50);
  const activeChoice =
    visibleChoices.find((item) => item.id === highlightedId && !item.disabled) ??
    visibleChoices.find((item) => !item.disabled);
  const previewAction =
    pane === "action" ? (linkChoice ? "open-pr" : actionFromId(activeChoice?.id ?? "")) : action;
  const previewScope = pane === "action" && !scope ? scopeFromId(activeChoice?.id ?? "") : null;
  const actionInfo = actions.find((item) => item.id === previewAction);
  const actionLabel =
    pane === "action" && linkChoice
      ? linkChoice.label
      : previewScope
        ? (composerScopes.find((item) => item.id === previewScope)?.label ?? "Choose a scope")
        : (actionInfo?.label ?? "Choose action");
  const selectionLabel =
    operandChoices.find((item) => item.id === selection)?.label ?? "Choose one";
  const operandLabel =
    scope && !action
      ? scope === "branches"
        ? "Branch"
        : scope === "stashes"
          ? "Stash"
          : "Tag"
      : action === "commit"
        ? "Message"
        : action && nameActions.has(action)
          ? "Name"
          : action && branchActions.has(action)
            ? "Branch"
            : (action && remoteActions.has(action)) || action === "pull" || action === "push"
              ? "Remote"
              : action && stashActions.has(action)
                ? "Stash"
                : action && tagActions.has(action)
                  ? "Tag"
                  : action && worktreeActions.has(action)
                    ? "Worktree"
                    : action === "view-incoming" || action === "view-outgoing"
                      ? "Commits"
                      : "Scope";
  const choiceSearchLabel =
    operandLabel === "Branch"
      ? "branches"
      : operandLabel === "Stash"
        ? "stashes"
        : `${operandLabel.toLowerCase()}s`;
  const operandValue =
    scope && !action
      ? pane === "choice"
        ? (activeChoice?.label ?? `Choose a ${operandLabel.toLowerCase()}`)
        : selectionLabel
      : action === "commit"
        ? message.trim().split("\n")[0] || "Write a message"
        : action && nameActions.has(action)
          ? draft.trim() || "Enter a name"
          : action && selectionActions.has(action)
            ? selectionLabel
            : action === "pull" || action === "push"
              ? repository?.upstream || "No upstream"
              : action === "view-incoming"
                ? count(repository?.incoming.length ?? 0, "commit")
                : action === "view-outgoing"
                  ? count(repository?.outgoing.length ?? 0, "commit")
                  : action === "stage-all"
                    ? count(unstageableCount, "change")
                    : count(stagedCount, "staged file");
  const validName = Boolean(
    draft.trim() &&
    draft.length <= 1024 &&
    !draft.trim().startsWith("-") &&
    !draft.includes("\0") &&
    !draft.includes("\r") &&
    !draft.includes("\n"),
  );
  const isReadOnly =
    action === "view-incoming" || action === "view-outgoing" || action === "view-tags";
  function canRunAction(requestedAction: ComposerAction, requestedSelection: string) {
    return Boolean(
      availability[requestedAction] &&
      !busy &&
      requestedAction !== "view-incoming" &&
      requestedAction !== "view-outgoing" &&
      requestedAction !== "view-tags" &&
      (requestedAction !== "commit" || message.trim()) &&
      (!nameActions.has(requestedAction) || validName) &&
      (requestedAction !== "create-worktree" || draft.trim().startsWith("/")) &&
      (!selectionActions.has(requestedAction) || requestedSelection),
    );
  }
  const canRun = action ? canRunAction(action, selection) : false;
  function chooseAction(nextAction: ComposerAction) {
    if (!availability[nextAction] || busy) return;
    if (specialActions.has(nextAction)) {
      onOpenSpecial(nextAction);
      return;
    }
    setAction(nextAction);
    setQuery("");
    setHighlightedId(null);
    setError("");
    setDraft(nextAction === "save-stash" ? "Work in progress" : "");
    if (scope) {
      if (nextAction === "create-worktree") {
        setDraft(`${repoPath}-${selection.replaceAll("/", "-")}`);
      }
      if (nameActions.has(nextAction)) setSelection("");
      setPane("review");
      return;
    }
    if (
      branchActions.has(nextAction) ||
      stashActions.has(nextAction) ||
      tagActions.has(nextAction) ||
      worktreeActions.has(nextAction)
    ) {
      setSelection("");
    } else if (remoteActions.has(nextAction)) {
      if (repository?.remotes.length === 1 && repository.remotes[0]) {
        setSelection(repository.remotes[0]);
      } else {
        setSelection("");
      }
    }
    setPane(paneAfterAction(nextAction, repository?.remotes.length ?? 0));
  }

  function chooseScope(nextScope: ComposerScope) {
    if (!scopeAvailability[nextScope] || busy) return;
    if (nextScope === "pull-requests") {
      onOpenSpecial("pull-requests");
      return;
    }
    setScope(nextScope);
    setAction(null);
    setSelection("");
    setQuery("");
    setHighlightedId(null);
    setError("");
    setPane("choice");
  }

  function chooseOperand(id: string) {
    if (scope && !action) {
      const choice = scopeObjectChoices.find((item) => item.id === id);
      if (!choice || choice.disabled) return;
      if (id.startsWith("new:")) {
        const nextAction = actionFromId(id.slice(4));
        if (nextAction) chooseAction(nextAction);
        return;
      }
      setSelection(id);
      setQuery("");
      setHighlightedId(null);
      setPane("action");
      setError("");
      return;
    }
    setSelection(id);
    if (action === "create-worktree") setDraft(`${repoPath}-${id.replaceAll("/", "-")}`);
    setHighlightedId(null);
    setPane("review");
    setError("");
  }

  function goBack() {
    if (busy) return;
    if (scope) {
      if (pane === "execute") {
        setPane("review");
      } else if (pane === "review") {
        if (selection) {
          setPane("action");
          setHighlightedId(action);
        } else {
          setPane("choice");
          setHighlightedId(action ? `new:${action}` : null);
        }
        setAction(null);
      } else if (pane === "action") {
        setPane("choice");
        setHighlightedId(selection);
      } else {
        setPane("action");
        setHighlightedId(scope);
        setScope(null);
        setSelection("");
      }
      setQuery("");
      setError("");
      return;
    }
    const previous = previousPane(pane, action, repository?.remotes.length ?? 0);
    setPane(previous);
    if (previous === "choice") {
      setHighlightedId(selection);
    } else if (previous === "action") {
      setHighlightedId(action);
      setQuery("");
    }
    setError("");
  }

  function selectChoice(id: string) {
    if (id === linkChoice?.id) {
      openLink();
      return;
    }
    if (pane === "action") {
      if (scope) {
        if (id === "view-tags") {
          const tag = repository?.tags.find((item) => item.name === selection);
          if (!tag) return;
          void dispatch(selectHistoryPullRequestCommit(tag.commitId));
          navigate(`/history?commit=${tag.commitId}`);
          onClose();
          return;
        }
        const selected = actionFromId(id);
        const choice = actionChoices.find((item) => item.id === id);
        if (selected && !choice?.disabled) chooseAction(selected);
        return;
      }
      const selectedScope = scopeFromId(id);
      if (selectedScope) {
        chooseScope(selectedScope);
        return;
      }
      const selected = actionFromId(id);
      if (selected) chooseAction(selected);
    } else if (pane === "choice") {
      chooseOperand(id);
    }
  }

  useCommandComposerHotkeys({
    rootRef,
    searchRef,
    runButtonRef,
    pane,
    query,
    enabledChoiceIds: visibleChoices
      .filter((choice) => !choice.disabled)
      .map((choice) => choice.id),
    activeChoiceId: activeChoice?.id,
    canRun,
    hasError: Boolean(error),
    busy,
    actionIsRoot: !scope,
    onHighlight: setHighlightedId,
    onSelect: selectChoice,
    onBack: goBack,
    onClose,
    onRun: () => void run(),
  });

  async function run(requestedAction = action, requestedSelection = selection) {
    if (
      !repoPath ||
      !requestedAction ||
      !canRunAction(requestedAction, requestedSelection) ||
      runningRef.current
    )
      return;
    runningRef.current = true;
    setWorking(true);
    setError("");
    setPane("execute");
    try {
      if (requestedAction === "commit") {
        dispatch(setCommitMessageValue(message.trim()));
        if (!(await dispatch(commitAction()))) {
          setError("The commit could not be created. Check the message and try again.");
          return;
        }
      } else if (requestedAction === "stage-all" || requestedAction === "unstage-all") {
        const succeeded = await dispatch(
          requestedAction === "stage-all" ? stageAllAction() : unstageAllAction(),
        );
        if (!succeeded) {
          setError(
            `Could not ${requestedAction === "stage-all" ? "stage" : "unstage"} the changes.`,
          );
          return;
        }
      } else {
        if (!repository) {
          setError("Repository state is still loading. Try again in a moment.");
          return;
        }
        const command = commandFor(
          requestedAction,
          requestedSelection,
          draft,
          includeUntracked,
          repository,
        );
        if (!command) {
          setError("The command is no longer available. Go back and choose it again.");
          return;
        }
        if (
          (requestedAction === "drop-stash" ||
            requestedAction === "delete-tag" ||
            requestedAction === "remove-worktree") &&
          !(await desktop.confirm(
            requestedAction === "drop-stash"
              ? "Delete this saved stash? Its changes will no longer be available from the stash list."
              : requestedAction === "delete-tag"
                ? `Delete local tag ${requestedSelection}?`
                : `Remove worktree at ${requestedSelection}? The checkout folder will be removed only if it is clean.`,
            {
              title:
                requestedAction === "drop-stash"
                  ? "Delete stash"
                  : requestedAction === "delete-tag"
                    ? "Delete tag"
                    : "Remove worktree",
              kind: "warning",
              okLabel: requestedAction === "remove-worktree" ? "Remove" : "Delete",
            },
          ))
        ) {
          setPane("review");
          return;
        }
        await execute({ repoPath, command }).unwrap();
        if (requestedAction === "create-worktree") await dispatch(openRepo(draft.trim()));
        if (requestedAction === "remove-worktree") dispatch(forgetProject(requestedSelection));
      }
      onClose();
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      runningRef.current = false;
      setWorking(false);
    }
  }

  const ActionIcon = actionInfo?.icon ?? GitBranch;
  const ScopeIcon = composerScopes.find((item) => item.id === scope)?.icon;
  const PreviewScopeIcon = composerScopes.find((item) => item.id === previewScope)?.icon;
  const OperandIcon = ScopeIcon ?? (action && branchActions.has(action) ? GitBranch : ActionIcon);
  const selectedStash = repository?.stashes.find((stash) => stash.oid === selection);
  const commits =
    action === "view-incoming"
      ? repository?.incoming
      : action === "view-outgoing"
        ? repository?.outgoing
        : repository?.tags.map((tag) => ({ id: tag.commitId.slice(0, 8), subject: tag.name }));

  let cardSteps: ComposerCardStep[] | undefined;
  const scopeInfo = composerScopes.find((item) => item.id === scope);

  if (scopeInfo) {
    cardSteps = [
      {
        id: "scope",
        label: "Scope",
        value: scopeInfo.label,
        icon: scopeInfo.icon,
        active: false,
        onPress: () => {
          if (busy) return;
          setScope(null);
          setAction(null);
          setSelection("");
          setPane("action");
          setQuery("");
          setHighlightedId(scope);
        },
      },
    ];

    if (selection || !action) {
      cardSteps.push({
        id: "target",
        label: scope === "branches" ? "Branch" : scope === "stashes" ? "Stash" : "Tag",
        value:
          pane === "choice"
            ? operandValue
            : (scopeObjectChoices.find((item) => item.id === selection)?.label ?? selectionLabel),
        previewKey: pane === "choice" ? activeChoice?.id : undefined,
        icon: scopeInfo.icon,
        active: pane === "choice",
        onPress: () => {
          if (busy) return;
          if (pane === "choice" && activeChoice) chooseOperand(activeChoice.id);
          else {
            setAction(null);
            setPane("choice");
            setQuery("");
            setHighlightedId(selection);
          }
        },
      });
    }

    if (action || pane === "action") {
      cardSteps.push({
        id: "action",
        label: "Action",
        value: pane === "action" ? (activeChoice?.label ?? "Choose action") : actionLabel,
        previewKey: pane === "action" ? activeChoice?.id : (action ?? undefined),
        icon: ActionIcon,
        active: pane === "action" || Boolean(selection),
        onPress: () => {
          if (busy) return;
          if (pane === "action" && activeChoice) selectChoice(activeChoice.id);
          else if (selection) {
            setAction(null);
            setPane("action");
            setQuery("");
            setHighlightedId(action);
          } else {
            setAction(null);
            setPane("choice");
            setQuery("");
            setHighlightedId(action ? `new:${action}` : null);
          }
        },
      });
    }

    if (action && !selection && pane !== "action") {
      cardSteps.push({
        id: "input",
        label: operandLabel,
        value: operandValue,
        icon: OperandIcon,
        active: true,
        onPress: () => {
          if (busy) return;
          nameRef.current?.focus();
        },
      });
    }
  }

  return (
    <CommandComposerLayout pane={pane}>
      <CommandComposerCards
        pane={pane}
        steps={cardSteps}
        actionLabel={actionLabel}
        previewAction={previewAction}
        previewIcon={PreviewScopeIcon}
        operandLabel={operandLabel}
        operandValue={operandValue}
        operandIcon={OperandIcon}
        objectFirst={scope !== null && (pane === "choice" || Boolean(selection))}
        onActionPress={() => {
          if (pane === "action" && activeChoice) selectChoice(activeChoice.id);
          else if (pane !== "action") goBack();
        }}
        onOperandPress={() => {
          if (pane === "choice") {
            if (activeChoice) chooseOperand(activeChoice.id);
            else searchRef.current?.focus();
          } else if (pane === "action" && scope) {
            goBack();
          } else if (action === "commit") messageRef.current?.focus();
          else if (action && (nameActions.has(action) || action === "create-worktree"))
            nameRef.current?.focus();
          else runButtonRef.current?.focus();
        }}
      />

      <div className="change-composer-panel">
        <div className="change-composer-panel-heading">
          <p className="change-composer-panel-title">
            {pane === "action"
              ? scope
                ? "Choose an action"
                : "All actions"
              : pane === "choice"
                ? `Choose ${operandLabel.toLowerCase()}`
                : pane === "execute"
                  ? actionLabel
                  : action === "commit"
                    ? "Write commit message"
                    : `Confirm ${actionLabel.toLowerCase()}`}
          </p>
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]">
            {linkChoice?.detail ?? (repoPath.split("/").findLast(Boolean) || "No repository")}
            {pane === "action" && !scope && !linkChoice
              ? ` · ${availableActionCount} of ${rootChoices.length} ready`
              : ""}
          </span>
          {(pane !== "action" || scope) && (pane !== "execute" || error) ? (
            <Button variant="ghost" size="sm" className="shrink-0" onClick={goBack} disabled={busy}>
              <ArrowLeft className="size-4" /> Back
            </Button>
          ) : null}
        </div>

        {pane === "action" || pane === "choice" ? (
          <CommandComposerChoiceStep
            pane={pane}
            action={action}
            operandLabel={operandLabel}
            choiceSearchLabel={choiceSearchLabel}
            query={query}
            choices={visibleChoices}
            matchingCount={matchingChoices.length}
            activeChoiceId={activeChoice?.id}
            busy={busy}
            searchRef={searchRef}
            onQueryChange={(value) => {
              setQuery(value);
              setHighlightedId(null);
            }}
            onHighlight={setHighlightedId}
            onSelect={selectChoice}
            choiceIcon={ScopeIcon}
            searchPlaceholder={
              pane === "action" && scope
                ? `Search ${scope} actions…`
                : pane === "action"
                  ? "Search commands or paste a PR link…"
                  : undefined
            }
          />
        ) : pane === "execute" ? (
          <div className="change-composer-execution" role="status" aria-live="polite">
            <span className="change-composer-execution-icon" aria-hidden="true">
              {working || mutation.isLoading ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <ActionIcon className="size-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {error ? `Could not complete ${actionLabel.toLowerCase()}` : `${actionLabel}…`}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {action ? details[action] : "Current repository"}
              </span>
            </span>
            {error && canRun ? (
              <Button size="sm" onClick={() => void run()} disabled={!canRun}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="change-composer-review-content">
            {action === "commit" ? (
              <>
                <label className="change-composer-panel-label" htmlFor="change-composer-message">
                  Commit message
                </label>
                <Textarea
                  id="change-composer-message"
                  ref={messageRef}
                  className="min-h-24 min-w-0 resize-none text-sm"
                  rows={4}
                  placeholder="Summary, then an optional description"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  disabled={busy}
                />
                <p className="text-muted-foreground text-xs tabular-nums">
                  {count(stagedCount, "staged file")}
                </p>
              </>
            ) : action && (nameActions.has(action) || action === "create-worktree") ? (
              <>
                <label className="change-composer-panel-label" htmlFor="change-composer-name">
                  {action === "save-stash"
                    ? "Stash name"
                    : action === "create-tag"
                      ? "Tag name"
                      : action === "create-worktree"
                        ? "Worktree folder"
                        : "Branch name"}
                </label>
                <Input
                  id="change-composer-name"
                  ref={nameRef}
                  className="min-w-0 max-w-full text-sm"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={
                    action === "save-stash"
                      ? "Work in progress"
                      : action === "create-tag"
                        ? "v1.0.0"
                        : action === "create-worktree"
                          ? "/path/to/worktree"
                          : "feature/my-change"
                  }
                  disabled={busy}
                />
                {action === "save-stash" ? (
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={includeUntracked}
                      onCheckedChange={(checked) => setIncludeUntracked(checked === true)}
                    />{" "}
                    Include untracked files
                  </label>
                ) : (
                  <p className="change-composer-help text-muted-foreground text-xs">
                    {action === "create-worktree"
                      ? `Check out ${selection} in a new folder. Existing folders are never replaced.`
                      : action === "create-tag"
                        ? `Tag current commit ${repository?.lastCommit?.id.slice(0, 8) ?? "HEAD"}`
                        : action === "create-branch"
                          ? `Start from ${repository?.branch || "HEAD"}`
                          : `Current branch: ${repository?.branch || "none"}`}
                  </p>
                )}
              </>
            ) : action === "view-tags" ? (
              <div className="change-composer-commit-list" role="list" aria-label="Local tags">
                {repository?.tags.length ? (
                  repository.tags.map((tag) => (
                    <button
                      key={tag.name}
                      type="button"
                      role="listitem"
                      className="hover:bg-surface-toolbar flex w-full items-center gap-3 rounded px-2 py-2 text-left text-sm"
                      onClick={() => {
                        void dispatch(selectHistoryPullRequestCommit(tag.commitId));
                        navigate(`/history?commit=${tag.commitId}`);
                        onClose();
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                      <code className="text-muted-foreground text-xs">
                        {tag.commitId.slice(0, 8)}
                      </code>
                    </button>
                  ))
                ) : (
                  <p className="text-muted-foreground text-xs">No local tags.</p>
                )}
              </div>
            ) : isReadOnly ? (
              <div className="change-composer-commit-list" role="list" aria-label={actionLabel}>
                {commits?.map((commit) => (
                  <div key={commit.id} role="listitem" className="flex gap-3 py-2 text-sm">
                    <code className="text-muted-foreground shrink-0 text-xs">{commit.id}</code>
                    <span className="truncate">{commit.subject}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="change-composer-review" role="group" aria-label="Command preview">
                <span className="change-composer-review-icon" aria-hidden="true">
                  <ActionIcon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {action === "stage-all"
                      ? "Stage all changes"
                      : action === "unstage-all"
                        ? "Remove all files from the next commit"
                        : action === "stash-staged"
                          ? "Save staged changes in a stash"
                          : action && stashActions.has(action)
                            ? selectedStash?.label
                            : action && (tagActions.has(action) || worktreeActions.has(action))
                              ? selectionLabel
                              : action && (branchActions.has(action) || remoteActions.has(action))
                                ? selectionLabel
                                : repository?.branch || "Current branch"}
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {action === "stage-all"
                      ? count(unstageableCount, "change")
                      : action === "unstage-all" || action === "stash-staged"
                        ? count(stagedCount, "staged file")
                        : action === "pull"
                          ? `Pull ${count(repository?.behind ?? 0, "commit")} from ${repository?.upstream}`
                          : action === "push"
                            ? `Push ${count(repository?.ahead ?? 0, "commit")} to ${repository?.upstream}`
                            : action === "fetch"
                              ? `Fetch from ${selection}`
                              : action === "publish"
                                ? `Publish ${repository?.branch} to ${selection}`
                                : action === "stash-switch"
                                  ? "Save local work, then switch branches"
                                  : action === "delete-branch"
                                    ? "Only merged branches can be deleted"
                                    : action === "merge-branch"
                                      ? `Merge ${selection} into ${repository?.branch}`
                                      : action === "rebase-branch"
                                        ? `Rebase ${repository?.branch} onto ${selection}`
                                        : action === "pop-stash"
                                          ? "Apply and remove this stash"
                                          : action === "apply-stash"
                                            ? "Apply and keep this stash"
                                            : action === "drop-stash"
                                              ? "Permanently remove this stash"
                                              : "Current repository"}
                  </p>
                </div>
                {action === "stash-staged" ? (
                  <p className="text-muted-foreground text-xs">
                    Unstaged and untracked changes stay in place.
                  </p>
                ) : null}
                {action && stashActions.has(action) ? (
                  <pre
                    aria-label="Stash diff"
                    className="bg-surface-inset mt-2 max-h-40 overflow-auto rounded-md border p-2 font-mono text-[11px]"
                  >
                    {stashPatchLoading ? "Loading stash…" : stashPatch || "No text changes."}
                  </pre>
                ) : null}
              </div>
            )}
            <div className="change-composer-submit">
              {isReadOnly ? (
                <Button ref={runButtonRef} className="w-full" variant="outline" onClick={onClose}>
                  Done
                </Button>
              ) : (
                <Button
                  ref={runButtonRef}
                  className="min-w-0 max-w-full justify-center"
                  variant={
                    action === "drop-stash" ||
                    action === "delete-branch" ||
                    action === "delete-tag" ||
                    action === "remove-worktree"
                      ? "destructive"
                      : "default"
                  }
                  disabled={!canRun}
                  onClick={() => void run()}
                >
                  <span className="min-w-0 truncate">
                    {working || mutation.isLoading ? "Working…" : `Confirm ${actionLabel}`}
                  </span>
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </div>
        )}
        {error ? (
          <p role="alert" className="text-destructive px-1 text-xs">
            {error}
          </p>
        ) : null}
        <div className="change-composer-footer">
          {pane === "action" || pane === "choice" ? (
            <>
              <span>
                <Kbd>↑↓</Kbd> Choose
              </span>
              <span>
                <Kbd>↵</Kbd> Select
              </span>
              {pane === "action" && !scope && !query ? (
                <span className="change-composer-action-count">
                  Scroll for all {rootChoices.length}
                </span>
              ) : null}
            </>
          ) : pane === "review" ? (
            <>
              <span>
                <Kbd>←</Kbd> Back
              </span>
              {!isReadOnly ? (
                <span>
                  <Kbd>⌘↵</Kbd> Run
                </span>
              ) : null}
            </>
          ) : null}
          {pane !== "execute" || error ? (
            <span>
              <Kbd>Esc</Kbd> {pane === "action" && !scope ? "Close" : "Back"}
            </span>
          ) : null}
        </div>
      </div>
    </CommandComposerLayout>
  );
}
