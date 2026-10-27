# Agent-guided pull request review

Guidance is a saved walkthrough beside a PR's Overview and Files tabs. An external
MCP client reads the PR and publishes ordered explanations with file and line
references. Open Warden renders the native diff, highlights those lines, and saves
the reader's progress.

## Connect an agent

1. Open the repository in Open Warden and connect its hosting provider.
2. In **Settings → Agent connection**, choose **Start MCP server**.
3. Choose **Copy MCP configuration** and add the server to your client's MCP settings.
   The copied configuration contains the HTTP endpoint and its bearer access key.
   Client configuration formats vary; retain the URL and Authorization header when
   adapting it to your client.
4. In the agent, ask: “Guide me through PR #114 in Open Warden.”

The server listens on `http://127.0.0.1:47781/mcp`. It is available while Open Warden
is running, and starts again on the next launch if it was left enabled. Stop it in
Settings to disable the connection. Only repositories currently open in Open Warden
are accessible through the tools.

## Agent workflow

| Tool                            | Purpose                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| `list_review_workspaces`        | Find open repository paths and PR workspaces.                       |
| `get_review_context`            | Read the PR's description, head SHA, files, checks, and discussion. |
| `get_review_file`               | Read base and head file contents for a changed file.                |
| `publish_guidance`              | Save a complete walkthrough pinned to `expectedHeadSha`.            |
| `get_guidance_state`            | Read saved steps, progress, and message history.                    |
| `show_guidance_step`            | Open the PR's Guidance tab at a saved step.                         |
| `list_guidance_messages`        | Read unacknowledged questions from open repositories.               |
| `add_guidance_message`          | Save an agent reply, optionally associated with a step.             |
| `acknowledge_guidance_messages` | Mark specific questions handled.                                    |

Read context and file contents before publishing. Each step has a stable `id`,
`title`, Markdown `body`, and `references`. A reference contains a changed-file
`path`, `side` (`base` or `head`), and inclusive `startLine` / `endLine` values.
Attach these references to each code explanation: a path mentioned in Markdown
does not attach a file to the code pane. Leave references empty only for an
intentional text-only step.
Each reference can include a short Markdown `note`, rendered immediately above
its highlighted range. Without a note, the step body appears there instead.
When a note is present, the full step body remains under **Step details**.
Start the note with what changed and why it matters; use one or two sentences.

Keep the walkthrough summary to one sentence under 40 words. Give each step one
review decision, a concrete title, and 2–4 short bullets under 100 words: the
behavior change, its reason, and what to verify. Avoid repeating the PR description,
file lists, or code already visible in Pierre. Put optional background in Markdown
`<details>` blocks. Long saved explanations remain available through **Read more**.
Publish against the exact head SHA returned by context; stale publication is
rejected. Keep step IDs stable when revising the same walkthrough.

## Review navigation

The resizable sidebar has **Steps**, **Files**, and **Messages** tabs. Explanations
sit above their highlighted code ranges and can collapse to a single row. The
walkthrough summary is under **About this walkthrough**. Collapse the sidebar
with the rail control or `⌘S`; explanations remain with the code.

In Steps, `j` / `k` (or the down / up arrows) select the next / previous step.
In Files, the same keys navigate the step's Pierre file tree. `h` / `l` select
the previous / next step from either tab. Shortcuts leave message editing alone.

## Questions and updates

Messages are saved locally. To continue a discussion, ask the agent in T3 or your
MCP client: “Check Open Warden for messages.” Reading the inbox does not consume
questions. The agent should save its reply and then acknowledge the question IDs it
handled. Open Warden does not automatically wake or message an agent thread.

Guidance, progress, and message history survive restarts. When new PR commits are
detected, the old explanations remain readable, while code references and further
review marking are disabled. Ask the agent to refresh the walkthrough. Publishing
against a new head resets reviewed steps and preserves messages with their original
step title and commit context.

The tools do not approve, merge, comment on, or otherwise modify the remote PR.
Walkthroughs and connection settings live in the desktop app's user-data directory.
