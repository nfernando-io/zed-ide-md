# Session Handoff

This workspace is a two-stage Markdown preview project for Zed.

## Repository Layout

- `.zed/tasks.json` and `.zed/keymap.json`: Zed task and keybindings for the Stage 1 external preview.
- `scripts/markdown-preview/`: Node.js Markdown preview server.
- `test-markdowns/`: Demo Markdown files and assets for manual verification.
- `docs/stage-1-node-markdown-preview.md`: Stage 1 setup, usage, and troubleshooting.
- `docs/stage-2-native-zed-markdown-preview.md`: Stage 2 build/test/manual verification notes.
- `zed-stage2/`: Separate Zed checkout for native preview changes.

## Stage 1: External Node Preview

Stage 1 runs a singleton Express server on `127.0.0.1:4477`.

Main file:

- `scripts/markdown-preview/server.mjs`

Important behavior:

- Requires `--file` and `--root`.
- If port `4477` already has a preview server, a new invocation calls `/switch?file=...` and exits.
- Renders GitHub-flavored Markdown with `markdown-it`.
- Supports task lists, KaTeX, Mermaid fences, heading anchors, and GitHub Markdown CSS.
- Rewrites local image URLs to `/assets/...` and blocks asset paths outside the workspace root.
- Uses Server-Sent Events at `/events` for browser reload.
- Watches the active Markdown file plus image assets under the workspace root.

Zed integration:

- Task name: `Markdown Preview`
- Command: `node scripts/markdown-preview/server.mjs --file "$ZED_FILE" --root "$ZED_WORKTREE_ROOT"`
- Keybindings:
  - macOS: `cmd-shift-v`
  - Linux/Windows: `ctrl-shift-v`

Verification:

```bash
cd <project-root>/scripts/markdown-preview
npm test
```

The test suite passed when run outside the restricted sandbox. Inside the sandbox, Supertest failed with `listen EPERM: operation not permitted 0.0.0.0` because local listener creation was blocked.

## Stage 2: Native Zed Preview

Stage 2 is in:

```text
<project-root>/zed-stage2
```

Current branch:

```text
stage2-rich-markdown-preview
```

Upstream remote:

```text
origin https://github.com/zed-industries/zed.git
```

Current base commit observed:

```text
53e4d34a71 client: Add `username` to `User` and start using it (#60107)
```

Modified files:

- `.cargo/config.toml`
- `Cargo.lock`
- `assets/settings/default.json`
- `crates/markdown/src/markdown.rs`
- `crates/markdown_preview/Cargo.toml`
- `crates/markdown_preview/src/markdown_preview_settings.rs`
- `crates/markdown_preview/src/markdown_preview_view.rs`
- `crates/settings_content/src/settings_content.rs`
- `crates/settings_ui/src/page_data.rs`
- `tooling/xtask/src/main.rs`
- `tooling/xtask/src/tasks.rs`
- `tooling/xtask/src/tasks/markdown_preview.rs` (untracked)

There is also an untracked `zed-stage2/typescript` path.

Native behavior changed:

- Preview body font size increased from `0.92rem` to `1rem`.
- Heading sizes increased for h1/h2/h3.
- h1 and h2 get themed bottom borders.
- Markdown preview can already resolve its own preview theme through `theme.markdown_preview_theme`, independent of the main editor theme, and uses `theme.markdown_preview_font_size` for preview font size.
- Default code blocks now have borders.
- Copy and wrap code controls are visible on hover.
- Images are centered, width-constrained, rounded, and prevented from overflowing the preview width.
- Broken or unresolved image links render a visible `Failed to Load: ...` placeholder.
- Fragment link scrolling now goes through `scroll_to_heading_slug`.
- Preview-side h1/h2/h3 outline extraction was added with duplicate slug handling.
- A preview-local Table of Contents drawer can be toggled from the preview toolbar. It lists h1/h2/h3 headings and clicking an entry jumps to that section.
- The Table of Contents drawer side is configurable with `markdown_preview.table_of_contents_position`, using `"left"` or `"right"`. The default is `"left"`.
- Markdown preview scrolling is synchronized with the source editor. User scrolling in the editor updates the preview to the same source area. User wheel scrolling or preview scroll actions update the editor's top visible row using the preview scroll ratio mapped to source line starts.
- `markdown_preview` now depends directly on workspace `pulldown-cmark`.

Focused tests added or relevant:

```bash
cd <project-root>/zed-stage2
cargo test -p markdown test_preview_style_uses_larger_heading_scale_and_borders
cargo test -p markdown test_default_code_block_controls_are_visible_on_hover
cargo test -p markdown test_broken_image_link_renders_placeholder_text
cargo test -p markdown_preview builds_nested_markdown_heading_outline
cargo test -p markdown_preview source_index_for_line_ratio_uses_line_starts
```

Previously documented Stage 2 verification status:

- `cargo fmt --package markdown_preview --package settings_content --package settings_ui --package xtask` passed.
- `cargo check -p markdown_preview` passed.
- `cargo test -p markdown_preview builds_nested_markdown_heading_outline` passed.
- `cargo test -p markdown_preview source_index_for_line_ratio_uses_line_starts` passed.
- `git diff --check` passed.

Likely next system packages:

```bash
sudo apt-get update
sudo apt-get install -y \
  clang \
  cmake \
  curl \
  libasound2-dev \
  libfontconfig1-dev \
  libssl-dev \
  libx11-dev \
  libxcb1-dev \
  libxkbcommon-dev \
  pkg-config
```

## Useful Manual Checks

Demo files:

- `<project-root>/test-markdowns/rich-preview-demo.md`
- `<project-root>/test-markdowns/asset-and-outline-check.md`

Stage 1 manual run:

```bash
cd <project-root>
node scripts/markdown-preview/server.mjs \
  --file "<project-root>/test-markdowns/rich-preview-demo.md" \
  --root "<project-root>"
```

Open:

```text
http://127.0.0.1:4477/
```

Stage 2 manual run after dependencies are installed:

```bash
cd <project-root>/zed-stage2
cargo run
```

Stage 2 now also has Cargo aliases and a matching `xtask` entry point for the common preview workflow:

```bash
cd <project-root>/zed-stage2
cargo preview-dev
cargo preview-fmt
cargo preview-check
cargo preview-test
cargo preview-verify
```

These aliases are defined in `zed-stage2/.cargo/config.toml` and call `cargo xtask markdown-preview ...`. The tooling implementation lives in `zed-stage2/tooling/xtask/src/tasks/markdown_preview.rs`.

Then open the demo Markdown files in the modified Zed build and verify:

- h1/h2 headings are visually stronger and have bottom borders.
- Code blocks are bordered and reveal copy/wrap controls on hover.
- Wide images stay centered and within the preview pane.
- Missing images show placeholder text.
- Duplicate headings have distinct navigation targets.
- Narrow preview panes do not introduce horizontal image overflow.

## Git State Notes

Root workspace status showed all project files as untracked:

```text
?? .gitignore
?? .zed/
?? docs/
?? scripts/
?? test-markdowns/
?? zed-stage2/
```

Inside `zed-stage2`, the native branch has tracked modifications listed above. Avoid resetting or cleaning either worktree unless explicitly requested.
