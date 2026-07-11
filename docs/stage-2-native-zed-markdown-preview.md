# Stage 2: Native Zed Markdown Preview Branch

This document explains how to build, run, and verify the native Zed Markdown preview changes in the separate Stage 2 clone.

## Workspace

Stage 2 is isolated from the Stage 1 project:

```text
<project-root>/zed-stage2
```

The implementation branch is:

```bash
stage2-rich-markdown-preview
```

Check it with:

```bash
cd <project-root>/zed-stage2
git branch --show-current
git status --short
```

## What Changed

The native changes are in:

- `crates/markdown/src/markdown.rs`
- `crates/markdown_preview/src/markdown_preview_view.rs`
- `crates/markdown_preview/Cargo.toml`
- `Cargo.lock`

Behavior to verify:

- Markdown preview body text is larger.
- h1 and h2 headings have larger type and bottom borders from theme colors.
- Default code blocks have borders.
- Copy and wrap controls are visible on hover.
- Images are centered and constrained to the preview width.
- Broken image links show a lightweight bordered placeholder.
- Preview heading slugs use the same scroll path used by local fragment links.
- h1/h2/h3 heading outline data is parsed with duplicate slug handling.

## Linux Build Dependencies

Zed's Linux build needs system packages beyond Rust. In this environment, `cmake` was needed and has been installed. The next missing dependency during tests was `pkg-config`, needed by `yeslogic-fontconfig-sys` for fontconfig discovery.

Install the usual build dependencies from a normal terminal:

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

If your distro package names differ, follow Zed's upstream Linux guide:

```text
<project-root>/zed-stage2/docs/src/development/linux.md
```

## Checks To Run

From the Stage 2 clone:

```bash
cd <project-root>/zed-stage2
cargo fmt --package markdown --package markdown_preview -- --check
cargo check -p markdown --lib
cargo test -p markdown test_preview_style_uses_larger_heading_scale_and_borders
cargo test -p markdown test_default_code_block_controls_are_visible_on_hover
cargo test -p markdown test_broken_image_link_renders_placeholder_text
cargo test -p markdown_preview builds_nested_markdown_heading_outline
```

For broader validation:

```bash
cargo test -p markdown
cargo test -p markdown_preview
```

## Current Verification Status

Already passed after Rust and `cmake` were available:

```bash
cargo fmt --package markdown --package markdown_preview
cargo fmt --package markdown --package markdown_preview -- --check
cargo check -p markdown --lib
git diff --check
```

Remaining test blocker at the time this document was written:

```text
pkg-config command could not be found
```

Install `pkg-config` and `libfontconfig1-dev`, then rerun the test commands above.

## Running The Modified Zed

After dependencies are installed:

```bash
cd <project-root>/zed-stage2
cargo run --release
```

For faster iteration while developing:

```bash
cargo run
```

Open the Stage 1 workspace or the demo Markdown files from the running Zed build:

```text
<project-root>/test-markdowns/rich-preview-demo.md
<project-root>/test-markdowns/asset-and-outline-check.md
```

Use Zed's Markdown preview command from the command palette. You can also open the command palette and search for "Markdown Preview" or "Open Preview".

## Manual Verification

Open `test-markdowns/rich-preview-demo.md` in the modified Zed build and verify:

- h1 and h2 headings are visually stronger and separated by bottom borders.
- The Rust code block has a border.
- Hovering the code block exposes copy and wrap controls.
- The wide SVG is centered and does not overflow the preview pane.
- The missing image renders placeholder text instead of disappearing.
- `cmd-shift-o` or `ctrl-shift-o` shows Markdown headings through Zed's native outline path when the source editor is active.
- Duplicate headings have distinct navigation targets.

For image bounds, make the preview pane narrow. The SVG should shrink within the available width instead of causing horizontal overflow.

For broken images, look for:

```text
Failed to Load: Missing screenshot
```

## Notes On Outline Behavior

The current Zed outline modal is editor-driven. Markdown already has a tree-sitter outline query at:

```text
crates/grammars/src/markdown/outline.scm
```

The Stage 2 branch also adds preview-side h1/h2/h3 outline extraction and slug generation in `markdown_preview_view.rs`, with a unit test for nested headings and duplicate slugs. The local fragment link path now goes through a shared `scroll_to_heading_slug` helper so preview heading navigation and outline entries can use the same slug-based scroll behavior.

## What To Watch For

Watch for regressions in:

- code block layout in narrow panes
- hover-only button visibility
- image placeholders inside paragraphs and list items
- h1/h2 spacing in dense documents
- heading slugs with duplicate or punctuation-heavy headings
- theme compatibility in both light and dark modes

If a test fails after installing system dependencies, start with the failing crate and filter:

```bash
cargo test -p markdown <test_name> -- --nocapture
cargo test -p markdown_preview <test_name> -- --nocapture
```
