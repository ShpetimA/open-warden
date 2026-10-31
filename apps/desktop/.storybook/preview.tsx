import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react-vite";

import "../src/index.css";
import "./storybook.css";

const preview: Preview = {
  decorators: [
    withThemeByClassName({
      themes: {
        light: "",
        dark: "dark",
      },
      defaultTheme: "dark",
    }),
  ],
  tags: ["autodocs"],
  parameters: {
    a11y: {
      test: "error",
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      toc: true,
    },
    layout: "centered",
    options: {
      storySort: {
        order: [
          "Design system",
          [
            "Introduction",
            "Design language",
            "Product map",
            "Foundations",
            ["*"],
            "Components",
            ["*"],
            "Compositions",
            ["*"],
          ],
        ],
      },
    },
  },
};

export default preview;
