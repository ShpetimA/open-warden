import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { openWorkflowRepository } from "./workflowFixture";

for (const theme of ["light", "dark"] as const) {
  test(`discovers real stashes, tags, worktrees and line authors in ${theme}`, async ({
    playwright,
  }, testInfo) => {
    const fixture = await openWorkflowRepository(playwright._electron, testInfo, theme, {
      prepare: async (repo, git) => {
        git("tag", "v1.0.0");
        await writeFile(
          path.join(repo, "invoice.ts"),
          "export const minimumAmount = 0;\nexport const currency = 'EUR';\n",
        );
        git("stash", "push", "-m", "Invoice validation draft");
        git("branch", "feature/preview");
        const worktree = path.join(path.dirname(repo), "invoice-preview");
        git("worktree", "add", worktree, "feature/preview");
      },
    });
    const { page, git } = fixture;

    try {
      await page.getByRole("button", { name: "Stashes: 1", exact: true }).click();
      await page.getByRole("menuitem", { name: "Apply stash…", exact: true }).click();
      await page.getByRole("button").filter({ hasText: "Invoice validation draft" }).click();
      await expect(
        page.getByRole("button", { name: "Confirm Apply stash", exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`stash-preview-${theme}.png`) });
      await page.keyboard.press("Meta+k");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      expect(git("stash", "list")).toContain("Invoice validation draft");
      expect(git("status", "--porcelain")).toBe("");

      await page.getByRole("button", { name: "Tags: 1", exact: true }).click();
      await page.getByRole("menuitem", { name: "Browse tags…", exact: true }).click();
      await page
        .getByRole("list", { name: "Local tags", exact: true })
        .getByRole("listitem")
        .filter({ hasText: "v1.0.0" })
        .click();
      await expect(page.getByText("History commits", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Worktrees: 2", exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath(`worktrees-${theme}.png`) });
      await page.getByRole("menuitem").filter({ hasText: "feature/preview" }).click();
      await expect(
        page.getByRole("button", { name: "Switch branch: feature/preview", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Repository files", exact: true }).click();
      await page
        .getByRole("treeitem", { name: "invoice.ts", exact: true })
        .click({ button: "right" });
      await page.getByRole("menuitem", { name: "Show line authors (blame)", exact: true }).click();
      await expect(page.getByRole("button", { name: "Blame", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(
        page.getByRole("button", {
          name: "Lines 1–2: Alice · Add invoice calculation",
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`line-authors-${theme}.png`) });
    } catch (error) {
      await page.screenshot({ path: testInfo.outputPath("failure.png") });
      throw error;
    } finally {
      await fixture.close();
    }
  });
}
