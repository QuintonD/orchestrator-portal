import { createHash } from "node:crypto";
import { cp, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compiledFiles, webFiles } from "./staging.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const runtime = JSON.parse(await readFile(new URL("runtime.json", import.meta.url), "utf8"));
const metadata = JSON.parse(await readFile(path.join(repo, "package.json"), "utf8"));
const target = process.argv[2] ?? `${process.platform}-${process.arch}`;
if (process.argv.length > 3 || !runtime.targets[target]) throw new Error(`Supported targets: ${Object.keys(runtime.targets).join(", ")}`);
const [platform] = target.split("-");
const spec = runtime.targets[target];
const output = path.join(repo, "dist", "desktop");
await mkdir(output, { recursive: true });
const work = await mkdtemp(path.join(output, ".build-"));
const name = `orchestrator-${metadata.version}-${target}`;
const bundle = path.join(work, name);

function run(binary, args, cwd = repo, env = process.env) {
  const result = spawnSync(binary, args, { cwd, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(binary)} failed with exit code ${result.status}.`);
}

async function copy(source, destination, options = {}) {
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, ...options });
}

function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }

async function inventory(directory, relative = "") {
  const results = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const filename = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected package symlink: ${filename}`);
    if (entry.isDirectory()) results.push(...await inventory(directory, filename));
    else if (entry.isFile()) results.push(`${sha256(await readFile(path.join(directory, filename)))}  ${filename.split(path.sep).join("/")}`);
    else throw new Error(`Unexpected package file type: ${filename}`);
  }
  return results.sort();
}

