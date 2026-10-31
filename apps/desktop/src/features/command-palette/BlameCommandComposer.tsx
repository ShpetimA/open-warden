import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useGetRepoFilesQuery } from "@/features/source-control/api";
import { openFileViewer } from "@/features/source-control/sourceControlSlice";

import { CommandComposerContext } from "./CommandComposerContext";
import { CommandComposerLayout, useCommandComposerRootRef } from "./CommandComposerLayout";
import { CommandComposerChoiceStep } from "./CommandComposerChoiceStep";
import { useCommandComposerHotkeys } from "./useCommandComposerHotkeys";

export function BlameCommandComposer({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const rootRef = useCommandComposerRootRef();
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: files = [], isLoading } = useGetRepoFilesQuery(repoPath, { skip: !repoPath });
  const matches = files.filter(
    (file) =>
      !file.path.endsWith("/") && file.path.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const choices = matches.slice(0, 50).map((file) => ({
    id: file.path,
    label: file.path.split("/").at(-1) ?? file.path,
    detail: file.path,
  }));
  const activeChoice = choices.find((choice) => choice.id === highlightedId) ?? choices[0];
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  function openFile(path: string) {
    if (!repoPath) return;
    dispatch(openFileViewer({ repoPath, relPath: path, blame: true }));
    navigate("/changes/files");
    onClose();
  }

  useCommandComposerHotkeys({
    rootRef,
    searchRef,
    pane: "choice",
    query,
    enabledChoiceIds: choices.map((choice) => choice.id),
    activeChoiceId: activeChoice?.id,
    canRun: false,
    hasError: false,
    busy: false,
    onHighlight: setHighlightedId,
    onSelect: openFile,
    onBack,
    onClose,
    onRun: () => {},
  });

  return (
    <CommandComposerLayout pane="choice">
      <CommandComposerContext
        pane="choice"
        actionLabel="Blame file"
        operandLabel="File"
        operandValue={activeChoice?.label ?? "Choose a file"}
        onActionPress={onBack}
        onOperandPress={() => {
          if (activeChoice) openFile(activeChoice.id);
        }}
      />
      <div className="change-composer-panel">
        <div className="change-composer-panel-heading">
          <p className="change-composer-panel-title">Choose file</p>
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
        </div>
        <CommandComposerChoiceStep
          pane="choice"
          operandLabel="File"
          choiceSearchLabel="files"
          query={query}
          choices={choices}
          matchingCount={matches.length}
          activeChoiceId={activeChoice?.id}
          busy={false}
          searchRef={searchRef}
          onQueryChange={(value) => {
            setQuery(value);
            setHighlightedId(null);
          }}
          onHighlight={setHighlightedId}
          onSelect={openFile}
          searchLabel="File name"
          searchPlaceholder="Search repository files"
        />
        {isLoading ? <p className="text-muted-foreground text-xs">Loading files…</p> : null}
        <div className="change-composer-footer">
          <span>
            <Kbd>↑↓</Kbd> Choose
          </span>
          <span>
            <Kbd>↵</Kbd> Open blame
          </span>
          <span>
            <Kbd>⌫</Kbd> Back
          </span>
          <span>
            <Kbd>Esc</Kbd> Close
          </span>
        </div>
      </div>
    </CommandComposerLayout>
  );
}
