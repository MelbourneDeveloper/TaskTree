import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('header nav has docs, blog, and github links', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('header nav, header .nav-links, header');
    await expect(nav.locator('a[href="/docs/"]')).toBeVisible();
    await expect(nav.locator('a[href="/blog/"]')).toBeVisible();
    await expect(nav.locator('a[href*="github.com"]')).toBeVisible();
  });

  test('docs link navigates to docs page', async ({ page }) => {
    await page.goto('/');
    await page.click('header a[href="/docs/"]');
    await expect(page).toHaveURL('/docs/');
    await expect(page.locator('h1')).toContainText('Getting Started');
  });

  test('blog link navigates to blog page', async ({ page }) => {
    await page.goto('/');
    await page.click('header a[href="/blog/"]');
    await expect(page).toHaveURL('/blog/');
  });

  test('homepage logo/brand links to home', async ({ page }) => {
    await page.goto('/docs/');
    const brandLink = page.locator('header a[href="/"]');
    if (await brandLink.count() > 0) {
      await brandLink.first().click();
      await expect(page).toHaveURL('/');
    }
  });

  test('footer contains documentation and community links', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer.locator('a[href="/docs/"]')).toBeVisible();
    await expect(footer.locator('a[href*="github.com"]')).toBeVisible();
    await expect(footer.locator('a[href*="marketplace.visualstudio.com"]')).toBeVisible();
  });
});
