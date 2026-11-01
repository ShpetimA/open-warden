import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { openWorkflowRepository } from "./workflowFixture";

for (const theme of ["light", "dark"] as const) {
  test(`failed pushes show hook output and recover after an external push in ${theme}`, async ({
    playwright,
  }, testInfo) => {
    const fixture = await openWorkflowRepository(playwright._electron, testInfo, theme, {
      async prepare(repo, git) {
        const remote = path.join(repo, "..", "origin.git");
        execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
        git("remote", "add", "origin", remote);
        git("push", "-u", "origin", "main");
        await writeFile(path.join(repo, "invoice.ts"), "export const minimumAmount = 0;\n");
        git("add", "invoice.ts");
        git("commit", "-m", "Validate zero amounts");

        await writeFile(path.join(repo, ".git/push-attempts"), "");
        await writeFile(
          path.join(repo, ".git/hooks/pre-push"),
          [
            "#!/bin/sh",
            "echo attempt >> .git/push-attempts",
            "echo 'pre-push: invoice validation failed'",
            "echo 'Git lock test exceeded 5000ms' >&2",
            "exit 1",
            "",
          ].join("\n"),
          { mode: 0o755 },
        );
      },
    });
    const { page, repo, git } = fixture;

    try {
      const message = page.getByRole("textbox", { name: "Commit message", exact: true });
      await expect(message).toBeVisible();
      await message.fill("Keep this draft while I push");
      await page.getByRole("button", { name: "Push commits", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Confirm Push", exact: true }).click();

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await expect
          .poll(
            async () =>
              (await readFile(path.join(repo, ".git/push-attempts"), "utf8"))
                .trim()
                .split("\n")
                .filter(Boolean).length,
          )
          .toBe(attempt);
        await expect(dialog.getByRole("alert")).toContainText(
          "Git couldn’t complete this operation",
        );

        if (attempt < 3) await dialog.getByRole("button", { name: "Retry", exact: true }).click();
      }

      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(page.getByText("Couldn’t push commits", { exact: true })).toBeVisible();
      await expect(page.getByText("Couldn’t update this commit", { exact: true })).toHaveCount(0);
      await page.getByText("Details", { exact: true }).click();
      await expect(page.getByText(/Git output:/)).toContainText(
        "pre-push: invoice validation failed",
      );
      await expect(page.getByText(/Git output:/)).toContainText("Git lock test exceeded 5000ms");
      await page.screenshot({ path: testInfo.outputPath(`push-failure-${theme}.png`) });

      await writeFile(path.join(repo, ".git/hooks/pre-push"), "#!/bin/sh\nexit 0\n", {
        mode: 0o755,
      });
      git("push");
      await page.getByRole("button", { name: "Refresh status", exact: true }).click();
      await expect(page.getByText("Couldn’t push commits", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Push commits", exact: true })).toBeDisabled();
      await expect(message).toHaveValue("Keep this draft while I push");
      await page.screenshot({ path: testInfo.outputPath(`push-recovered-${theme}.png`) });
    } finally {
      await fixture.close();
    }
  });
}
