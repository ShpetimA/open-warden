# OpenWarden (Beta)

OpenWarden is a keyboard-first Git client for macOS, built for code review. Review your local changes, hand review comments to your coding agent, walk through history, compare branches, and review GitHub or Bitbucket pull requests next to the code.

OpenWarden is in beta. Parts of the UI can still change. Feedback and issue reports are welcome.

https://github.com/user-attachments/assets/6a5cbe2c-284b-4fe2-a0a4-dd8b327ea75d

## Install on macOS

1. Go to this repo's **Releases** page.
2. Download the latest macOS release archive.
3. Open the archive and move `OpenWarden.app` into your `Applications` folder.

If macOS blocks the app and says it is damaged or cannot be opened, remove the quarantine attribute (the app is currently not Apple-signed):

```bash
xattr -dr com.apple.quarantine "/Applications/OpenWarden.app"
```

Then try launching `OpenWarden.app` again.

## Features

### Local changes

- Staged, unstaged and untracked files in a file tree or flat list, with split or unified diffs.
- Stage, unstage or discard whole files or single hunks.
- Commit, amend and undo the last commit without leaving the keyboard.
- Views refresh automatically when files change on disk or when Git state changes outside the app.
- Image previews for changed images.

### Review and agents

- Comment on any line or range in a diff.
- Copy all review comments with `⌘⌥C` as file and line references (for example `@src/app.ts#L30-31 - …`), ready to paste into Claude Code, Codex, Pi or any other agent.
- Language server diagnostics, hover, go to definition and references in diffs (see [LSP support](#lsp-support-desktop-app)).
- Guided pull request walkthroughs: start the local MCP server in **Settings → Integrations** so T3 Code or another MCP client can build step-by-step guidance for a PR.

### History and branches

- Commit list and a full branch graph with refs, tags and commit details.
- Inspect any commit file by file. Cherry-pick, revert, or create a branch from a commit.
- Compare any two branches or refs locally before you open a pull request.
- Blame for any file, with the author and commit for each line.
- Stays fast on large comparisons with thousands of changed files.

### Pull requests (GitHub and Bitbucket)

- Pull request inbox with search and filters for author, state and involvement.
- Review files and commits with threads, replies, resolve, and pending review comments you publish together.
- Approve, request changes, comment, and track which files you have viewed.
- See checks, reviewers and mergeability. Edit the title and description, merge, or close.
- On GitHub also: draft and ready for review, update branch, auto-merge, reopen, revert, labels, reactions, and re-running or cancelling workflow runs.
- Open a pull request as a local branch or in its own worktree, or create a new pull request.

### Git operations

The command composer (`⌘K`) runs common Git work in a few keystrokes:

- Pull, push, fetch, publish a branch, and manage remotes and upstreams.
- Switch, create, rename, merge, rebase or delete branches, and stash and switch.
- Save, apply, pop and delete stashes. Create and delete tags. Create and remove worktrees.
- Clone or initialize a repository.
- Guided recovery when a merge, rebase or cherry-pick stops on conflicts.

### Files and workspace

- Browse every file in the repository, open files with Quick Open (`⌘P`), edit and save (`⌘S`), and create or trash files and folders.
- Multiple projects and review tabs that are restored when you reopen the app.
- Unsaved review comments and commit messages survive restarts.
- Light and dark themes that follow your system.
- In-app updates.

## Keyboard shortcuts

| Action                                      | Shortcut                      |
| ------------------------------------------- | ----------------------------- |
| Changes / Pull requests / History / Compare | `⌘⇧C` / `⌘⇧P` / `⌘⇧H` / `⌘⇧D` |
| Files and focus the file tree               | `⌘⇧E`                         |
| Open next / previous file                   | `J` / `K`                     |
| Stage or unstage the selection / commit     | `⌘↵`                          |
| Copy all review comments                    | `⌘⌥C`                         |
| Command composer                            | `⌘K`                          |
| Quick Open file                             | `⌘P`                          |
| Save working file                           | `⌘S`                          |
| New file or folder in Files                 | `⌘N`, or `N` in the file tree |
| Move focused file or folder to Trash        | `D` in the file tree          |
| New project tab / open project              | `⌘T` / `⌘O`                   |
| Jump to project 1–8 / last project          | `⌘1`–`⌘8` / `⌘9`              |
| Next / previous project                     | `Ctrl Tab` / `Ctrl ⇧ Tab`     |
| Next / previous review tab                  | `⌘⇧]` / `⌘⇧[`                 |
| Close review or project / reopen closed tab | `⌘W` / `⌘⇧T`                  |
| Toggle sidebar / files pane                 | `⌘B` / `⌘D`                   |
| Settings                                    | `⌘,`                          |

The full list is in **Settings → Shortcuts**.

## Connect GitHub or Bitbucket

OpenWarden detects GitHub and Bitbucket from your Git remote. Open **Pull Requests** (`⌘⇧P`) and choose **Connect**:

- **GitHub:** paste a personal access token.
- **Bitbucket:** paste an app password or access token. Add your username or email when you use an app password.

Tokens stay on your machine, encrypted with the macOS Keychain through Electron safe storage.

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
