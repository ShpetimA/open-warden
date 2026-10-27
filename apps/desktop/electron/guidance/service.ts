import type {
  HostedRepoRef,
  PullRequestChangedFile,
  PullRequestChecksResult,
  PullRequestCompareRefs,
  PullRequestConversation,
  FileVersions,
  WorkspaceSession,
} from "../../src/platform/desktop/contracts";
import {
  guidanceFailure,
  guidanceLocatorSchema,
  guidanceMessageInputSchema,
  guidanceProgressSchema,
  publishGuidanceSchema,
  type GuidanceDocument,
  type GuidanceLocator,
  type GuidanceResult,
  type GuidanceNavigate,
} from "../../src/platform/desktop/guidance";
import { GuidanceStore } from "./store";

export interface GuidanceDependencies {
  store: GuidanceStore;
  loadWorkspaceSession(): Promise<WorkspaceSession>;
  resolveHostedRepo(repoPath: string): Promise<HostedRepoRef | null>;
  getPullRequestConversation(locator: GuidanceLocator): Promise<PullRequestConversation>;
  getPullRequestFiles(locator: GuidanceLocator): Promise<PullRequestChangedFile[]>;
  getPullRequestChecks(locator: GuidanceLocator): Promise<PullRequestChecksResult>;
  preparePullRequestCompareRefs(locator: GuidanceLocator): Promise<PullRequestCompareRefs>;
  getBranchFileVersions(
    repoPath: string,
    baseRef: string,
    headRef: string,
    relPath: string,
    previousPath?: string,
  ): Promise<FileVersions>;
  now(): string;
  id(): string;
  show(target: GuidanceNavigate): void;
}

export class GuidanceService {
  constructor(private readonly dependencies: GuidanceDependencies) {}

  async authorize(input: unknown): Promise<GuidanceResult<GuidanceLocator>> {
    const locator = guidanceLocatorSchema.safeParse(input);
    if (!locator.success)
      return guidanceFailure("invalid-input", "Provide a repository path and positive PR number.");
    try {
      const session = await this.dependencies.loadWorkspaceSession();
      if (!session.openRepos.includes(locator.data.repoPath))
        return guidanceFailure("not-open", "Open this repository in Open Warden first.");
      return { ok: true, value: locator.data };
    } catch {
      return guidanceFailure("storage", "Open repositories could not be read.");
    }
  }

  async listWorkspaces() {
    try {
      const session = await this.dependencies.loadWorkspaceSession();
      return {
        ok: true as const,
        value: {
          repositories: session.openRepos,
          pullRequests:
            session.workspaceTabs?.items.filter((item) => item.kind === "pull-request") ?? [],
        },
      };
    } catch {
      return guidanceFailure("storage", "Open repositories could not be read.");
    }
  }

  async read(input: unknown): Promise<GuidanceResult<GuidanceDocument | null>> {
    const locator = await this.authorize(input);
    return locator.ok ? this.dependencies.store.read(locator.value) : locator;
  }

  async context(input: unknown) {
    const locator = await this.authorize(input);
    if (!locator.ok) return locator;
    try {
      const [conversation, files, checks] = await Promise.all([
        this.dependencies.getPullRequestConversation(locator.value),
        this.dependencies.getPullRequestFiles(locator.value),
        this.dependencies.getPullRequestChecks(locator.value),
      ]);
      return {
        ok: true as const,
        value: {
          detail: conversation.detail,
          files,
          checks,
          issueComments: conversation.issueComments,
          reviewThreads: conversation.reviewThreads,
        },
      };
    } catch {
      return guidanceFailure(
        "provider",
        "Pull request context could not be loaded. Check the repository connection in Open Warden.",
      );
    }
  }

  async diff(input: unknown, filePath: string) {
    const locator = await this.authorize(input);
    if (!locator.ok) return locator;
    try {
      const files = await this.dependencies.getPullRequestFiles(locator.value);
      const file = files.find((file) => file.path === filePath);
      if (!file)
        return guidanceFailure("invalid-input", "Choose a changed file from get_review_context.");
      const refs = await this.dependencies.preparePullRequestCompareRefs(locator.value);
      const versions = await this.dependencies.getBranchFileVersions(
        locator.value.repoPath,
        refs.compareBaseRef,
        refs.compareHeadRef,
        file.path,
        file.previousPath ?? undefined,
      );
      return { ok: true as const, value: versions };
    } catch {
      return guidanceFailure("provider", "The file comparison could not be loaded.");
    }
  }

