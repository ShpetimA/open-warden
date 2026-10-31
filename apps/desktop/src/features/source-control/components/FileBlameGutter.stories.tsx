import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { File, Virtualizer } from "@pierre/diffs/react";
import { getDiffTheme } from "@/features/diff-view/diffRenderConfig";
import { BLAME_LINE_HEIGHT, groupBlameLines, type BlameGroup } from "../blameGroups";
import { BlameAttribution } from "./BlameAttribution";
import { makeFileCodeFocusable } from "../fileCodeAccessibility";

const meta = {
  title: "Source control/File blame",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ width = 900 }: { width?: number }) {
  const [selectedGroup, setSelectedGroup] = useState<BlameGroup | null>(null);
  const groups = groupBlameLines(
    Array.from({ length: 160 }, (_, index) => ({
      line: index + 1,
      commitId:
        index === 0
          ? "a".repeat(40)
          : index < 12
            ? "b".repeat(40)
            : index < 16
              ? "0".repeat(40)
              : "c".repeat(40),
      author: index === 0 ? "Arsim Kosumi" : "Shpetim Alimi",
      authoredAt: "2026-10-27T12:00:00Z",
      summary:
        index === 0
          ? "Add translation files"
          : "Preserve incoming behavior and simplify invoice validation",
    })),
  );
  const file = {
    name: "packages/translations/languages/web/fr.ts",
    contents: Array.from(
      { length: 160 },
      (_, index) => `export const translation${index + 1} = 'Invoice ${index + 1}';`,
    ).join("\n"),
  };

  return (
    <div className="@container h-[480px] max-w-full border" style={{ width }}>
      <Virtualizer
        className="file-viewer-scroll h-full overflow-y-auto"
        contentClassName="flex min-h-full items-start"
      >
        <aside className="bg-surface-toolbar relative w-[clamp(136px,24cqw,240px)] shrink-0 self-stretch border-r">
          <BlameAttribution
            groups={groups}
            selectedGroup={selectedGroup}
            onSelectGroup={setSelectedGroup}
            renderCommitDetails={(group) => (
              <div className="space-y-2">
                <p className="text-sm font-medium">{group.summary}</p>
                <p className="text-muted-foreground">{group.author} · October 27, 2026</p>
                <code className="block break-all">{group.commitId}</code>
              </div>
            )}
          />
        </aside>
        <File
          file={file}
          selectedLines={
            selectedGroup ? { start: selectedGroup.line, end: selectedGroup.endLine } : null
          }
          className="min-w-0 flex-1"
          metrics={{
            lineHeight: BLAME_LINE_HEIGHT,
            diffHeaderHeight: 0,
            hunkLineCount: 100,
            spacing: 0,
          }}
          options={{
            theme: getDiffTheme(),
            themeType: "system",
            disableFileHeader: true,
            onPostRender: makeFileCodeFocusable,
            unsafeCSS: `:host { --diffs-line-height: ${BLAME_LINE_HEIGHT}px; --diffs-gap-block: 0px; }`,
          }}
        />
      </Virtualizer>
    </div>
  );
}

export const GroupedAttribution: Story = { render: () => <Example /> };
export const Narrow: Story = { render: () => <Example width={480} /> };
