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
    await expect(table).toContainText('VS Code Tasks');
    await expect(table).toContainText('Launch Configs');
    await expect(table).toContainText('Python Scripts');
    await expect(table).toContainText('PowerShell Scripts');
    await expect(table).toContainText('Gradle Tasks');
    await expect(table).toContainText('Cargo Tasks');
    await expect(table).toContainText('Maven Goals');
    await expect(table).toContainText('Ant Targets');
    await expect(table).toContainText('Just Recipes');
    await expect(table).toContainText('Taskfile Tasks');
    await expect(table).toContainText('Deno Tasks');
    await expect(table).toContainText('Rake Tasks');
    await expect(table).toContainText('Composer Scripts');
    await expect(table).toContainText('Docker Compose');
    await expect(table).toContainText('.NET Projects');
    await expect(table).toContainText('Markdown Files');
  });

  test('discovery page loads with all sections', async ({ page }) => {
    await page.goto('/docs/discovery/');
    await expect(page.locator('h1')).toContainText('Discovery');
    const sections = [
      'Shell Scripts', 'NPM Scripts', 'Makefile Targets', 'Launch Configurations',
      'Python Scripts', 'PowerShell Scripts', 'Gradle Tasks', 'Cargo Tasks',
      'Maven Goals', 'Ant Targets', 'Just Recipes', 'Taskfile Tasks',
      'Deno Tasks', 'Rake Tasks', 'Composer Scripts', 'Docker Compose',
      '.NET Projects', 'Markdown Files',
    ];
    for (const name of sections) {
      await expect(page.getByRole('heading', { name, exact: true, level: 2 })).toBeVisible();
    }
  });

  test('execution page loads with all sections', async ({ page }) => {
    await page.goto('/docs/execution/');
    await expect(page.locator('h1')).toContainText('Execution');
    await expect(page.locator('h2', { hasText: 'Run in New Terminal' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Run in Current Terminal' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Debug' })).toBeVisible();
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
    await expect(page.locator('h2', { hasText: 'Settings' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Quick Launch' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Tagging' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Filtering' })).toBeVisible();
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
