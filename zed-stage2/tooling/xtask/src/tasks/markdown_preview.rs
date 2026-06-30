#![allow(clippy::disallowed_methods, reason = "tooling is exempt")]

use std::process::Command;

use anyhow::{Context as _, Result, bail};
use clap::{Parser, Subcommand};

#[derive(Parser)]
pub struct MarkdownPreviewArgs {
    #[command(subcommand)]
    command: MarkdownPreviewCommand,
}

#[derive(Subcommand)]
enum MarkdownPreviewCommand {
    /// Runs the desktop app from the current workspace checkout.
    Dev,
    /// Formats the Markdown preview crates.
    Fmt,
    /// Checks the Markdown crate, which contains the shared renderer changes.
    Check,
    /// Runs focused tests for the Stage 2 Markdown preview changes.
    Test,
    /// Runs format, check, and focused tests.
    Verify,
}

pub fn run_markdown_preview(args: MarkdownPreviewArgs) -> Result<()> {
    match args.command {
        MarkdownPreviewCommand::Dev => run_cargo(&["run"]),
        MarkdownPreviewCommand::Fmt => run_fmt(),
        MarkdownPreviewCommand::Check => run_check(),
        MarkdownPreviewCommand::Test => run_tests(),
        MarkdownPreviewCommand::Verify => {
            run_fmt()?;
            run_check()?;
            run_tests()
        }
    }
}

fn run_fmt() -> Result<()> {
    run_cargo(&[
        "fmt",
        "--package",
        "markdown",
        "--package",
        "markdown_preview",
        "--",
        "--check",
    ])
}

fn run_check() -> Result<()> {
    run_cargo(&["check", "-p", "markdown", "--lib"])
}

fn run_tests() -> Result<()> {
    for args in [
        &[
            "test",
            "-p",
            "markdown",
            "test_preview_style_uses_larger_heading_scale_and_borders",
        ][..],
        &[
            "test",
            "-p",
            "markdown",
            "test_default_code_block_controls_are_visible_on_hover",
        ],
        &[
            "test",
            "-p",
            "markdown",
            "test_broken_image_link_renders_placeholder_text",
        ],
        &[
            "test",
            "-p",
            "markdown_preview",
            "builds_nested_markdown_heading_outline",
        ],
    ] {
        run_cargo(args)?;
    }

    Ok(())
}

fn run_cargo(args: &[&str]) -> Result<()> {
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_string());
    eprintln!("running: {cargo} {}", args.join(" "));

    let status = Command::new(&cargo)
        .args(args)
        .status()
        .context("failed to spawn cargo")?;

    if !status.success() {
        bail!("cargo {} failed: {status}", args.join(" "));
    }

    Ok(())
}
