# ALPHA: OpenWarden

Still in Alpha alot of the ui subject to change also working on stability would appreciate any feedback/issue reports.
OpenWarden is a local git client app and can be connected with github/bitbucket through api keys.
Review local changes write comments send to agents or review upstream prs from colleagues with lsp support. 

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

## LSP support (desktop app)

OpenWarden can show diagnostics and code navigation in diffs by connecting to Language Server Protocol (LSP) servers.

How server resolution works:

1. Per-language override from OpenWarden global `settings.json` (`lsp.servers.<languageId>`).
2. Auto-detect known language server binaries from your system `PATH`.
3. If nothing is found, LSP for that language stays disabled until configured/installed.

### Install language servers globally

Install the servers you want on your machine (examples):

```bash
# TypeScript / JavaScript
npm i -g typescript typescript-language-server

# Python
npm i -g pyright
# (or install pylsp via pip if you prefer python-lsp-server)

# Go
go install golang.org/x/tools/gopls@latest

# Rust
rustup component add rust-analyzer
```

### Configure overrides (optional)

In OpenWarden, go to `Settings` and click `Open JSON` to edit the global settings file.

Example:

```json
{
  "version": 1,
  "sourceControl": {
    "fileTreeRenderMode": "tree"
  },
  "lsp": {
    "servers": {
      "typescript": {
        "command": "typescript-language-server",
        "args": ["--stdio"],
        "extensions": ["ts", "tsx", "mts", "cts"]
      },
      "python": {
        "command": "pyright-langserver",
        "args": ["--stdio"],
        "extensions": ["py"]
      },
      "eslint": {
        "command": "vscode-eslint-language-server",
        "args": ["--stdio"],
        "extensions": ["js", "jsx", "mjs", "cjs"]
      }
    }
  }
}
```

Notes:

- `extensions` entries can be with or without a leading dot (for example `ts` or `.ts`).
- ESLint is supported as an LSP server (`vscode-eslint-language-server`) and can be configured like any other language server.
