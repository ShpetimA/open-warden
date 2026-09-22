import { useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { GitCommitHorizontal } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useGetGitSnapshotQuery } from "../api";
import { useGetGitRepositoryStateQuery, useRunGitCommandMutation } from "../gitOperationsApi";
import { commitAction, setCommitMessageValue } from "../actions";

export function CommitBox() {
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  return <RepositoryCommitBox key={repoPath} repoPath={repoPath} />;
}

function RepositoryCommitBox({ repoPath }: { repoPath: string }) {
  const dispatch = useAppDispatch();
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const commitMessage = useAppSelector((state) => state.sourceControl.commitMessage);
  const { stagedCount } = useGetGitSnapshotQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData }) => ({ stagedCount: currentData?.staged.length ?? 0 }),
  });
  const { lastCommit } = useGetGitRepositoryStateQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData }) => ({ lastCommit: currentData?.lastCommit }),
  });
  const [execute, mutation] = useRunGitCommandMutation({ fixedCacheKey: repoPath });
  const [amendHead, setAmendHead] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = Boolean(runningAction) || mutation.isLoading;
  const editableCommit = lastCommit && !lastCommit.published;
  const canCommit = Boolean(
    repoPath &&
    commitMessage.trim() &&
    !busy &&
    (amendHead ? editableCommit && lastCommit.id === amendHead : stagedCount > 0),
  );

  const submit = async () => {
    if (!canCommit) return;
    if (!amendHead) {
      await dispatch(commitAction());
      return;
    }
    const result = await execute({
      repoPath,
      command: { kind: "amend", expectedHead: amendHead, message: commitMessage },
    });
    if ("data" in result) {
      setAmendHead(null);
      dispatch(setCommitMessageValue(""));
    }
  };
  useHotkey("Mod+Enter", () => void submit(), {
    target: input,
    ignoreInputs: false,
    enabled: canCommit,
  });

  return (
    <div className="border-border space-y-2 border-b px-2 py-3">
      <Textarea
        ref={input}
        aria-label="Commit message"
        value={commitMessage}
        onChange={(event) => dispatch(setCommitMessageValue(event.target.value))}
        placeholder="Summary, then an optional description"
        className="min-h-20 resize-y text-xs"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <Checkbox
            checked={Boolean(amendHead)}
            disabled={busy || !editableCommit}
            onCheckedChange={(checked) => {
              if (checked && lastCommit) {
                setDraft(commitMessage);
                setAmendHead(lastCommit.id);
                dispatch(setCommitMessageValue(lastCommit.message));
              } else {
                setAmendHead(null);
                dispatch(setCommitMessageValue(draft));
              }
            }}
          />
          Amend last commit
        </label>
        <Button
          variant="ghost"
          size="xs"
          disabled={busy || !editableCommit || Boolean(amendHead)}
          title="Undo the last unpublished commit and keep its changes staged"
          onClick={() => {
            if (!lastCommit) return;
            void execute({ repoPath, command: { kind: "undo", expectedHead: lastCommit.id } }).then(
              (result) => {
                if ("data" in result) dispatch(setCommitMessageValue(lastCommit.message));
              },
            );
          }}
        >
          Undo commit
        </Button>
      </div>
      {lastCommit?.published ? (
        <p className="text-muted-foreground text-[11px]">
          Last commit is published. Use Revert in History to undo it.
        </p>
      ) : null}
      <Button className="w-full" size="sm" disabled={!canCommit} onClick={() => void submit()}>
        <GitCommitHorizontal />
        {busy ? "Working…" : amendHead ? "Amend commit" : "Commit"}
        <kbd className="ml-auto text-[10px] opacity-70">⌘↵</kbd>
      </Button>
    </div>
  );
}
