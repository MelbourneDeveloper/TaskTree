import { test, expect } from '@playwright/test';

test.describe('SEO and Meta', () => {
  test('homepage has meta description', async ({ page }) => {
    await page.goto('/');
    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveAttribute('content', /.+/);
  });

  test('homepage has viewport meta tag', async ({ page }) => {
    await page.goto('/');
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute('content', /width/);
  });

  test('all pages have h1 heading', async ({ page }) => {
    const pages = ['/', '/docs/', '/blog/', '/docs/discovery/', '/docs/execution/', '/docs/configuration/'];
    for (const url of pages) {
      await page.goto(url);
      await expect(page.locator('h1').first()).toBeVisible();
    }
  });

  test('sitemap.xml exists', async ({ page }) => {
    const response = await page.goto('/sitemap.xml');
    expect(response?.status()).toBe(200);
  });

  test('robots.txt exists', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.status()).toBe(200);
  });

  test('RSS feed exists', async ({ page }) => {
    const response = await page.goto('/feed.xml');
    expect(response?.status()).toBe(200);
  });
});
