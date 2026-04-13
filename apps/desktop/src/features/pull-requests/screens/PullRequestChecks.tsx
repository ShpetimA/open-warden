import { PreviewPlaceholder } from "@/features/pull-requests/components/PreviewPlaceholder";
import { ShieldCheck } from "lucide-react";

export const PullRequestChecks = () => {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col">
          <PreviewPlaceholder
            icon={ShieldCheck}
            title="Checks preview is next"
            description="Checks will live here in the preview shell. For now, open the PR locally to continue review."
          />
        </div>
      </div>
    </div>
  );
};
