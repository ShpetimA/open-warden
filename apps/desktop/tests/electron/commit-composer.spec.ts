import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { openWorkflowRepository } from "./workflowFixture";

for (const theme of ["light", "dark"] as const) {
  test(`compact commit composer retains drafts, commits, amends and undoes in ${theme}`, async ({
    playwright,
  }, testInfo) => {
    const fixture = await openWorkflowRepository(playwright._electron, testInfo, theme);
    const { page, git, repo } = fixture;

    try {
      const composer = page.getByRole("region", { name: "Commit changes" });
      const message = page.getByRole("textbox", { name: "Commit message", exact: true });
      const amend = composer.getByRole("checkbox", { name: "Amend last commit" });
      const undo = composer.getByRole("button", { name: "Undo commit", exact: true });

      await expect(message).toBeVisible();
      await expect(amend).toBeVisible();
      await expect(undo).toBeVisible();
      expect((await composer.boundingBox())?.height).toBeLessThan(180);
      await page.screenshot({ path: testInfo.outputPath(`commit-clean-${theme}.png`) });
      await message.fill("Validate invoice amounts\n\nReject negative values before saving.");

      await writeFile(
        path.join(repo, "invoice.ts"),
        "export const minimumAmount = 0;\nexport const currency = 'EUR';\n",
      );
      git("add", "invoice.ts");
      await expect(
        composer.getByRole("button", { name: "Commit changes", exact: true }),
      ).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath(`commit-draft-${theme}.png`) });
      await message.press("Meta+Enter");
      await expect.poll(() => git("log", "-1", "--format=%s")).toBe("Validate invoice amounts");
      await expect(message).toHaveValue("");

      await expect(amend).toHaveAttribute("aria-description", "Amend “Validate invoice amounts”");
      await amend.check();
      await expect(message).toHaveValue(
        "Validate invoice amounts\n\nReject negative values before saving.\n",
      );
      await message.fill("Validate all invoice amounts");
      await composer.getByRole("button", { name: "Amend changes", exact: true }).click();
      await expect.poll(() => git("log", "-1", "--format=%s")).toBe("Validate all invoice amounts");
      await expect(message).toHaveValue("");
      await expect(undo).toHaveAttribute(
        "aria-description",
        "Undo “Validate all invoice amounts” and keep its changes staged",
      );
      await undo.click();
      await expect.poll(() => git("log", "-1", "--format=%s")).toBe("Add invoice calculation");
      await expect(message).toHaveValue("Validate all invoice amounts\n");
      expect(git("diff", "--cached", "--name-only")).toBe("invoice.ts");
      await expect(undo).toHaveAttribute(
        "aria-description",
        "Undo “Add invoice calculation” and keep its changes staged",
      );
      await undo.click();
      await expect(page.getByText("Couldn’t undo this commit", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Refresh status", exact: true })).toBeVisible();
      await expect(message).toHaveValue("Validate all invoice amounts\n");
      expect(git("diff", "--cached", "--name-only")).toBe("invoice.ts");
      await page.screenshot({ path: testInfo.outputPath(`commit-recovery-${theme}.png`) });
    } catch (error) {
      await page.screenshot({ path: testInfo.outputPath("failure.png") });
      throw error;
    } finally {
      await fixture.close();
    }
  });
}
