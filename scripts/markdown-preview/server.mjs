import express from "express";
import chokidar from "chokidar";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import markdownItKatex from "markdown-it-katex";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_PORT = 4477;
const IMAGE_EXTENSIONS = new Set([
  ".apng",
  ".avif",
  ".gif",
  ".jpg",
  ".jpeg",
  ".png",
  ".svg",
  ".webp",
]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") {
      args.file = argv[++i];
    } else if (arg.startsWith("--file=")) {
      args.file = arg.slice("--file=".length);
    } else if (arg === "--root") {
      args.root = argv[++i];
    } else if (arg.startsWith("--root=")) {
      args.root = arg.slice("--root=".length);
    } else if (arg === "--port") {
      args.port = Number(argv[++i]);
    } else if (arg.startsWith("--port=")) {
      args.port = Number(arg.slice("--port=".length));
    }
  }

  return args;
}

function normalizeRoot(root) {
  const normalized = resolve(root ?? process.cwd());
  return normalized.endsWith(sep) ? normalized.slice(0, -1) : normalized;
}

function isInsideRoot(path, root) {
  const target = resolve(path);
  const workspace = normalizeRoot(root);
  const rel = relative(workspace, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function resolveMarkdownFile(file, root) {
  if (!file) {
    return null;
  }

  const absolute = resolve(file);
  if (!isInsideRoot(absolute, root)) {
    throw new Error(`Markdown file must be inside workspace root: ${absolute}`);
  }

  return absolute;
}

function resolveAssetPath(requestPath, root) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const relativePath = decoded.replace(/^\/+/, "");
  const candidate = resolve(root, relativePath);

  if (!isInsideRoot(candidate, root)) {
    return null;
  }

  return candidate;
}

function readGithubMarkdownCss() {
  try {
    return readFileSync(require.resolve("github-markdown-css/github-markdown.css"), "utf8");
  } catch {
    try {
      return readFileSync(require.resolve("github-markdown-css"), "utf8");
    } catch {
      return "";
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toAssetUrl(src, markdownFile, root) {
  if (!src || /^[a-z][a-z\d+.-]*:/i.test(src) || src.startsWith("#")) {
    return src;
  }

  const baseDir = markdownFile ? dirname(markdownFile) : root;
  const absolute = resolve(baseDir, src);

  if (!isInsideRoot(absolute, root)) {
    return src;
  }

  return `/assets/${relative(root, absolute).split(sep).map(encodeURIComponent).join("/")}`;
}

function createMarkdownRenderer(state) {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  })
    .use(anchor, {
      permalink: anchor.permalink.linkInsideHeader({
        symbol: "#",
        placement: "after",
        class: "anchor",
        ariaHidden: true,
      }),
    })
    .use(taskLists, { enabled: true, label: true, labelAfter: true })
    .use(markdownItKatex);

  const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules);
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const language = token.info.trim().split(/\s+/)[0];

    if (language === "mermaid") {
      return `<pre class="mermaid">${escapeHtml(token.content)}</pre>\n`;
    }

    return defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  const defaultImage = md.renderer.rules.image ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const srcIndex = token.attrIndex("src");
    if (srcIndex >= 0) {
      token.attrs[srcIndex][1] = toAssetUrl(token.attrs[srcIndex][1], state.activeFile, state.root);
    }
    return defaultImage(tokens, idx, options, env, self);
  };

  return md;
}

function renderTemplate({ body, activeFile, css }) {
  const title = activeFile ? `Markdown Preview: ${activeFile}` : "Markdown Preview";

  return `<!doctype html>
<html lang="en" data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${css}</style>
  <style>
    :root {
      color-scheme: light dark;
      --preview-canvas: #ffffff;
      --preview-text: #24292f;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --preview-canvas: #0d1117;
        --preview-text: #e6edf3;
      }
    }

    body {
      margin: 0;
      background: var(--preview-canvas);
      color: var(--preview-text);
    }

    .markdown-body {
      box-sizing: border-box;
      max-width: 980px;
      min-height: 100vh;
      margin: 0 auto;
      padding: 40px 48px;
    }

    .markdown-body pre.mermaid {
      background: transparent;
      text-align: center;
    }

    @media (max-width: 767px) {
      .markdown-body {
        padding: 24px 16px;
      }
    }
  </style>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

    mermaid.initialize({
      startOnLoad: true,
      theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default"
    });

    const events = new EventSource("/events");
    events.addEventListener("reload", () => window.location.reload());
  </script>
</head>
<body>
  <main class="markdown-body">
    ${body}
  </main>
</body>
</html>`;
}

