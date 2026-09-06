import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { discoverLocalTools } from "./discovery.js";

describe("local discovery", () => {
  it("finds supported entries without executing them or returning local paths", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "portal-discovery-"));
    try {
      await mkdir(path.join(dir, "node_modules/openclaw"), { recursive: true });
      await writeFile(path.join(dir, "node_modules/openclaw/openclaw.mjs"), 'throw new Error("must not execute")');
      await writeFile(path.join(dir, "gbrain.exe"), "not executable");
      const tools = await discoverLocalTools({ PATH: dir }, "win32");
      expect(tools).toEqual([{ kind: "openclaw-cli", name: "OpenClaw", available: true }, { kind: "gbrain-cli", name: "gbrain", available: true }]);
      expect(JSON.stringify(tools)).not.toContain(dir);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("handles missing tools and ignores relative search locations", async () => {
    expect((await discoverLocalTools({ PATH: ".", ORCHESTRATOR_OPENCLAW_ENTRY: "./missing.mjs" }, "win32")).every((tool) => !tool.available)).toBe(true);
  });
});
