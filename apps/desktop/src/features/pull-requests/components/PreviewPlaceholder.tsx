import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { GitPullRequest } from "lucide-react";
import type { ReactNode } from "react";

export function PreviewPlaceholder({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof GitPullRequest;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-105 items-center justify-center px-6 py-8">
      <Empty className="max-w-115 border-0 bg-transparent">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon className="h-5 w-5" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {action ? <div>{action}</div> : null}
      </Empty>
    </div>
  );
}