try {
  for (const directory of ["apps/server", "packages/contracts", "packages/adapter-sdk"]) {
    await copy(path.join(repo, directory, "package.json"), path.join(bundle, directory, "package.json"));
    for (const file of await compiledFiles(path.join(repo, directory, "src"), path.join(repo, directory, "dist"))) await copy(path.join(repo, directory, "dist", file), path.join(bundle, directory, "dist", file));
  }
  for (const file of await webFiles(path.join(repo, "apps/web/dist"))) await copy(path.join(repo, "apps/web/dist", file), path.join(bundle, "apps/web/dist", file));
  for (const filename of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) await copy(path.join(repo, filename), path.join(bundle, filename));
  await copy(path.join(repo, "docs/desktop.md"), path.join(bundle, "README.md"));
  for (const filename of ["launcher.mjs", "paths.mjs", "runtime.json"]) await copy(new URL(filename, import.meta.url), path.join(bundle, "desktop", filename));
  // The web bundle embeds these libraries; their npm directories are not runtime dependencies of the API.
  for (const [dependency, license] of [["react", "LICENSE"], ["react-dom", "LICENSE"], ["scheduler", "LICENSE"], ["lucide-react", "LICENSE"], ["vite", "LICENSE.md"], ["rolldown", "LICENSE"]]) {
    await copy(path.join(repo, "node_modules", dependency, license), path.join(bundle, "licenses", `${dependency}.txt`));
  }

  // Install from the checked-in lock in an isolated tree. No local data or developer node_modules enter the archive.
  const dependencies = path.join(work, "dependencies");
  for (const filename of ["package.json", "package-lock.json", "apps/server/package.json", "apps/web/package.json", "packages/contracts/package.json", "packages/adapter-sdk/package.json"]) await copy(path.join(repo, filename), path.join(dependencies, filename));
  for (const directory of ["apps/server", "packages/contracts", "packages/adapter-sdk"]) await copy(path.join(bundle, directory, "dist"), path.join(dependencies, directory, "dist"));
  const npm = [process.env.npm_execpath, path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")].find((candidate) => candidate && existsSync(candidate));
  if (!npm) throw new Error("Cannot locate the build machine's npm CLI. Run this script using npm run desktop:package.");
  run(process.execPath, [npm, "ci", "--omit=dev", "--ignore-scripts", "--workspace=@orchestrator/server", "--include-workspace-root=false", "--no-audit", "--no-fund"], dependencies);
  await copy(path.join(dependencies, "node_modules"), path.join(bundle, "node_modules"), { dereference: true, filter: (source) => path.basename(source) !== ".bin" });

  const cache = path.join(output, ".runtime-cache");
  await mkdir(cache, { recursive: true });
  const archivePath = path.join(cache, spec.archive);
  let bytes;
  if (existsSync(archivePath)) bytes = await readFile(archivePath);
  else {
    console.log(`Downloading official Node ${runtime.version} for ${target}...`);
    const response = await fetch(`https://nodejs.org/dist/v${runtime.version}/${spec.archive}`, { signal: AbortSignal.timeout(180000), redirect: "error" });
    if (!response.ok) throw new Error(`Node download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (sha256(bytes) !== spec.sha256) throw new Error(`Node archive checksum mismatch: ${spec.archive}. Remove only the cached archive and retry; do not bypass verification.`);
  await writeFile(archivePath, bytes);
  const extracted = path.join(work, "runtime");
  await mkdir(extracted);
  run("tar", ["-xf", archivePath, "-C", extracted]);
  const runtimeRoot = path.join(extracted, spec.archive.replace(/\.(zip|tar\.gz)$/, ""));
  const binary = platform === "win32" ? "node.exe" : "node";
  await copy(path.join(runtimeRoot, platform === "win32" ? "node.exe" : "bin/node"), path.join(bundle, "runtime", binary));
  await copy(path.join(runtimeRoot, "LICENSE"), path.join(bundle, "runtime", "LICENSE"));
  if (platform !== "win32") await chmod(path.join(bundle, "runtime", binary), 0o755);
  await writeFile(path.join(bundle, "package.json"), JSON.stringify({ name: metadata.name, version: metadata.version, private: true, type: "module" }, null, 2) + "\n");
  await writeFile(path.join(bundle, "bundle.json"), JSON.stringify({ version: metadata.version, target, runtime: runtime.version, runtimeArchive: spec.archive, runtimeSha256: spec.sha256 }, null, 2) + "\n");
  if (platform === "win32") {
    await writeFile(path.join(bundle, "Orchestrator.cmd"), '@echo off\r\nsetlocal\r\n"%~dp0runtime\\node.exe" "%~dp0desktop\\launcher.mjs" %*\r\nset "orchestrator_exit=%errorlevel%"\r\nif "%~1"=="" if not "%orchestrator_exit%"=="0" pause\r\nexit /b %orchestrator_exit%\r\n');
  } else {
    const launcher = '#!/bin/sh\nset -eu\nSCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$SCRIPT_DIR/runtime/node" "$SCRIPT_DIR/desktop/launcher.mjs" "$@"\n';
    await writeFile(path.join(bundle, "orchestrator"), launcher, { mode: 0o755 });
    if (platform === "darwin") await writeFile(path.join(bundle, "Orchestrator.command"), launcher, { mode: 0o755 });
  }
  await writeFile(path.join(bundle, "FILES.sha256"), (await inventory(bundle)).join("\n") + "\n");
  const archiveName = name + (platform === "win32" ? ".zip" : ".tar.gz");
  const archive = path.join(output, archiveName);
  if (platform === "win32") {
    if (process.platform !== "win32") throw new Error("Build Windows ZIP archives on a Windows runner so the native archive tool is available.");
    // Windows bsdtar ZIP creation can lose Unicode names; .NET writes their UTF-8 flag.
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference = 'Stop'; Compress-Archive -LiteralPath $env:ORCHESTRATOR_ARCHIVE_SOURCE -DestinationPath $env:ORCHESTRATOR_ARCHIVE_DESTINATION -CompressionLevel Optimal -Force"], repo, { ...process.env, ORCHESTRATOR_ARCHIVE_SOURCE: bundle, ORCHESTRATOR_ARCHIVE_DESTINATION: archive });
  } else run("tar", ["-czf", archive, "-C", work, name]);
  await writeFile(archive + ".sha256", `${sha256(await readFile(archive))}  ${archiveName}\n`);
  console.log(`Desktop archive: ${archive}`);
} finally {
  // Only remove the fresh build directory resolved beneath this repository's desktop output.
  const relative = path.relative(output, work);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(work).startsWith(".build-")) await rm(work, { recursive: true, force: true });
}
