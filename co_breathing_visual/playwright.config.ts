import { defineConfig } from "@playwright/test";
// Only this environment switch needs a Node host type in the browser project.
declare const process: { env: Record<string, string | undefined> };

const preview = process.env.EXHIBITION_PREVIEW === "1";
const baseURL = preview ? "http://127.0.0.1:4174" : "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/._*"],
  projects: [
    {
      name: "chromium-1080p",
      use: { browserName: "chromium", channel: "chrome", viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "chromium-720p",
      use: {
        browserName: "chromium",
        channel: "chrome",
        deviceScaleFactor: 2,
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  use: {
    baseURL,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: preview ? "npm run preview -- --port 4174" : "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
  },
});