export function createPreviewState({ root = process.cwd(), file = null } = {}) {
  const normalizedRoot = normalizeRoot(root);
  return {
    root: normalizedRoot,
    activeFile: file ? resolveMarkdownFile(file, normalizedRoot) : null,
    clients: new Set(),
    css: readGithubMarkdownCss(),
  };
}

export function broadcastReload(state) {
  for (const client of state.clients) {
    client.write("event: reload\n");
    client.write(`data: ${Date.now()}\n\n`);
  }
}

export function createDebouncedBroadcast(state, delay = 100) {
  let timeout = null;
  return () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      broadcastReload(state);
    }, delay);
  };
}

export function createApp(state = createPreviewState()) {
  const app = express();
  const md = createMarkdownRenderer(state);

  app.get("/ping", (_req, res) => {
    res.status(200).type("text/plain").send("ok");
  });

  app.get("/switch", (req, res) => {
    const requestedFile = req.query.file;

    if (typeof requestedFile !== "string" || requestedFile.length === 0) {
      res.status(400).json({ error: "Missing file query parameter" });
      return;
    }

    try {
      state.activeFile = resolveMarkdownFile(requestedFile, state.root);
      broadcastReload(state);
      res.status(200).json({ ok: true, file: state.activeFile });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/events", (req, res) => {
    res.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 1000\n\n");

    state.clients.add(res);
    req.on("close", () => {
      state.clients.delete(res);
    });
  });

  app.use("/assets", (req, res) => {
    const assetPath = resolveAssetPath(req.path, state.root);
    if (!assetPath) {
      res.sendStatus(403);
      return;
    }

    if (!existsSync(assetPath)) {
      res.sendStatus(404);
      return;
    }

    const stat = statSync(assetPath);
    if (!stat.isFile()) {
      res.sendStatus(404);
      return;
    }

    res.sendFile(assetPath);
  });

  app.get("/", (_req, res) => {
    if (!state.activeFile) {
      res.status(404).type("html").send(renderTemplate({
        activeFile: null,
        body: "<p>No Markdown file selected.</p>",
        css: state.css,
      }));
      return;
    }

    if (!existsSync(state.activeFile)) {
      res.status(404).type("html").send(renderTemplate({
        activeFile: state.activeFile,
        body: `<p>Markdown file not found: <code>${escapeHtml(state.activeFile)}</code></p>`,
        css: state.css,
      }));
      return;
    }

    const source = readFileSync(state.activeFile, "utf8");
    const body = md.render(source);
    res.status(200).type("html").send(renderTemplate({
      activeFile: state.activeFile,
      body,
      css: state.css,
    }));
  });

  return app;
}

function openBrowser(url) {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function pingExistingServer(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/ping`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function switchExistingServer(port, file) {
  const url = new URL(`http://127.0.0.1:${port}/switch`);
  url.searchParams.set("file", file);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Existing preview server rejected switch request with HTTP ${response.status}`);
  }
}

function startWatchers(state, debouncedBroadcast) {
  const watched = [];

  if (state.activeFile) {
    watched.push(state.activeFile);
  }

  watched.push(join(state.root, "**/*"));

  const watcher = chokidar.watch(watched, {
    awaitWriteFinish: {
      pollInterval: 50,
      stabilityThreshold: 100,
    },
    ignored: (path) => {
      if (path === state.activeFile) {
        return false;
      }

      if (path === state.root) {
        return false;
      }

      try {
        if (existsSync(path) && statSync(path).isDirectory()) {
          return false;
        }
      } catch {
        return false;
      }

      return !IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
    },
    ignoreInitial: true,
  });

  watcher.on("add", debouncedBroadcast);
  watcher.on("change", debouncedBroadcast);
  watcher.on("unlink", debouncedBroadcast);

  return watcher;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const port = Number.isFinite(args.port) ? args.port : DEFAULT_PORT;
  const root = normalizeRoot(args.root ?? process.cwd());
  const file = args.file ? resolve(args.file) : null;

  if (!file) {
    console.error("Missing required --file <absolute_markdown_file> argument.");
    process.exitCode = 1;
    return;
  }

  if (await pingExistingServer(port)) {
    await switchExistingServer(port, file);
    console.log(`Markdown preview switched to ${file}`);
    process.exit(0);
  }

  const state = createPreviewState({ root, file });
  const app = createApp(state);
  const debouncedBroadcast = createDebouncedBroadcast(state, 100);
  const watcher = startWatchers(state, debouncedBroadcast);
  const server = app.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`Markdown preview serving ${state.activeFile}`);
    console.log(url);
    openBrowser(url);
  });

  const shutdown = () => {
    watcher.close().finally(() => {
      server.close(() => process.exit(0));
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
