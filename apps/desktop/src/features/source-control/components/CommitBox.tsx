import { workspaceCommitDraftReplaced } from "@/features/workspaces/workspacesSlice";
import { useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { CommitComposer } from "./CommitComposer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Undo2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  const workspaceId = useAppSelector((state) => state.workspaces.activeWorkspaceId);
  const commitMessage = useAppSelector((state) => state.sourceControl.commitMessage);
  const { stagedCount } = useGetGitSnapshotQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData }) => ({ stagedCount: currentData?.staged.length }),
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
  let undoDescription = "Load the last commit before undoing it";
  let amendDescription = "Load the last commit before amending it";

  if (lastCommit) {
    const title = lastCommit.message.split("\n")[0];
    undoDescription = `Undo “${title}” and keep its changes staged`;
    amendDescription = `Amend “${title}”`;
  }

  if (lastCommit?.published) {
    undoDescription = "Last commit is published. Use Revert in History to undo it.";
    amendDescription = undoDescription;
  }

  const canCommit = Boolean(
    repoPath &&
    commitMessage.trim() &&
    !busy &&
    (amendHead ? editableCommit && lastCommit.id === amendHead : (stagedCount ?? 0) > 0),
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
      dispatch(
        workspaceCommitDraftReplaced({ workspaceId, expectedMessage: commitMessage, message: "" }),
      );
    }
  };
  useHotkey("Mod+Enter", () => void submit(), {
    target: input,
    ignoreInputs: false,
    enabled: canCommit,
  });

  return (
    <CommitComposer
      message={commitMessage}
      busy={busy}
      canCommit={canCommit}
      amending={Boolean(amendHead)}
      inputRef={input}
      onMessage={(message) => dispatch(setCommitMessageValue(message))}
      onSubmit={() => void submit()}
      options={
        <>
          <label className="text-muted-foreground flex min-h-8 items-center gap-1.5 px-1">
            <Checkbox
              aria-label="Amend last commit"
              aria-description={amendDescription}
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
            Amend
          </label>
          <TooltipProvider delayDuration={450} skipDelayDuration={300} disableHoverableContent>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label="Undo commit"
                    disabled={busy || !editableCommit || Boolean(amendHead)}
                    aria-description={undoDescription}
                    onClick={() => {
                      if (!lastCommit) return;
                      void execute({
                        repoPath,
                        command: { kind: "undo", expectedHead: lastCommit.id },
                      }).then((result) => {
                        if ("data" in result)
                          dispatch(
                            workspaceCommitDraftReplaced({
                              workspaceId,
                              expectedMessage: commitMessage,
                              message: lastCommit.message,
                            }),
                          );
                      });
                    }}
                  >
                    <Undo2 className="size-3" />
                    Undo
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64 rounded-md">
                {undoDescription}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      }
    />
  );
}
