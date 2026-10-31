export type ColorToken = Readonly<{
  name: string;
  cssVariable: `--${string}`;
  purpose: string;
}>;

export type ColorTokenGroup = Readonly<{
  name: string;
  tokens: readonly ColorToken[];
}>;

export const colorTokenGroups: readonly ColorTokenGroup[] = [
  {
    name: "Surfaces",
    tokens: [
      { name: "Background", cssVariable: "--background", purpose: "Application canvas" },
      { name: "Surface", cssVariable: "--surface", purpose: "Inset panels and sidebars" },
      { name: "Surface alt", cssVariable: "--surface-alt", purpose: "Grouped secondary content" },
      {
        name: "Raised",
        cssVariable: "--surface-elevated",
        purpose: "Menus, dialogs, and floating UI",
      },
      { name: "Active", cssVariable: "--surface-active", purpose: "Selected and pressed content" },
      { name: "Toolbar", cssVariable: "--surface-toolbar", purpose: "Dense control regions" },
    ],
  },
  {
    name: "Content and actions",
    tokens: [
      { name: "Foreground", cssVariable: "--foreground", purpose: "Primary content" },
      { name: "Muted", cssVariable: "--muted-foreground", purpose: "Secondary content" },
      { name: "Primary", cssVariable: "--primary", purpose: "Primary actions" },
      { name: "Accent", cssVariable: "--accent", purpose: "Interactive hover state" },
      { name: "Border", cssVariable: "--border", purpose: "Structural separation" },
      { name: "Focus ring", cssVariable: "--ring", purpose: "Keyboard focus" },
    ],
  },
  {
    name: "Status",
    tokens: [
      { name: "Success", cssVariable: "--success", purpose: "Successful outcomes" },
      { name: "Warning", cssVariable: "--warning", purpose: "Needs attention" },
      { name: "Danger", cssVariable: "--destructive", purpose: "Errors and destructive actions" },
      { name: "Info", cssVariable: "--info", purpose: "Informational status" },
    ],
  },
  {
    name: "Source control",
    tokens: [
      { name: "Addition", cssVariable: "--diff-addition", purpose: "Added lines and files" },
      { name: "Deletion", cssVariable: "--diff-deletion", purpose: "Removed lines and files" },
      { name: "Modification", cssVariable: "--diff-modification", purpose: "Changed files" },
      { name: "Conflict", cssVariable: "--diff-conflict", purpose: "Merge conflicts" },
    ],
  },
];
