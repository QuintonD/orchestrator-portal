import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedText, runtimeAdapters } from "./adapters.js";

afterEach(() => vi.unstubAllGlobals());
describe("Hermes compatibility", () => {
  it("carries only explicit history and returns a claim, never verification", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "A source response" } }] })));
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
});
