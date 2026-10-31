import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test } from "vitest";

import { rootReducer } from "@/app/store";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { gitApi } from "@/features/source-control/api";
import type { AppSettings } from "@/platform/desktop/contracts";
import { browserDesktopApi } from "@/platform/desktop/browser";
import { desktopHandlers } from "@/test/desktopHandlers";
import { SettingsScreen } from "./SettingsScreen";

function openSettings() {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(gitApi.middleware, hostedReposApi.middleware),
  });

  render(
    <Provider store={store}>
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

function selectSection(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name, exact: true }), {
    button: 0,
    ctrlKey: false,
  });
}

afterEach(() => {
  delete window.desktopBridge;
});

test("opens on preferences and reads integrations and the settings path only when requested", async () => {
  const reads: string[] = [];

  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      getAppSettingsPath: async () => {
        reads.push("path");
        return "/profile/settings.json";
      },
      getGuidanceConnection: async () => {
        reads.push("connection");
        return { status: "stopped" as const, endpoint: null, clientConfig: null, error: null };
      },
    }),
  };

  openSettings();

  expect(screen.getByRole("tab", { name: "Preferences" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: "Theme" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "Agent connection" })).not.toBeInTheDocument();
  expect(reads).toEqual([]);

  selectSection("Integrations");
  await screen.findByRole("button", { name: "Start MCP server" });
  await waitFor(() => expect(reads).toEqual(["connection"]));

  selectSection("Advanced");
  await screen.findByText("/profile/settings.json");
  expect(reads).toEqual(["connection", "path"]);
});

test("keeps preference save recovery visible across sections", async () => {
  let attempts = 0;

  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      saveAppSettings: async (settings: AppSettings) => {
        attempts += 1;

        if (attempts === 1) {
          throw {
            operation: "saveAppSettings",
            code: "storage-failed",
            message: "Your preference could not be saved.",
          };
        }

        return settings;
      },
      getAppSettingsPath: async () => "/profile/settings.json",
    }),
  };

  const store = openSettings();

  fireEvent.click(screen.getByRole("button", { name: "List", exact: true }));
  await screen.findByText("Your preference could not be saved.");
  selectSection("Advanced");
  await screen.findByText("/profile/settings.json");
  expect(screen.getByText("Your preference could not be saved.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry", exact: true }));

  await waitFor(() => expect(store.getState().settings.error).toBeNull());
  expect(attempts).toBe(2);
  expect(store.getState().settings.appSettings.sourceControl.fileTreeRenderMode).toBe("list");
});

test("retries opening the settings file without reporting it as a failed preference save", async () => {
  const opened: string[] = [];

  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      getAppSettingsPath: async () => "/profile/settings.json",
      openPath: async (path: string) => {
        opened.push(path);

        if (opened.length === 1) {
          throw {
            operation: "openPath",
            code: "unavailable",
            message: "Choose an application to open this file.",
          };
        }
      },
    }),
  };

  const store = openSettings();
  selectSection("Advanced");
  await screen.findByText("/profile/settings.json");
  fireEvent.click(screen.getByRole("button", { name: "Open settings file" }));
  await screen.findByText("Couldn’t open settings file");
  expect(store.getState().settings.error).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Retry", exact: true }));
  await waitFor(() =>
    expect(screen.queryByText("Couldn’t open settings file")).not.toBeInTheDocument(),
  );
  expect(opened).toEqual(["/profile/settings.json", "/profile/settings.json"]);
});
