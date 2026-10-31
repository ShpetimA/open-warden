import type { Meta, StoryObj } from "@storybook/react-vite";

import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

import { colorTokenGroups } from "./tokenCatalog";

const meta = {
  title: "Design system/Foundations/Tokens",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Colors: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Semantic colors"
      description="Components consume roles rather than physical palette values. Switch themes from the Storybook toolbar to review both palettes."
    >
      <div className="space-y-8">
        {colorTokenGroups.map((group) => (
          <section key={group.name}>
            <h2 className="mb-3 text-sm font-semibold">{group.name}</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
              {group.tokens.map((token) => (
                <article
                  className="bg-card overflow-hidden rounded-xl shadow-xs ring-1 ring-border"
                  key={token.cssVariable}
                >
                  <div className="h-20" style={{ background: `var(${token.cssVariable})` }} />
                  <div className="p-3">
                    <div className="text-sm font-medium">{token.name}</div>
                    <code className="text-muted-foreground mt-1 block text-xs">
                      {token.cssVariable}
                    </code>
                    <p className="text-muted-foreground mt-2 text-xs text-pretty">
                      {token.purpose}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </DesignSystemCanvas>
  ),
};

export const Typography: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Typography"
      description="A compact hierarchy for code review and source-control workflows."
    >
      <div className="bg-surface max-w-3xl space-y-6 rounded-2xl p-6 shadow-xs ring-1 ring-border">
        <div>
          <div className="text-muted-foreground text-xs">Page title · 24px</div>
          <div className="text-2xl font-semibold tracking-tight text-balance">
            Review changes before they leave your machine
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Section title · 16px</div>
          <div className="text-base font-semibold">Changed files</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Body · 14px</div>
          <p className="max-w-xl text-sm leading-6 text-pretty">
            Use regular body copy for explanations and reserve stronger weight for hierarchy,
            actions, and state.
          </p>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Metadata · 12px</div>
          <div className="text-muted-foreground text-xs tabular-nums">18 files · +284 · −91</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Code · 13px</div>
          <code className="font-mono text-[13px]">src/features/source-control/api.ts</code>
        </div>
      </div>
    </DesignSystemCanvas>
  ),
};

export const SpacingAndShape: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Spacing and shape"
      description="Use the four-pixel rhythm, let parent layouts own gaps, and keep nested radii concentric."
    >
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <section className="bg-surface space-y-4 rounded-2xl p-6 shadow-xs ring-1 ring-border">
          {[1, 2, 3, 4, 6, 8].map((step) => (
            <div className="flex items-center gap-4" key={step}>
              <code className="text-muted-foreground w-12 text-xs">{step * 4}px</code>
              <div className="bg-primary h-3 rounded-full" style={{ width: `${step * 16}px` }} />
            </div>
          ))}
        </section>
        <section className="bg-surface rounded-2xl p-2 shadow-xs ring-1 ring-border">
          <div className="bg-surface-elevated flex min-h-48 items-center justify-center rounded-xl p-6 text-center shadow-sm ring-1 ring-border">
            <div>
              <div className="font-medium">Concentric surface</div>
              <p className="text-muted-foreground mt-1 text-sm">
                16px outer radius, 12px inner radius, 8px inset.
              </p>
            </div>
          </div>
        </section>
      </div>
    </DesignSystemCanvas>
  ),
};
