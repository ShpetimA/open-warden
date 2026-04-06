# ALPHA: OpenWarden

Still in Alpha alot of the ui subject to change also working on stability would appreciate any feedback/issue reports.
OpenWarden is a desktop Git review app for moving through local changes, commit history, branch comparisons, and review comments without leaving your workflow.

## Install on macOS

1. Go to this repo's **Releases** page.
2. Download the latest macOS release archive.
3. Open the archive and move `OpenWarden.app` into your `Applications` folder.

If macOS blocks the app and says it is damaged or cannot be opened, remove the quarantine attribute (the app is currently not Apple-signed):

```bash
xattr -dr com.apple.quarantine "/Applications/OpenWarden.app"
```

Then try launching `OpenWarden.app` again.

https://github.com/user-attachments/assets/6866ec19-b518-4d1b-a3ef-6ebeee587e22

## What it does

- Browse staged, unstaged, and untracked changes with inline diffs.
- Review commit history and inspect file-by-file patches.
- Compare branches side by side for lightweight local review.
- Leave comments tied to files and ranges, then copy them and send them to an agent.

## Built with

Electron, React, TypeScript, Redux Toolkit, and system Git.

## Run locally

Prerequisites: Node.js, `pnpm`, and `git`.

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs the browser fallback for UI work by setting `VITE_DESKTOP_FALLBACK=browser`.

To run the full desktop app shell (Electron) locally:

```bash
pnpm dev:electron
```

To build a local macOS Electron package:

```bash
pnpm build:electron
```
