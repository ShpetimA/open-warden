import type { MentionConfig } from "@/components/markdown/MarkdownEditor";
import type { DiffLineAnnotation } from "@pierre/diffs";

import { PullRequestWindowedDiff } from "@/features/pull-requests/components/PullRequestWindowedDiff";
import type {
  CommentContext,
  DiffAnnotationItem,
  DiffFile,
  PullRequestReviewAnchor,
} from "@/features/source-control/types";

type PullRequestAnchorSnippetProps = {
  oldFile: DiffFile | null;
  newFile: DiffFile | null;
  activePath: string;
  commentContext: CommentContext;
  anchor: PullRequestReviewAnchor;
  annotationItems: DiffLineAnnotation<DiffAnnotationItem>[];
  commentMentions?: MentionConfig;
};

export function PullRequestAnchorSnippet({
  oldFile,
  newFile,
  activePath,
  commentContext,
  anchor,
  annotationItems,
  commentMentions,
}: PullRequestAnchorSnippetProps) {
  return (
    <div className="overflow-hidden rounded-md">
      <div className="min-h-0">
        <PullRequestWindowedDiff
          oldFile={oldFile}
          newFile={newFile}
          activePath={activePath}
          commentContext={commentContext}
          annotationItems={annotationItems}
          commentMentions={commentMentions}
          windowedAnchor={{
            side: anchor.side,
            startLine: anchor.startLine,
            endLine: anchor.endLine,
            contextLines: 4,
          }}
        />
      </div>
    </div>
  );
}
