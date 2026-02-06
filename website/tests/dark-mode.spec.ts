import { test, expect } from '@playwright/test';

test.describe('Dark Mode', () => {
  test('dark mode toggle exists', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('[data-theme-toggle], .theme-toggle, button:has-text("🌙"), button:has-text("☀")');
    await expect(toggle.first()).toBeVisible();
  });

  test('clicking toggle changes theme attribute', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('[data-theme-toggle], .theme-toggle, button:has-text("🌙"), button:has-text("☀")');
    const html = page.locator('html');

    const initialTheme = await html.getAttribute('data-theme');
    await toggle.first().click();
    const newTheme = await html.getAttribute('data-theme');

    expect(newTheme).not.toEqual(initialTheme);
  });
});
