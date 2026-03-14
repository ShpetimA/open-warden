import path from "node:path";

import { defineConfig } from "vite";

const external = ["electron", ...Object.keys(process.binding("natives"))];

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: ".vite/build",
    rollupOptions: {
      external,
      output: {
        entryFileNames: "preload.cjs",
        format: "cjs",
      },
    },
    ssr: path.resolve(__dirname, "electron/preload.ts"),
    target: "node20",
  },
  clearScreen: false,
});
