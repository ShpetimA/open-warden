import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { storedWorkspaceSessionSchema } from "../../src/platform/desktop/workspaceSession";
import { openWorkflowRepository } from "./workflowFixture";

test("review drafts survive repeated desktop reloads and native session writes", async ({
  playwright,
}, testInfo) => {
  const draft = {
    pullRequestNumber: 114,
    decision: "request-changes" as const,
    message: "Please handle zero amounts before merging.",
    publishedMessage: "A confirmed Bitbucket note",
  };
  const fixture = await openWorkflowRepository(playwright._electron, testInfo, "light", {
    reviewDrafts: [draft],
  });
  const { page, repo, profile } = fixture;

  try {
    await expect(page.getByRole("region", { name: "Commit changes" })).toBeVisible();
    for (let restart = 0; restart < 2; restart += 1) {
      await page.reload();
      await expect(page.getByRole("region", { name: "Commit changes" })).toBeVisible();
      const saved = storedWorkspaceSessionSchema.parse(
        JSON.parse(await readFile(path.join(profile, "workspace-session.json"), "utf8")),
      );
      expect(saved.reviewDrafts).toEqual([{ ...draft, repoPath: repo }]);
    }
  } finally {
    await fixture.close();
  }
});
