import path from "node:path";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { UserConfig } from "vite";

function resolveDevServerPort() {
  const parsed = Number.parseInt(process.env.VITE_DEV_SERVER_PORT ?? "1420", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1420;
}

export function createRendererConfig(): UserConfig {
  return {
    // Packaged Electron loads the renderer via file://, so built assets must stay relative.
    base: "./",
    plugins: [
      react({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),
      tailwindcss(),
    ],
    clearScreen: false,
    worker: {
      format: "es",
    },
    resolve: {
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "react-redux"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react/jsx-runtime", "react-redux"],
    },
    server: {
      port: resolveDevServerPort(),
      strictPort: true,
    },
  };
}
