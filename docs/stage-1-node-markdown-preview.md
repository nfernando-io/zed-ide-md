# Stage 1: External Rich Markdown Preview

This document explains how to run and verify the project-local Node.js Markdown preview server in this workspace.

## What It Is

Stage 1 lives in `scripts/markdown-preview/`. It starts a singleton Express server on `127.0.0.1:4477`, renders GitHub-flavored Markdown, serves local workspace assets, and reloads the browser through Server-Sent Events when the Markdown file or image assets change.

The Zed task is defined in `.zed/tasks.json` and is bound in `.zed/keymap.json`:

- macOS: `cmd-shift-v`
- Linux/Windows: `ctrl-shift-v`

## First-Time Setup

From the workspace root:

```bash
cd /home/nfern/Projects/zen-ide/scripts/markdown-preview
npm install
npm test
```

The tests use Supertest, which binds a temporary local HTTP server. In restricted environments, run the test command from a normal terminal if local listener creation is denied.

## Run From The Terminal

Use an absolute Markdown path and a workspace root:

```bash
cd /home/nfern/Projects/zen-ide
node scripts/markdown-preview/server.mjs \
  --file "/home/nfern/Projects/zen-ide/test-markdowns/rich-preview-demo.md" \
  --root "/home/nfern/Projects/zen-ide"
```

Then open:

```text
http://127.0.0.1:4477/
```

If the server is already running, running the command again with a different `--file` calls `/switch` and exits. That is the singleton behavior that prevents duplicate preview servers and port collisions.

## Run From Zed

1. Open `/home/nfern/Projects/zen-ide` as the worktree in Zed.
2. Open `test-markdowns/rich-preview-demo.md`.
3. Press `cmd-shift-v` on macOS or `ctrl-shift-v` on Linux/Windows.
4. The task runs `node scripts/markdown-preview/server.mjs --file "$ZED_FILE" --root "$ZED_WORKTREE_ROOT"`.
5. The browser should open to `http://127.0.0.1:4477/`.

## Demo Files

Use these files:

- `test-markdowns/rich-preview-demo.md`
- `test-markdowns/asset-and-outline-check.md`

The demo files cover:

- h1/h2/h3 heading slugs
- duplicate headings
- GFM tables
- task lists
- fenced Rust code
- Mermaid diagrams
- local SVG assets
- intentionally broken image links
- live reload after save

## What To Look For

When viewing `rich-preview-demo.md`, confirm:

- The main content uses GitHub Markdown styling.
- Tables have GitHub-like borders and spacing.
- Task list checkboxes render.
- The Mermaid diagram renders in the browser.
- `assets/preview-diagram.svg` loads through `/assets/...`.
- Editing and saving the Markdown file reloads the browser.
- Editing or replacing an image under `test-markdowns/assets/` reloads the browser.
- Running the task again while the server is running switches the active file instead of starting another server.

## Useful URLs

```text
http://127.0.0.1:4477/ping
http://127.0.0.1:4477/switch?file=/home/nfern/Projects/zen-ide/test-markdowns/asset-and-outline-check.md
http://127.0.0.1:4477/assets/test-markdowns/assets/preview-diagram.svg
```

## Troubleshooting

If the browser does not open automatically, open `http://127.0.0.1:4477/` manually.

If port `4477` is occupied by a non-preview process, stop that process or run the server with `--port <port>` for manual testing. The Zed task is intentionally fixed to `4477`.

If local images do not load, verify the image is inside the workspace root passed through `--root`. Paths outside the workspace are blocked.

If live reload seems noisy, note that reload broadcasts are debounced by 100ms to handle save-on-focus-lost and multi-file save bursts.
