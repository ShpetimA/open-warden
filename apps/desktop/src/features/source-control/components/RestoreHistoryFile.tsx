import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { desktop } from "@/platform/desktop";
import { useRunGitCommandMutation } from "../gitOperationsApi";
export function RestoreHistoryFile({
  repoPath,
  commit,
  path,
}: {
  repoPath: string;
  commit: string;
  path: string;
}) {
  const [execute, mutation] = useRunGitCommandMutation({ fixedCacheKey: repoPath });
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Restore selected file"
      disabled={mutation.isLoading}
      title={`Restore ${path} from ${commit.slice(0, 8)}`}
      onClick={() => {
        void desktop
          .confirm(
            `Restore ${path} from ${commit.slice(0, 8)} into the working tree? The result will be an uncommitted change.`,
            { title: "Restore file revision", okLabel: "Restore" },
          )
          .then((confirmed) => {
            if (confirmed.ok && confirmed.value)
              return execute({ repoPath, command: { kind: "restore-file", commit, path } });
          });
      }}
    >
      <RotateCcw className="size-3.5" />
    </Button>
  );
}
