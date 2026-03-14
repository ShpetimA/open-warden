import { expect, test } from "@playwright/test";

test("loads desktop shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/desktop/i);
});

test("navigates with top-level feature tabs", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "History" }).click();
  await expect(page).toHaveURL(/#\/history/);

  await page.getByRole("button", { name: "Review" }).click();
  await expect(page).toHaveURL(/#\/review/);
});

test("opens command palette with keyboard shortcut", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await expect(page.getByPlaceholder("Search files, commands, or commits...")).toBeVisible();
});
