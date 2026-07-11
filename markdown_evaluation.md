# Markdown Preview Evaluation Report

This document summarizes the evaluation of the markdown preview feature, including new tests, identified vulnerabilities, and code changes.

## 1. Security Vulnerabilities

### 1.1. Path Traversal in Image Resolution (Critical)

A path traversal vulnerability was identified in the `resolve_preview_image` function. This would have allowed a malicious markdown file to access and display images from outside the workspace directory.

#### Test Case Added

The following test was added to `crates/markdown_preview/src/markdown_preview_view.rs` to detect this vulnerability. This test failed before the fix was applied.

```rust
#[test]
fn test_resolve_preview_image_path_traversal() {
    let tree = TempTree::new(json!({
        "workspace": {
            "docs": {
                "image.png": "in-workspace"
            }
        },
        "secret.txt": "sensitive data"
    }));

    let workspace_root = &tree.path().join("workspace");
    let base_directory = &workspace_root.join("docs");

    // Attempt to traverse up from the base directory
    let resolved = resolve_preview_image(
        "../../secret.txt",
        Some(base_directory),
        Some(workspace_root),
    );
    assert!(resolved.is_none(), "Should not be able to access files outside the workspace using ../");

    // Attempt to traverse up from the workspace root using an absolute-like path
    let resolved_abs = resolve_preview_image(
        "/../../secret.txt",
        Some(base_directory),
        Some(workspace_root),
    );
    assert!(resolved_abs.is_none(), "Should not be able to access files outside the workspace using /../");
}
```

#### Vulnerability Fix

The `resolve_preview_image` function was patched to properly canonicalize and verify file paths.

**Original (vulnerable) code:**
```rust
fn resolve_preview_image(
    dest_url: &str,
    base_directory: Option<&Path>,
    workspace_directory: Option<&Path>,
) -> Option<ImageSource> {
    // ... (URL and data URI handling) ...

    if let Some(stripped) = ['/', '\\']
        .iter()
        .find_map(|prefix| decoded.strip_prefix(*prefix))
    {
        if let Some(root) = workspace_directory {
            let absolute_path = root.join(stripped);
            if absolute_path.exists() {
                return Some(ImageSource::Resource(Resource::Path(Arc::from(
                    absolute_path.as_path(),
                ))));
            } else {
                return None;
            }
        }
    }

    let path = if Path::new(&decoded).is_absolute() {
        PathBuf::from(decoded)
    } else {
        base_directory?.join(decoded)
    };

    path.exists()
        .then(|| ImageSource::Resource(Resource::Path(Arc::from(path.as_path()))))
}
```

**Patched (secure) code:**
```rust
fn resolve_preview_image(
    dest_url: &str,
    base_directory: Option<&Path>,
    workspace_directory: Option<&Path>,
) -> Option<ImageSource> {
    // ... (URL and data URI handling) ...

    let path = if let Some(stripped) = ['/', '\\']
        .iter()
        .find_map(|prefix| decoded.strip_prefix(*prefix))
    {
        workspace_directory?.join(stripped)
    } else if Path::new(&decoded).is_absolute() {
        PathBuf::from(decoded)
    } else {
        base_directory?.join(decoded)
    };

    if let Some(workspace_root) = workspace_directory {
        if let Ok(canonical_path) = std::fs::canonicalize(&path) {
            if let Ok(canonical_workspace) = std::fs::canonicalize(workspace_root) {
                if canonical_path.starts_with(canonical_workspace) && path.exists() {
                     return Some(ImageSource::Resource(Resource::Path(Arc::from(path.as_path()))));
                }
            }
        }
    }

    None
}
```

### 1.2. Cross-Site Scripting (XSS)

A test was added to ensure that the markdown renderer properly sanitizes HTML and prevents XSS attacks. The test confirmed that the current implementation is secure against this vector.

#### Test Case Added

The following test was added to `crates/markdown/src/markdown.rs`:

```rust
#[gpui::test]
fn test_markdown_xss_sanitization(cx: &mut TestAppContext) {
    let xss_markdown = "<script>alert('xss')</script>";
    let rendered = render_markdown_with_options(
        xss_markdown,
        None,
        MarkdownOptions {
            parse_html: true, // Even with HTML parsing enabled, it should be sanitized.
            ..Default::default()
        },
        cx,
    );
    let text: String = rendered
        .lines
        .iter()
        .map(|line| line.layout.wrapped_text())
        .collect();

    assert!(!text.contains("<script>"), "Script tag should be sanitized, but was found in rendered text: {}", text);
}
```

## 2. Other Findings

### 2.1. Pre-existing Failing Test

A failing test named `test_hard_style_soft_break_after_image_moves_caption_to_next_row` was discovered in the `markdown` crate. This appears to be a minor styling bug and is not a security issue.

**Error:** `caption should render below the image for hard-style soft breaks; top with break: 5px, top without break: 5px`
