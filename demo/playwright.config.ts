import { defineConfig, devices } from "@playwright/test";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";

// Load .env.demo file manually (avoids dotenv dependency)
const envPath = resolve(__dirname, "../.env.demo");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export default defineConfig({
  testDir: ".",
  testMatch: ["record.ts"],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 600_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: devices["iPhone 14"].userAgent,
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
