import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const release = process.argv[2] === "release";
if (release && (!process.env.ORCHESTRATOR_ANDROID_KEYSTORE || !process.env.ORCHESTRATOR_ANDROID_KEY_PASSWORD)) {
  throw new Error("Release builds require ORCHESTRATOR_ANDROID_KEYSTORE and ORCHESTRATOR_ANDROID_KEY_PASSWORD. See docs/android.md.");
}
const variant = release ? "Release" : "Debug";
const result = spawnSync(process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew", [
  `:app:assemble${variant}`, `:app:test${variant}UnitTest`, `:app:lint${variant}`, "--console=plain",
], { cwd: fileURLToPath(new URL("../apps/android", import.meta.url)), stdio: "inherit", shell: process.platform === "win32" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
