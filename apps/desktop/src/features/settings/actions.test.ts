import { configureStore } from "@reduxjs/toolkit";
import { afterEach, expect, test } from "vitest";

import { rootReducer } from "@/app/store";
import { browserDesktopApi } from "@/platform/desktop/browser";
import { desktopHandlers } from "@/test/desktopHandlers";
import type { AppSettings } from "@/platform/desktop";
import { updateFileTreeRenderMode } from "./actions";

afterEach(() => {
  delete window.desktopBridge;
});

test("keeps the requested preference after a failed save and clears the error after retry", async () => {
  let attempts = 0;
  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      async saveAppSettings(settings: AppSettings) {
        attempts += 1;
        if (attempts === 1)
          throw {
            operation: "saveAppSettings",
            code: "storage-failed",
            message: "Your changes couldn’t be saved. Keep this window open and try again.",
          };
        return settings;
      },
    }),
  };
  const store = configureStore({ reducer: rootReducer });
  await store.dispatch(updateFileTreeRenderMode("list"));
  expect(store.getState().settings.appSettings.sourceControl.fileTreeRenderMode).toBe("list");
  expect(store.getState().settings.error).toMatchObject({ code: "storage-failed" });
  await store.dispatch(updateFileTreeRenderMode("list"));
  expect(store.getState().settings.appSettings.sourceControl.fileTreeRenderMode).toBe("list");
  expect(store.getState().settings.error).toBeNull();
  expect(attempts).toBe(2);
});
