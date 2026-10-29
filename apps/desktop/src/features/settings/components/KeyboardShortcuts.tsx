const shortcuts = [
  ["New project tab / open project", "⌘T / ⌘O"],
  ["Next / previous project", "Ctrl Tab / Ctrl ⇧ Tab"],
  ["Jump to project 1–8 / last project", "⌘1–8 / ⌘9"],
  ["Next / previous review tab", "⌘⇧] / ⌘⇧["],
  ["Close current review or project", "⌘W"],
  ["Close project and its reviews", "⌘⇧W"],
  ["Reopen closed tab or project", "⌘⇧T"],
  ["Files and focus file tree", "⌘⇧E"],
  ["Changes / Pull Requests / History / Compare", "⌘⇧C / ⌘⇧P / ⌘⇧H / ⌘⇧D"],
  ["New file or folder in Files", "⌘N · N in file tree"],
  ["Move focused file or folder to Trash", "D in file tree"],
  ["Quick Open file", "⌘P"],
  ["Command composer", "⌘K"],
  ["Save working file", "⌘S"],
  ["Open next / previous file", "J / K"],
  ["Files tree: move / toggle / collapse or expand", "J/K · Enter · H/L"],
  ["Settings", "⌘,"],
  ["Toggle sidebar / files pane", "⌘B / ⌘D"],
  ["Focus commits / files in commit review", "H / L"],
] as const;

export function KeyboardShortcuts() {
  return (
    <section aria-labelledby="keyboard-shortcuts-title" className="border-border rounded-xl border">
      <div className="border-border border-b px-5 py-4">
        <h2 id="keyboard-shortcuts-title" className="text-sm font-medium">
          Keyboard shortcuts
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Review shortcuts cycle the pull-request list and open reviews in the current project.
        </p>
      </div>
      <dl className="divide-border divide-y px-5">
        {shortcuts.map(([label, keys]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2.5 text-xs">
            <dt>{label}</dt>
            <dd>
              <kbd className="text-muted-foreground whitespace-nowrap font-mono">{keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
