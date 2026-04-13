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

test("opens command palette from the header action", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Open command palette" }).click();
  await expect(page.getByPlaceholder("Search files, commands, or commits...")).toBeVisible();
});
