import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

async function regularFiles(directory, relative = "") {
  const base = path.join(directory, relative);
  const stat = await lstat(base);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Application build directories must be real directories, not symlinks.");
  const result = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Application source/build symlinks are not permitted in desktop packaging.");
    const filename = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await regularFiles(directory, filename));
    else if (entry.isFile()) result.push(filename);
    else throw new Error("Application builds may contain only regular files and directories.");
  }
  return result;
}

export async function compiledFiles(source, dist) {
  const emitted = new Set(await regularFiles(dist));
  const files = (await regularFiles(source))
    .filter((file) => file.endsWith(".ts") && !/\.(test|spec|d)\.ts$/.test(file))
    .map((file) => file.slice(0, -3) + ".js");
  for (const file of files) if (!emitted.has(file)) throw new Error(`Missing compiled output ${file}; run npm run build first.`);
  return files;
}

export async function webFiles(dist) {
  return (await regularFiles(dist)).filter((file) => {
    const relative = file.split(path.sep).join("/");
    return ["index.html", "mark.svg", "manifest.webmanifest", "assistant-original.png"].includes(relative)
      || /^assets\/[a-zA-Z0-9_-]+\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|webp|ico)$/.test(relative);
  });
}
