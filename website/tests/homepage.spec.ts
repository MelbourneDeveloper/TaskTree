import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/CommandTree/);
  });

  test('hero section displays branding', async ({ page }) => {
    const hero = page.locator('.hero');
    await expect(hero).toBeVisible();
    await expect(hero.locator('h1')).toBeVisible();
    await expect(hero.locator('.hero-logo')).toBeVisible();
    await expect(hero.locator('.hero-tagline')).toBeVisible();
  });

  test('hero has install and docs buttons', async ({ page }) => {
    const installBtn = page.locator('.hero-actions .btn-primary');
    const docsBtn = page.locator('.hero-actions .btn-secondary');
    await expect(installBtn).toBeVisible();
    await expect(installBtn).toHaveAttribute('href', /marketplace\.visualstudio\.com/);
    await expect(docsBtn).toBeVisible();
    await expect(docsBtn).toHaveAttribute('href', '/docs/');
  });

  test('install command is shown', async ({ page }) => {
    const installCmd = page.locator('.install-cmd');
    await expect(installCmd).toBeVisible();
    await expect(installCmd).toContainText('ext install nimblesite.commandtree');
  });

  test('features section shows all 7 feature cards', async ({ page }) => {
    const featureCards = page.locator('.feature-card');
    await expect(featureCards).toHaveCount(7);

    const expectedFeatures = [
      'AI Summaries',
      'Auto-Discovery',
      'Quick Launch',
      'Tagging',
      'Filtering',
      'Run Anywhere',
      'Folder Grouping',
    ];
    for (const name of expectedFeatures) {
      await expect(page.locator('.feature-card', { hasText: name })).toBeVisible();
    }
  });

  test('command types section shows all 19 types', async ({ page }) => {
    const commandTypes = page.locator('.command-type');
    await expect(commandTypes).toHaveCount(19);

    const expectedTypes = [
      'Shell Scripts',
      'NPM Scripts',
      'Makefile Targets',
      'VS Code Tasks',
      'Launch Configs',
      'Python Scripts',
      'PowerShell Scripts',
      'Gradle Tasks',
      'Cargo Tasks',
      'Maven Goals',
      'Ant Targets',
      'Just Recipes',
      'Taskfile Tasks',
      'Deno Tasks',
      'Rake Tasks',
      'Composer Scripts',
      'Docker Compose',
      '.NET Projects',
      'Markdown Files',
    ];
    for (const name of expectedTypes) {
      await expect(page.getByRole('heading', { name, exact: true, level: 4 })).toBeVisible();
    }
  });

  test('CTA section has marketplace link', async ({ page }) => {
    const cta = page.locator('.cta-section');
    await expect(cta).toBeVisible();
    const ctaLink = cta.locator('a.btn-primary');
    await expect(ctaLink).toHaveAttribute('href', /marketplace\.visualstudio\.com/);
  });
});
