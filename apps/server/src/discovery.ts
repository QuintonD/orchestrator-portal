import { stat } from "node:fs/promises";
import path from "node:path";

// Probe known executable locations only. Never crawl home folders, read credentials,
// launch a discovered program, or contact a runtime during discovery.
export async function discoverLocalTools(environment: NodeJS.ProcessEnv = process.env, platform = process.platform) {
  const directories = (environment.PATH ?? "").split(path.delimiter).filter((entry) => path.isAbsolute(entry)).slice(0, 128);
  const file = async (candidate: string) => {
    try { return (await stat(candidate)).isFile(); } catch { return false; }
  };
  const candidates = [
    { kind: "openclaw-cli", name: "OpenClaw", paths: platform === "win32"
      ? [environment.ORCHESTRATOR_OPENCLAW_ENTRY, ...directories.map((dir) => path.join(dir, "node_modules", "openclaw", "openclaw.mjs"))]
      : directories.map((dir) => path.join(dir, "openclaw")) },
    { kind: "gbrain-cli", name: "gbrain", paths: directories.map((dir) => path.join(dir, platform === "win32" ? "gbrain.exe" : "gbrain")) },
  ];
  return Promise.all(candidates.map(async ({ kind, name, paths }) => ({ kind, name,
    available: (await Promise.all(paths.filter((entry): entry is string => Boolean(entry) && path.isAbsolute(entry!)).map(file))).some(Boolean),
  })));
}
