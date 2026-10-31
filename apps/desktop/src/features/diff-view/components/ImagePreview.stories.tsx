import type { Meta, StoryObj } from "@storybook/react-vite";

import image from "../../../../tests/fixtures/images/before.png?inline";
import { desktopFailure } from "@/platform/desktop/failure";
import { ImagePreview } from "./ImagePreview";

const meta = {
  title: "Diff/Image preview",
  component: ImagePreview,
  args: {
    name: "assets/logo.png",
    label: "After",
    state: {
      status: "ready",
      data: { width: 640, height: 320, url: image },
    },
    onRetry: () => {},
    onDecodeError: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-[min(720px,90vw)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImagePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Loading: Story = { args: { state: { status: "loading" } } };

export const ReadFailure: Story = {
  args: {
    state: {
      status: "failed",
      error: desktopFailure(
        "getImagePreview",
        "unavailable",
        "The image could not be read. Try again.",
      ),
    },
  },
};

export const DecodeFailure: Story = {
  args: {
    state: {
      status: "failed",
      error: desktopFailure(
        "getImagePreview",
        "invalid-input",
        "The image could not be decoded. It may be damaged or unsupported.",
      ),
    },
  },
};
