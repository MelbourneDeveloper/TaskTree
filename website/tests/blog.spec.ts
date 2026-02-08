import { test, expect } from '@playwright/test';

test.describe('Blog', () => {
  test('blog index page loads', async ({ page }) => {
    await page.goto('/blog/');
    await expect(page).toHaveTitle(/Blog/);
  });

  test('blog index lists the introducing post', async ({ page }) => {
    await page.goto('/blog/');
    await expect(page.locator('text=Introducing CommandTree')).toBeVisible();
  });

  test('introducing post page loads', async ({ page }) => {
    await page.goto('/blog/introducing-commandtree/');
    await expect(page.locator('h1').first()).toContainText('Introducing CommandTree');
  });

  test('introducing post has hero banner with logo', async ({ page }) => {
    await page.goto('/blog/introducing-commandtree/');
    const banner = page.locator('.blog-hero-banner');
    await expect(banner).toBeVisible();
    const logo = banner.locator('img.blog-hero-logo');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('src', '/assets/images/logo.png');
  });

  test('introducing post has problem and solution sections', async ({ page }) => {
    await page.goto('/blog/introducing-commandtree/');
    await expect(page.locator('text=The Problem')).toBeVisible();
    await expect(page.locator('text=The Solution')).toBeVisible();
  });

  test('introducing post has get started section with marketplace link', async ({ page }) => {
    await page.goto('/blog/introducing-commandtree/');
    await expect(page.locator('text=Get Started')).toBeVisible();
    await expect(page.locator('a[href*="marketplace.visualstudio.com"]').first()).toBeVisible();
  });
});
