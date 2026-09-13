import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

const release = process.argv[2] === "release";
if (process.argv.slice(2).some((argument) => argument !== "release")) {
  throw new Error("Usage: node scripts/phone-android-build.mjs [release]");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const project = fileURLToPath(new URL("../apps/phone-android/", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const identity = new URL("../apps/phone-android/app/build/generated/releaseIdentity/", import.meta.url);
mkdirSync(identity, { recursive: true });
writeFileSync(new URL("release-identity.json", identity), JSON.stringify({
  commit: git("rev-parse", "HEAD"),
  dirty: git("status", "--porcelain").length > 0,
  variant: release ? "Release" : "Debug",
}, null, 2));
const variant = release ? "Release" : "Debug";
const result = spawnSync(process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew", [
  `:app:assemble${variant}`, `:app:test${variant}UnitTest`, `:app:lint${variant}`,
  `:app:verify${variant}Artifact`, "-PrequireReleaseIdentity=true",
  ...(!release ? [":fixture:assembleDebug", ":fixture:lintDebug", ":app:assembleDebugAndroidTest"] : []),
  "--console=plain",
], { cwd: project, stdio: "inherit", shell: process.platform === "win32" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
