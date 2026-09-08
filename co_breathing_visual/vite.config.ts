import { configDefaults, defineConfig } from "vitest/config";
import { referenceVideo } from "./scripts/reference-video.mjs";

export default defineConfig({
  plugins: [referenceVideo()],
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/._*"],
  },
});