  async publish(input: unknown): Promise<GuidanceResult<GuidanceDocument>> {
    const parsed = publishGuidanceSchema.safeParse(input);
    if (!parsed.success)
      return guidanceFailure(
        "invalid-input",
        "Provide unique step IDs, explanations, and valid file/line references.",
      );
    const target = await this.authorize(parsed.data);
    if (!target.ok) return target;
    const value = parsed.data;
    try {
      const [conversation, files, hostedRepo] = await Promise.all([
        this.dependencies.getPullRequestConversation(target.value),
        this.dependencies.getPullRequestFiles(target.value),
        this.dependencies.resolveHostedRepo(target.value.repoPath),
      ]);
      if (!hostedRepo)
        return guidanceFailure("provider", "This repository has no supported hosted remote.");
      if (conversation.detail.headSha !== value.expectedHeadSha)
        return guidanceFailure(
          "stale-head",
          "The PR changed. Read the latest context before publishing guidance.",
        );
      const paths = new Set(files.map((file) => file.path));
      if (
        value.steps.some((step) => step.references.some((reference) => !paths.has(reference.path)))
      ) {
        return guidanceFailure(
          "invalid-input",
          "Every code reference must name a changed file from this PR.",
        );
      }
      return this.dependencies.store.update(target.value, (current) => {
        const sameHead = current?.headSha === value.expectedHeadSha;
        const stepIds = new Set(value.steps.map((step) => step.id));
        return {
          ok: true,
          value: {
            ...target.value,
            id: current?.id ?? this.dependencies.id(),
            providerId: hostedRepo.providerId,
            owner: hostedRepo.owner,
            repo: hostedRepo.repo,
            headSha: value.expectedHeadSha,
            title: value.title,
            summary: value.summary,
            steps: value.steps,
            selectedStepId:
              sameHead && current.selectedStepId && stepIds.has(current.selectedStepId)
                ? current.selectedStepId
                : (value.steps[0]?.id ?? null),
            reviewedStepIds: sameHead
              ? current.reviewedStepIds.filter((id) => stepIds.has(id))
              : [],
            messages: current?.messages ?? [],
            acknowledgedMessageIds: current?.acknowledgedMessageIds ?? [],
            updatedAt: this.dependencies.now(),
          },
        };
      });
    } catch {
      return guidanceFailure("provider", "The PR could not be checked before saving guidance.");
    }
  }

  async progress(input: unknown): Promise<GuidanceResult<GuidanceDocument>> {
    const parsed = guidanceProgressSchema.safeParse(input);
    if (!parsed.success) return guidanceFailure("invalid-input", "Provide a valid guidance step.");
    const locator = await this.authorize(parsed.data);
    if (!locator.ok) return locator;
    return this.dependencies.store.update(locator.value, (current) => {
      if (!current?.steps.some((step) => step.id === parsed.data.stepId))
        return guidanceFailure("not-found", "This guidance step no longer exists.");
      const reviewed = new Set(current.reviewedStepIds);
      if (parsed.data.reviewed === true) reviewed.add(parsed.data.stepId);
      if (parsed.data.reviewed === false) reviewed.delete(parsed.data.stepId);
      return {
        ok: true,
        value: {
          ...current,
          selectedStepId: parsed.data.stepId,
          reviewedStepIds: [...reviewed],
          updatedAt: this.dependencies.now(),
        },
      };
    });
  }

  async message(input: unknown, role: "user" | "agent"): Promise<GuidanceResult<GuidanceDocument>> {
    const parsed = guidanceMessageInputSchema.safeParse(input);
    if (!parsed.success)
      return guidanceFailure("invalid-input", "Write a message before saving it.");
    const locator = await this.authorize(parsed.data);
    if (!locator.ok) return locator;
    return this.dependencies.store.update(locator.value, (current) => {
      if (!current)
        return guidanceFailure("not-found", "Create a walkthrough before adding messages.");
      const step = current.steps.find((step) => step.id === parsed.data.stepId);
      if (parsed.data.stepId && !step)
        return guidanceFailure("not-found", "This guidance step no longer exists.");
      if (current.messages.length >= 1000)
        return guidanceFailure("invalid-input", "This walkthrough has reached its message limit.");
      return {
        ok: true,
        value: {
          ...current,
          updatedAt: this.dependencies.now(),
          messages: [
            ...current.messages,
            {
              id: this.dependencies.id(),
              role,
              body: parsed.data.body,
              stepId: parsed.data.stepId,
              stepTitle: step?.title ?? null,
              headSha: current.headSha,
              createdAt: this.dependencies.now(),
            },
          ],
        },
      };
    });
  }

  async acknowledge(
    input: unknown,
    messageIds: string[],
  ): Promise<GuidanceResult<GuidanceDocument>> {
    const locator = await this.authorize(input);
    if (!locator.ok) return locator;
    return this.dependencies.store.update(locator.value, (current) => {
      if (!current) return guidanceFailure("not-found", "This walkthrough no longer exists.");
      const valid = new Set(
        current.messages.filter((message) => message.role === "user").map((message) => message.id),
      );
      if (messageIds.some((id) => !valid.has(id)))
        return guidanceFailure("invalid-input", "A message does not belong to this walkthrough.");
      return {
        ok: true,
        value: {
          ...current,
          acknowledgedMessageIds: [...new Set([...current.acknowledgedMessageIds, ...messageIds])],
          updatedAt: this.dependencies.now(),
        },
      };
    });
  }

  async inbox() {
    try {
      const session = await this.dependencies.loadWorkspaceSession();
      const documents = await this.dependencies.store.list();
      if (!documents.ok) return documents;
      return {
        ok: true as const,
        value: documents.value
          .filter((guide) => session.openRepos.includes(guide.repoPath))
          .map((guide) => ({
            repoPath: guide.repoPath,
            pullRequestNumber: guide.pullRequestNumber,
            title: guide.title,
            headSha: guide.headSha,
            messages: guide.messages.filter(
              (message) =>
                message.role === "user" && !guide.acknowledgedMessageIds.includes(message.id),
            ),
          }))
          .filter((item) => item.messages.length > 0),
      };
    } catch {
      return guidanceFailure("storage", "The guidance inbox could not be read.");
    }
  }

  async show(input: unknown): Promise<GuidanceResult<GuidanceDocument>> {
    const updated = await this.progress(input);
    if (updated.ok) this.dependencies.show(updated.value);
    return updated;
  }
}
