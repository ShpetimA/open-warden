import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { openWorkflowRepository } from "./workflowFixture";

for (const theme of ["light", "dark"] as const) {
  test(`file pane filters share counts, recovery and rendered mutation order in ${theme}`, async ({
    playwright,
  }, testInfo) => {
    const fixture = await openWorkflowRepository(playwright._electron, testInfo, theme);
    const { page, repo, git } = fixture;

    try {
      await writeFile(
        path.join(repo, "invoice.ts"),
        "export const minimumAmount = 0;\nexport const currency = 'EUR';\n",
      );
      await writeFile(
        path.join(repo, "test/invoice.test.ts"),
        "export const amounts = [0, 1, 2, 3];\n",
      );
      const filter = page.getByRole("textbox", { name: "Filter files", exact: true });
      await expect(page.getByText("2 files", { exact: true })).toBeVisible();
      await filter.fill("test/");
      await expect(page.getByText("1/2 files", { exact: true })).toBeVisible();
      await page.getByRole("treeitem", { name: "Changes", exact: true }).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Stage all", exact: true }).click();
      await expect.poll(() => git("diff", "--cached", "--name-only")).toBe("test/invoice.test.ts");
      await filter.fill("missing");
      await expect(page.getByText("No matching files", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Clear file filter", exact: true }).click();
      await expect(filter).toBeFocused();
      await expect(page.getByText("2 files", { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`changes-files-${theme}.png`) });

      await page.getByRole("button", { name: "Repository files", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Repository files", exact: true }),
      ).toBeVisible();
      await filter.fill("invoice.ts");
      await expect(page.getByText("1/2 files", { exact: true })).toBeVisible();
      await page.getByRole("treeitem", { name: "invoice.ts", exact: true }).click();
      const fileUrl = page.url();
      await filter.fill("missing");
      await expect(page.getByText("No matching files", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Clear filter", exact: true }).click();
      expect(page.url()).toBe(fileUrl);
      await expect(
        page.getByRole("button", { name: "New file or folder", exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`repository-files-${theme}.png`) });

      await page.getByRole("button", { name: "History", exact: true }).click();
      await page.getByText("Add invoice calculation", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Commit files", exact: true })).toBeVisible();
      await filter.fill("invoice.ts");
      await expect(page.getByText("1/2 files", { exact: true })).toBeVisible();
      await page.getByRole("treeitem", { name: "invoice.ts", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Restore selected file", exact: true }),
      ).toBeVisible();
      await expect(page.locator("diffs-container")).toContainText(
        "export const minimumAmount = 1;",
      );
      await page.screenshot({ path: testInfo.outputPath(`history-files-${theme}.png`) });
    } catch (error) {
      await page.screenshot({ path: testInfo.outputPath("failure.png") });
      throw error;
    } finally {
      await fixture.close();
    }
  });
}
