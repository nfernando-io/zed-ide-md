import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp, createPreviewState } from "../server.mjs";

describe("markdown preview server", () => {
  let root;
  let markdownFile;
  let secondMarkdownFile;
  let state;
  let app;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "zed-markdown-preview-"));
    markdownFile = join(root, "README.md");
    secondMarkdownFile = join(root, "notes.md");

    writeFileSync(markdownFile, [
      "# Preview Title",
      "",
      "- [x] checked item",
      "",
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
    ].join("\n"));
    writeFileSync(secondMarkdownFile, "# Switched Title\n");

    state = createPreviewState({ root, file: markdownFile });
    app = createApp(state);
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
  });

  test("renders compiled GitHub-flavored Markdown with expected classes and headers", async () => {
    const response = await request(app).get("/").expect(200);

    expect(response.text).toContain('class="markdown-body"');
    expect(response.text).toContain("<h1");
    expect(response.text).toContain('id="preview-title"');
    expect(response.text).toContain("Preview Title");
    expect(response.text).toContain('class="contains-task-list"');
    expect(response.text).toContain("<table>");
  });

  test("switch updates the active file and renders the new document", async () => {
    const switchResponse = await request(app)
      .get("/switch")
      .query({ file: secondMarkdownFile })
      .expect(200);

    expect(switchResponse.body).toEqual({ ok: true, file: secondMarkdownFile });
    expect(state.activeFile).toBe(secondMarkdownFile);

    const pageResponse = await request(app).get("/").expect(200);
    expect(pageResponse.text).toContain("Switched Title");
    expect(pageResponse.text).not.toContain("Preview Title");
  });

  test("assets route prevents directory traversal outside the workspace root", async () => {
    const response = await request(app).get("/assets/../../../../etc/passwd");

    expect([403, 404]).toContain(response.status);
    expect(response.text).not.toContain("root:");
  });
});
