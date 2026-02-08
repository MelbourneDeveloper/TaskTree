import { test, expect } from '@playwright/test';

const ALL_PAGES = [
  '/',
  '/docs/',
  '/docs/ai-summaries/',
  '/docs/discovery/',
  '/docs/execution/',
  '/docs/configuration/',
  '/blog/',
];

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
    for (const url of ALL_PAGES) {
      await page.goto(url);
      await expect(page.locator('h1').first()).toBeVisible();
    }
  });

  test('all pages have unique meta descriptions', async ({ page }) => {
    const descriptions: string[] = [];
    for (const url of ALL_PAGES) {
      await page.goto(url);
      const content = await page.locator('meta[name="description"]').getAttribute('content');
      expect(content, `${url} should have a meta description`).toBeTruthy();
      expect(content!.length, `${url} description should be at least 50 chars`).toBeGreaterThanOrEqual(50);
      descriptions.push(content!);
    }
    const unique = new Set(descriptions);
    expect(unique.size, 'All pages should have unique meta descriptions').toBe(descriptions.length);
  });

  test('all pages have unique titles', async ({ page }) => {
    const titles: string[] = [];
    for (const url of ALL_PAGES) {
      await page.goto(url);
      const title = await page.title();
      expect(title, `${url} should have a title`).toBeTruthy();
      titles.push(title);
    }
    const unique = new Set(titles);
    expect(unique.size, 'All pages should have unique titles').toBe(titles.length);
  });

  test('all pages have Open Graph tags', async ({ page }) => {
    for (const url of ALL_PAGES) {
      await page.goto(url);
      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
      const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
      const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
      expect(ogTitle, `${url} should have og:title`).toBeTruthy();
      expect(ogDesc, `${url} should have og:description`).toBeTruthy();
      expect(ogUrl, `${url} should have og:url`).toBeTruthy();
    }
  });

  test('all pages have canonical URL', async ({ page }) => {
    for (const url of ALL_PAGES) {
      await page.goto(url);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical, `${url} should have a canonical URL`).toBeTruthy();
      expect(canonical, `${url} canonical should be absolute`).toContain('https://');
    }
  });

  test('all pages have valid JSON-LD structured data', async ({ page }) => {
    for (const url of ALL_PAGES) {
      await page.goto(url);
      const scripts = page.locator('script[type="application/ld+json"]');
      const count = await scripts.count();
      expect(count, `${url} should have JSON-LD`).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < count; i++) {
        const text = await scripts.nth(i).textContent();
        expect(() => JSON.parse(text!), `${url} JSON-LD should be valid JSON`).not.toThrow();
      }
    }
  });

  test('homepage has og:image', async ({ page }) => {
    await page.goto('/');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage, 'Homepage should have og:image').toBeTruthy();
  });

  test('doc pages have FAQ sections', async ({ page }) => {
    const docPages = ['/docs/', '/docs/ai-summaries/', '/docs/discovery/', '/docs/execution/', '/docs/configuration/'];
    for (const url of docPages) {
      await page.goto(url);
      const faqHeading = page.locator('h2', { hasText: 'Frequently Asked Questions' });
      await expect(faqHeading, `${url} should have FAQ section`).toBeVisible();
    }
  });

  test('images have alt text', async ({ page }) => {
    await page.goto('/');
    const images = page.locator('img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute('alt');
      expect(alt, `Image ${i} should have alt text`).toBeTruthy();
      expect(alt!.length, `Image ${i} alt text should be descriptive`).toBeGreaterThan(3);
    }
  });

  test('llms.txt exists and has no dead links', async ({ page }) => {
    const response = await page.goto('/llms.txt');
    expect(response?.status()).toBe(200);
    const text = await page.textContent('body');
    expect(text, 'llms.txt should not reference /api/').not.toContain('/api/');
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
