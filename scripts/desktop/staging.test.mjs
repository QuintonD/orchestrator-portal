import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compiledFiles, webFiles } from "./staging.mjs";

test("only compiled production modules with matching source enter the package", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orchestrator-staging-"));
  const source = path.join(root, "src");
  const dist = path.join(root, "dist");
  await mkdir(source);
  await mkdir(dist);
  for (const filename of ["server.ts", "server.test.ts", "types.d.ts"]) await writeFile(path.join(source, filename), "");
  for (const filename of ["server.js", "server.test.js", "deleted-module.js", "master.key", "orchestrator.db", ".env", "server.js.map"]) await writeFile(path.join(dist, filename), "sentinel");
  assert.deepEqual(await compiledFiles(source, dist), ["server.js"]);
  await writeFile(path.join(source, "missing.ts"), "");
  await assert.rejects(compiledFiles(source, dist), /Missing compiled/);
});

test("web packaging excludes arbitrary build files and rejects directory symlinks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orchestrator-web-staging-"));
  const dist = path.join(root, "dist");
  await mkdir(path.join(dist, "assets"), { recursive: true });
  for (const filename of ["index.html", "mark.svg", "manifest.webmanifest", "assistant-original.png", "unrelated.png", "master.key", ".env"]) await writeFile(path.join(dist, filename), "sentinel");
  for (const filename of ["index-abc123.js", "index-abc123.css", "index-abc123.js.map", "orchestrator.db"]) await writeFile(path.join(dist, "assets", filename), "sentinel");
  assert.deepEqual((await webFiles(dist)).sort(), [path.join("assets", "index-abc123.css"), path.join("assets", "index-abc123.js"), "index.html", "manifest.webmanifest", "mark.svg", "assistant-original.png"].sort());
  // Windows directory junctions exercise the symlink boundary without administrator privileges.
  await symlink(dist, path.join(root, "linked-dist"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(webFiles(path.join(root, "linked-dist")), /symlinks/);
});
