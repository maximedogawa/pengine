import { expect, test } from "@playwright/test";

const CONNECTED_STORAGE_STATE = {
  state: {
    isDeviceConnected: true,
  },
  version: 0,
};

test.describe("setup to dashboard flow", () => {
  test("redirects dashboard to setup when disconnected", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("app-ready")).toBeVisible();

    await expect(page).toHaveURL(/\/setup$/);
    await expect(
      page.getByRole("heading", { name: "Create your Telegram bot", exact: true }),
    ).toBeVisible();
  });

  test("walks all setup wizard steps and opens dashboard", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.getByTestId("app-ready")).toBeVisible();

    // Step 1: Create bot
    await expect(
      page.getByRole("heading", { name: "Create your Telegram bot", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Bot token").fill("12345678:abcdefghijklmnopqrstuvwxyzABCDE12345");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2: Install Ollama
    await expect(page.getByRole("heading", { name: "Install Ollama", exact: true })).toBeVisible();
    await expect(page.getByText("Mock: Ollama OK at localhost:11434")).not.toBeVisible();
    await page.getByRole("button", { name: "Mark Ollama ready (demo)" }).click();
    await expect(page.getByText("Mock: Ollama OK at localhost:11434")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: Pengine local
    await expect(
      page.getByRole("heading", { name: "Install Pengine locally", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mark Pengine local ready (demo)" }).click();
    await expect(page.getByText("Mock: local Pengine process active")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 4: Connect (bot ID from token + mock link)
    await expect(
      page.getByRole("heading", { name: "Connect bot to Pengine", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Auto-link target:")).toBeVisible();
    await expect(page.locator("code", { hasText: "12345678" })).toBeVisible();
    await page.getByLabel("Bot username (for QR link)").fill("@MyPengineBot");
    await page.getByRole("button", { name: "Simulate bot linked to Pengine (demo)" }).click();
    await expect(
      page.getByText("Mock: Telegram <-> Pengine connected for bot 12345678"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open dashboard" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Connected device and running services" }),
    ).toBeVisible();
    await expect(page.getByText("Telegram gateway")).toBeVisible();
  });

  test("loads dashboard when device is already connected", async ({ page }) => {
    await page.addInitScript((state) => {
      window.localStorage.setItem("pengine-device-session", JSON.stringify(state));
    }, CONNECTED_STORAGE_STATE);

    await page.goto("/dashboard");
    await expect(page.getByTestId("app-ready")).toBeVisible();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("1 connected device")).toBeVisible();
  });
});
