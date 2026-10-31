import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  branch: string;
  number: number;
  title: string;
  onClick: () => void;
};

export function BranchPullRequestButton({ branch, number, title, onClick }: Props) {
  const label = `Open PR #${number} for current branch ${branch}: ${title}`;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-primary bg-primary/10 size-10 flex-col gap-0.5"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <GitBranch className="size-4" aria-hidden="true" />
      <span className="max-w-full truncate px-0.5 text-[10px] leading-3 tabular-nums">
        #{number}
      </span>
    </Button>
  );
}
