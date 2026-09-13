import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { runtimeEnvironment } from "./runtime-environment.js";

describe("source process authority", () => {
  it("removes gateway device credentials case-insensitively without changing source configuration", () => {
    const input = {
      PATH: "/synthetic/bin",
      OPENAI_API_KEY: "synthetic-source-owned-key",
      ORCHESTRATOR_OPENCLAW_ENTRY: "/synthetic/openclaw.mjs",
      ORCHESTRATOR_PHONE_BROKER_TOKEN: "synthetic-owner-token",
      orchestrator_phone_broker_token_file: "/synthetic/owner-token",
      PHONE_CONTROL_TOKEN: "synthetic-phone-token",
      Phone_Control_Config: "/synthetic/broker-config",
      ORCHESTRATOR_MASTER_KEY: "synthetic-vault-key",
    };
    expect(runtimeEnvironment(input)).toEqual({
      PATH: input.PATH,
      OPENAI_API_KEY: input.OPENAI_API_KEY,
      ORCHESTRATOR_OPENCLAW_ENTRY: input.ORCHESTRATOR_OPENCLAW_ENTRY,
    });
    expect(input.ORCHESTRATOR_PHONE_BROKER_TOKEN).toBe("synthetic-owner-token");
  });

  it("keeps the owner token and vault key out of an actual child process", async () => {
    const { stdout } = await promisify(execFile)(process.execPath, ["-e", [
      "const names = ['ORCHESTRATOR_PHONE_BROKER_TOKEN','ORCHESTRATOR_MASTER_KEY','PHONE_CONTROL_TOKEN'];",
      "process.stdout.write(JSON.stringify({inherited: names.filter(name => process.env[name]), source: process.env.SOURCE_FIXTURE_MARKER}));",
    ].join("\n")], {
      windowsHide: true,
      timeout: 5000,
      env: runtimeEnvironment({
        ...process.env,
        ORCHESTRATOR_PHONE_BROKER_TOKEN: "synthetic-owner-token",
        ORCHESTRATOR_MASTER_KEY: "synthetic-vault-key",
        PHONE_CONTROL_TOKEN: "synthetic-phone-token",
        SOURCE_FIXTURE_MARKER: "source-config-preserved",
      }),
    });
    expect(JSON.parse(stdout)).toEqual({ inherited: [], source: "source-config-preserved" });
  });
});
