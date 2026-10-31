import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { openWorkflowRepository } from "./workflowFixture";

for (const theme of ["light", "dark"] as const) {
  test(`compact settings preserve preferences and expose advanced tools in ${theme}`, async ({
    playwright,
  }, testInfo) => {
    const fixture = await openWorkflowRepository(playwright._electron, testInfo, theme);
    const { page } = fixture;

    try {
      await page.goto("http://127.0.0.1:1420/#/settings");
      await expect(page.getByRole("tab", { name: "Preferences", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.getByRole("heading", { name: "Theme", exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Agent connection" })).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Open settings file", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "List", exact: true }).click();
      await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await page.getByRole("tab", { name: "Advanced", exact: true }).click();
      const openFile = page.getByRole("button", { name: "Open settings file", exact: true });
      await expect(openFile).toBeEnabled();
      const settingsPath = await page.evaluate(async () => {
        const result = await window.desktopBridge?.getAppSettingsPath();
        if (!result?.ok) throw new Error("Settings path is unavailable");
        return result.value;
      });
      await expect
        .poll(async () => JSON.parse(await readFile(settingsPath, "utf8")))
        .toMatchObject({ sourceControl: { fileTreeRenderMode: "list" } });
      await page.reload();
      await expect(page).toHaveURL(/changes/);
      await page.getByRole("button", { name: "Open settings", exact: true }).click();
      await expect(page.getByRole("tab", { name: "Preferences", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await page.getByRole("button", { name: "Dark theme", exact: true }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.reload();
      await expect(page).toHaveURL(/changes/);
      await page.getByRole("button", { name: "Open settings", exact: true }).click();
      await expect(page.getByRole("button", { name: "Dark theme", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.getByRole("button", { name: "System theme", exact: true }).click();
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
      await page.getByRole("button", { name: "Tree", exact: true }).click();
      await expect
        .poll(async () => JSON.parse(await readFile(settingsPath, "utf8")))
        .toMatchObject({ sourceControl: { fileTreeRenderMode: "tree" } });
      await page.screenshot({ path: testInfo.outputPath(`settings-after-${theme}.png`) });

      await page.getByRole("tab", { name: "Shortcuts", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Keyboard shortcuts", exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`settings-shortcuts-${theme}.png`) });
      await page.getByRole("tab", { name: "Integrations", exact: true }).click();
      await expect(page.getByRole("region", { name: "Agent connection" })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`settings-integrations-${theme}.png`) });
      await page.getByRole("tab", { name: "Advanced", exact: true }).click();
      await expect(openFile).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath(`settings-advanced-${theme}.png`) });
      await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
      await expect(page).not.toHaveURL(/settings/);
    } finally {
      await fixture.close();
    }
  });
}
