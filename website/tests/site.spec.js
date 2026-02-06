import { test, expect } from "@playwright/test";

test.describe("Virtual templates from plugin", () => {
  test("llms.txt exists", async ({ request }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);
  });
});

test.describe("Assets", () => {
  test("logo image loads", async ({ request }) => {
    const response = await request.get("/assets/images/logo.png");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image");
  });

  test("CSS loads with animations and design tokens", async ({ request }) => {
    const response = await request.get("/assets/css/styles.css");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("--color-primary");
    expect(body).toContain("fadeInUp");
    expect(body).toContain("float");
    expect(body).toContain("pulse-glow");
  });
});

test.describe("Responsive", () => {
  test("hero adapts to mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    await expect(page.locator(".hero-logo")).toBeVisible();
    await expect(page.locator(".hero h1")).toBeVisible();
    await expect(page.locator(".btn-primary").first()).toBeVisible();
  });
});
