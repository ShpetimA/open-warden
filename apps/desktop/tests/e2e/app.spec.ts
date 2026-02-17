import { expect, test } from '@playwright/test'

test('loads desktop shell', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/desktop/i)
})
