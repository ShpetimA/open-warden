# OpenWarden

![OpenWarden screenshot](./OpenWarden.png)

OpenWarden is a desktop Git review app for moving through local changes, commit history, branch comparisons, and review comments without leaving your workflow.

## What it does

- Browse staged, unstaged, and untracked changes with inline diffs.
- Review commit history and inspect file-by-file patches.
- Compare branches side by side for lightweight local review.
- Leave comments tied to files and ranges, then copy them and send them to an agent.

## Built with

Tauri, React, TypeScript, Redux Toolkit, and Rust.

## Run locally

```bash
pnpm install
pnpm dev
```

## Ship desktop builds

- Create and push a version tag with `git tag v0.1.0 && git push origin v0.1.0`.
- Watch the release build with `gh run watch --exit-status` and open the published release with `gh release view v0.1.0 --web`.
- The workflow triggers from tags matching `v*`, builds desktop bundles for macOS, Windows, and Linux, and uploads them to the matching GitHub release.
