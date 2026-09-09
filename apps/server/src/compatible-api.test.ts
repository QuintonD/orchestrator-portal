import { afterEach, describe, expect, it, vi } from "vitest";
import { compatibleApi, validateCompatibleApiConfig } from "./compatible-api.js";

const config = { endpoint: "http://127.0.0.1:8317/v1", token: "synthetic-proxy-key", model: "fixture-model", accessMode: "subscription", policyConfirmed: true };
const context = { connectorId: "proxy-fixture", config };
const completion = { id: "completion-fixture", choices: [{ finish_reason: "stop", message: { role: "assistant", content: "A source claim" } }] };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("subscription and local model API", () => {
  it.each(["http://127.0.0.1:8317", "http://127.0.0.1:8317/v1/", "https://proxy.example/prefix/v1"])("preserves the base path of %s and explicit history", async (endpoint) => {
    const fetch = vi.fn().mockResolvedValue(Response.json(completion));
    vi.stubGlobal("fetch", fetch);
    const result = await compatibleApi.sendMessage!({ ...context, config: { ...config, endpoint }, history: [{ role: "assistant", content: "Earlier answer" }] }, "Follow up");
    expect(result).toEqual({ state: "claimed", reply: "A source claim", remoteId: "completion-fixture" });
    const [url, options] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(`${endpoint.replace(/\/$/, "").replace(/\/v1$/, "")}/v1/chat/completions`);
    expect(options).toMatchObject({ method: "POST", redirect: "error", headers: { authorization: "Bearer synthetic-proxy-key" }, signal: expect.any(AbortSignal) });
    expect(JSON.parse(options.body)).toEqual({ model: "fixture-model", stream: false, max_tokens: 4096, messages: [{ role: "assistant", content: "Earlier answer" }, { role: "user", content: "Follow up" }] });
  });

  it.each([
    { endpoint: "https://user:private@proxy.example/v1" }, { endpoint: "http://remote.example/v1" },
    { endpoint: "file:///private" }, { endpoint: "https://proxy.example/?key=private" },
    { endpoint: "https://proxy.example/#private" }, { endpoint: "not a URL" },
    { token: "key\r\nInjected: private" }, { token: undefined }, { model: "" },
    { accessMode: "metered" }, { accessMode: undefined }, { policyConfirmed: false },
    { maxOutputTokens: 0 }, { maxOutputTokens: 16385 }, { maxOutputTokens: 2.5 },
    { fallbackModel: "paid-model" }, { model: "model\nprivate" },
  ])("rejects invalid configuration before network access: %j", async (invalid) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(compatibleApi.sendMessage!({ ...context, config: { ...config, ...invalid } }, "Hello")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows a local model without a token but requires a token remotely", () => {
    expect(validateCompatibleApiConfig({ ...config, accessMode: "local", token: undefined }).accessMode).toBe("local");
    expect(() => validateCompatibleApiConfig({ ...config, accessMode: "local", token: undefined, endpoint: "https://proxy.example" })).toThrow("token");
  });

  it("checks the selected model without generating a response", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [{ id: "fixture-model" }] })); vi.stubGlobal("fetch", fetch);
    expect(await compatibleApi.sync(context)).toMatchObject({ status: "connected", events: [] });
    expect(String(fetch.mock.calls[0]![0])).toBe("http://127.0.0.1:8317/v1/models");
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: "GET" });
    expect(fetch.mock.calls[0]![1]).not.toHaveProperty("body");
  });

  it.each([{ data: [] }, { data: [{ id: "different-model" }] }, { choices: [] }, { data: [{ id: 12 }] }])("does not call an unavailable model ready", async (catalog) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(catalog)));
    await expect(compatibleApi.sync(context)).rejects.toThrow();
  });

  it.each([401, 403, 429, 500, 302])("never retries or echoes the body of HTTP %s", async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response("private source credentials", { status })); vi.stubGlobal("fetch", fetch);
    await expect(compatibleApi.sendMessage!(context, "Hello")).rejects.not.toThrow("private source credentials");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { choices: [] }, { choices: [{ finish_reason: "stop", message: { role: "assistant", content: null } }] },
    { choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: "Run this", tool_calls: [{ function: { name: "exec", arguments: "untrusted" } }] } }] },
    { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "   " } }] },
  ])("keeps malformed and tool-only results unknown", async (result) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
    expect(await compatibleApi.sendMessage!(context, "Hello")).toEqual({ state: "unknown" });
  });

  it("retains truncated output as unknown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ ...completion.choices[0], finish_reason: "length" }] })));
    expect(await compatibleApi.sendMessage!(context, "Hello")).toEqual({ state: "unknown", reply: "A source claim" });
  });

  it.each(["private invalid JSON", "x".repeat(1024 * 1024 + 1)])("sanitizes invalid and oversized bodies", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(compatibleApi.sendMessage!(context, "Hello")).rejects.toThrow("No conclusive API response");
  });

  it("sanitizes transport failures and honors caller cancellation", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("private-secret-in-transport")); vi.stubGlobal("fetch", fetch);
    await expect(compatibleApi.sendMessage!(context, "Hello")).rejects.toThrow("No conclusive API response");
    await expect(compatibleApi.sync({ ...context, signal: AbortSignal.abort() })).rejects.toThrow("No conclusive API response");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds request size before dispatch", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(compatibleApi.sendMessage!({ ...context, history: [{ role: "user", content: "x".repeat(256 * 1024) }] }, "Hello")).rejects.toThrow("256 KiB");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts a stalled request without retrying", async () => {
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => nativeTimeout(10));
    const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetch);
    await expect(compatibleApi.sendMessage!(context, "Hello")).rejects.toThrow("No conclusive API response");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true);
  });
});
