import { test, expect } from '@playwright/test';

test.describe('Documentation', () => {
  test('getting started page loads', async ({ page }) => {
    await page.goto('/docs/');
    await expect(page).toHaveTitle(/Getting Started/);
    await expect(page.locator('h1')).toContainText('Getting Started');
  });

  test('getting started has installation instructions', async ({ page }) => {
    await page.goto('/docs/');
    await expect(page.locator('text=Installation')).toBeVisible();
    await expect(page.locator('text=nimblesite.commandtree')).toBeVisible();
  });

  test('getting started has discovery table', async ({ page }) => {
    await page.goto('/docs/');
    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('Shell Scripts');
    await expect(table).toContainText('NPM Scripts');
    await expect(table).toContainText('Makefile Targets');
  });

  test('discovery page loads with all sections', async ({ page }) => {
    await page.goto('/docs/discovery/');
    await expect(page.locator('h1')).toContainText('Discovery');
    await expect(page.locator('text=Shell Scripts')).toBeVisible();
    await expect(page.locator('text=NPM Scripts')).toBeVisible();
    await expect(page.locator('text=Makefile Targets')).toBeVisible();
    await expect(page.locator('text=Launch Configurations')).toBeVisible();
    await expect(page.locator('text=Python Scripts')).toBeVisible();
  });

  test('execution page loads with all sections', async ({ page }) => {
    await page.goto('/docs/execution/');
    await expect(page.locator('h1')).toContainText('Execution');
    await expect(page.locator('text=Run in New Terminal')).toBeVisible();
    await expect(page.locator('text=Run in Current Terminal')).toBeVisible();
    await expect(page.locator('.docs-content h2', { hasText: 'Debug' })).toBeVisible();
  });

  test('execution page has commands table', async ({ page }) => {
    await page.goto('/docs/execution/');
    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('commandtree.run');
    await expect(table).toContainText('commandtree.debug');
  });

  test('configuration page loads with all sections', async ({ page }) => {
    await page.goto('/docs/configuration/');
    await expect(page.locator('h1')).toContainText('Configuration');
    await expect(page.locator('text=Exclude Patterns')).toBeVisible();
    await expect(page.locator('text=Sort Order')).toBeVisible();
    await expect(page.locator('text=Quick Tasks')).toBeVisible();
    await expect(page.locator('text=Tagging')).toBeVisible();
    await expect(page.locator('text=Filtering')).toBeVisible();
  });

  test('configuration page has sort order table', async ({ page }) => {
    await page.goto('/docs/configuration/');
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(table).toContainText('folder');
    await expect(table).toContainText('name');
    await expect(table).toContainText('type');
  });
});
