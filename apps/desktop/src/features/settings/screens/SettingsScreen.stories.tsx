import { configureStore } from "@reduxjs/toolkit";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";

import { rootReducer } from "@/app/store";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { gitApi } from "@/features/source-control/api";
import { SettingsScreen } from "./SettingsScreen";

const meta = {
  title: "Settings/Preferences",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Example({ width = 1000 }) {
  const [store] = useState(() =>
    configureStore({
      reducer: rootReducer,
      middleware: (getDefault) => getDefault().concat(gitApi.middleware, hostedReposApi.middleware),
    }),
  );

  return (
    <Provider store={store}>
      <MemoryRouter>
        <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange>
          <div className="h-[600px] max-w-full" style={{ width }}>
            <SettingsScreen />
          </div>
        </ThemeProvider>
      </MemoryRouter>
    </Provider>
  );
}

export const Preferences: Story = { render: () => <Example /> };
export const Narrow: Story = { render: () => <Example width={360} /> };
