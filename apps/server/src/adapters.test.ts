import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedText, runtimeAdapters, openClawTurnResult } from "./adapters.js";

afterEach(() => vi.unstubAllGlobals());
describe("Hermes compatibility", () => {
  it("carries only explicit history and returns a claim, never verification", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "A source response" } }] })));
    vi.stubGlobal("fetch", fetch);
    const result = await runtimeAdapters.get("hermes-api")!.sendMessage!({ connectorId: "hermes", config: { endpoint: "http://127.0.0.1:8642", token: "fixture-token" }, history: [{ role: "user", content: "Earlier question" }] }, "Follow up");
    expect(result.state).toBe("claimed"); expect(result.reply).toBe("A source response");
    expect(fetch.mock.calls[0]![0]).toBe("http://127.0.0.1:8642/v1/chat/completions");
    const request = fetch.mock.calls[0]![1];
    expect(JSON.parse(request.body).messages).toHaveLength(2); expect(request.redirect).toBe("error");
    expect(request.headers.authorization).toBe("Bearer fixture-token");
  });
  it("reports a malformed success response as unknown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"choices":[]}')));
    const result = await runtimeAdapters.get("hermes-api")!.sendMessage!({ connectorId: "hermes", config: { endpoint: "http://127.0.0.1:8642" } }, "Hello");
    expect(result.state).toBe("unknown");
  });
  it("limits response size before parsing untrusted data", async () => {
    await expect(boundedText(new Response("x".repeat(200)), 100)).rejects.toThrow("limit");
  });
  it.each([
    { finish_reason: "stop", message: { role: "assistant", content: "  " } },
    { finish_reason: "length", message: { role: "assistant", content: "Partial result" } },
    { message: { role: "assistant", content: "No completion receipt" } },
    { finish_reason: "tool_calls", message: { role: "assistant", content: "About to inspect", tool_calls: [{}] } },
    { finish_reason: "stop", message: { role: "assistant", content: "Legacy tool", function_call: {} } },
    { finish_reason: "stop", message: { role: "tool", content: "Tool receipt" } },
    { finish_reason: "stop", message: { content: "Missing role" } },
  ])("does not promote incomplete or tool-only output: %j", async (choice) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [choice] }))));
    const result = await runtimeAdapters.get("hermes-api")!.sendMessage!({ connectorId: "hermes", config: { endpoint: "http://127.0.0.1:8642" } }, "Review this evidence");
    expect(result.state).toBe("unknown");
    if (choice.finish_reason === "length") expect(result.reply).toBe("Partial result");
    if (choice.message.tool_calls || choice.message.function_call) expect(result.reply).toBeUndefined();
  });
});

describe("OpenClaw deliverable evidence", () => {
  it.each([{}, null, { status: "ok" }, { payloads: [] }, { result: { reply: "  " } }, "  "])("does not invent a reply from %j", (output) => {
    expect(openClawTurnResult(output)).toMatchObject({ state: "unknown" });
    expect(openClawTurnResult(output).reply).toBeUndefined();
  });
  it("retains a real payload as a source claim", () => {
    expect(openClawTurnResult({ result: { payloads: [{ text: "Finding with evidence" }] } })).toMatchObject({ state: "claimed", reply: "Finding with evidence" });
  });
  it.each([{ status: "error", message: "Quota exhausted" }, { status: "failed", reply: "Partial draft" }, { result: { state: "cancelled", text: "Interrupted draft" } }])("retains explicit failure text as unknown: %j", (output) => {
    expect(openClawTurnResult(output).state).toBe("unknown");
    expect(openClawTurnResult(output).reply).toBeTruthy();
  });
});
