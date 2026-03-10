# OpenWarden

OpenWarden is a desktop Git review app for moving through local changes, commit history, branch comparisons, and review comments without leaving your workflow.

## Demo video
https://www.youtube.com/watch?v=rVR5dRlyFKc

## What it does

- Browse staged, unstaged, and untracked changes with inline diffs.
- Review commit history and inspect file-by-file patches.
- Compare branches side by side for lightweight local review.
- Leave comments tied to files and ranges, then copy them and send them to an agent.

## Built with

Tauri, React, TypeScript, Redux Toolkit, and Rust.

## Run locally

Prerequisites: Node.js, `pnpm`, and Rust (for Tauri).

```bash
pnpm install
pnpm dev
```

To run the full desktop app shell (Tauri) locally:

```bash
pnpm --filter desktop tauri dev
```

## Install on macOS

1. Go to this repo's **Releases** page.
2. Download the latest `OpenWarden.dmg` from the release assets.
3. Open the `.dmg` and move `OpenWarden.app` into your `Applications` folder.

If macOS blocks the app and says it is damaged or cannot be opened, remove the quarantine attribute (the app is currently not Apple-signed):

```bash
xattr -dr com.apple.quarantine "/Applications/OpenWarden.app"
```

Then try launching `OpenWarden.app` again.
