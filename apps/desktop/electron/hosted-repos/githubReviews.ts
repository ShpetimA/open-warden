import type {
  PullRequestReviewDraftCommentInput,
  SubmitPullRequestReviewCommentsResult,
} from "../../src/platform/desktop/contracts";

export function toGitHubReviewCommentInput(comment: PullRequestReviewDraftCommentInput) {
  return {
    body: comment.body,
    path: comment.path,
    line: comment.line,
    side: comment.side,
    ...(comment.startLine == null
      ? {}
      : {
          start_line: comment.startLine,
          start_side: comment.startSide ?? comment.side,
        }),
  };
}

type ReviewBody = Readonly<{
  event: "COMMENT";
  body: string;
  comments: ReturnType<typeof toGitHubReviewCommentInput>[];
}>;
type ReviewWriter = (pathname: string, body: ReviewBody) => Promise<unknown>;

export class GitHubReviewPublisher {
  private readonly writeReview: ReviewWriter;

  constructor(writeReview: ReviewWriter) {
    this.writeReview = writeReview;
  }

  async publish(input: {
    readonly owner: string;
    readonly repo: string;
    readonly pullRequestNumber: number;
    readonly comments: readonly PullRequestReviewDraftCommentInput[];
  }): Promise<SubmitPullRequestReviewCommentsResult> {
    if (input.comments.length > 0) {
      await this.writeReview(
        `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls/${input.pullRequestNumber}/reviews`,
        {
          event: "COMMENT",
          body: "",
          comments: input.comments.map(toGitHubReviewCommentInput),
        },
      );
    }

    return {
      submittedDraftIds: input.comments.map((comment) => comment.draftId),
      failedDraftId: null,
      failedMessage: null,
    };
  }
}
