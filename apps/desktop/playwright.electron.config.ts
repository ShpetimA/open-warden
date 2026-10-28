import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/electron",
  timeout: 60000,
  workers: 1,
  reporter: "list",
});
