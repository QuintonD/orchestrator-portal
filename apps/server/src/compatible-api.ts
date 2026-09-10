import { z } from "zod";
import type { AdapterContext, RuntimeAdapter } from "@orchestrator/adapter-sdk";
import { boundedText } from "./source-http.js";
import { validateReasoning } from "./reasoning.js";

const safeString = (maximum: number) => z.string().trim().min(1).max(maximum).regex(/^[^\x00-\x1f\x7f]+$/);
const configSchema = z.object({
  endpoint: safeString(2048),
  model: safeString(200),
  token: safeString(4096).optional(),
  accessMode: z.enum(["subscription", "local"]),
  policyConfirmed: z.literal(true),
  maxOutputTokens: z.number().int().min(256).max(16384).default(4096),
}).strict();

class ConnectionError extends Error {}

export function validateCompatibleApiConfig(input: Record<string, unknown>) {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) throw new ConnectionError("Choose a model, subscription or local access, and confirm that the source has no paid fallback. Check the address, token and output limit.");
  const config = parsed.data;
  let base: URL;
  try { base = new URL(config.endpoint); } catch { throw new ConnectionError("Enter a valid API base address."); }
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new ConnectionError("Use an HTTP(S) API base address without credentials, query parameters or a fragment.");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
  if (base.protocol === "http:" && !loopback) throw new ConnectionError("Remote connections require HTTPS.");
  if ((!loopback || config.accessMode === "subscription") && !config.token) throw new ConnectionError("A proxy access token is required for subscription or remote connections.");
  base.pathname = `${base.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/`;
  return { ...config, base };
}

async function request(context: AdapterContext, resource: string, body?: string): Promise<unknown> {
  const config = validateCompatibleApiConfig(context.config);
  const timeout = AbortSignal.timeout(body === undefined ? 10_000 : 120_000);
  const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
  try {
    signal.throwIfAborted();
    const response = await fetch(new URL(resource, config.base), {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(config.token ? { authorization: `Bearer ${config.token}` } : {}) },
      ...(body === undefined ? {} : { body }),
      redirect: "error", signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403].includes(response.status)) throw new ConnectionError("API access was rejected. Check the proxy token and sign in at the source.");
      if (response.status === 429) throw new ConnectionError("The source reported a usage limit. Wait or inspect its quota; no fallback was attempted.");
      throw new ConnectionError(`Compatible API returned HTTP ${response.status}. No retry was attempted.`);
    }
    return JSON.parse(await boundedText(response));
  } catch (error) {
    // Provider bodies, parsing errors and transport exceptions can contain secrets.
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError("No conclusive API response. Check the source before retrying; the request may have reached it.");
  }
}

const completionSchema = z.object({
  id: safeString(240).optional(),
  choices: z.array(z.object({
    finish_reason: z.string(),
    message: z.object({
      role: z.literal("assistant"),
      content: z.string().nullable(),
      tool_calls: z.array(z.unknown()).optional(),
      function_call: z.unknown().optional(),
    }),
  })).length(1),
});
const modelCatalogSchema = z.object({ data: z.array(z.object({ id: safeString(200) })).max(10_000) });
const messagesSchema = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }).strict()).max(21);

export const compatibleApi: RuntimeAdapter = {
  manifest: { id: "openai-compatible", displayName: "Subscription / local model API", version: "1.0.0", capabilities: ["message.send", "health.read"] },
  async sendMessage(context, body) {
    const config = validateCompatibleApiConfig(context.config);
    const messages = messagesSchema.safeParse([...(context.history ?? []).slice(-20), { role: "user", content: body }]);
    if (!messages.success) throw new ConnectionError("Conversation history is invalid.");
    const effort = validateReasoning("openai-compatible", "runtime", context.reasoningEffort);
    // Reasoning models require the completion budget, which also counts hidden reasoning.
    // Keep the existing wire format for connections with no explicit override.
    const options = effort === "default" ? { max_tokens: config.maxOutputTokens } : { reasoning_effort: effort, max_completion_tokens: config.maxOutputTokens };
    const payload = JSON.stringify({ model: config.model, stream: false, ...options, messages: messages.data });
    if (Buffer.byteLength(payload, "utf8") > 256 * 1024) throw new ConnectionError("Conversation exceeds the 256 KiB request limit. Start a shorter conversation.");
    const parsed = completionSchema.safeParse(await request(context, "chat/completions", payload));
    if (!parsed.success) return { state: "unknown" };
    const { message, finish_reason: finishReason } = parsed.data.choices[0]!;
    // This is text access, not a tool runner or a bridge to native agent sessions.
    if (message.tool_calls?.length || message.function_call || !message.content?.trim()) return { state: "unknown" };
    return { state: finishReason === "stop" ? "claimed" : "unknown", reply: message.content, ...(parsed.data.id ? { remoteId: parsed.data.id } : {}) };
  },
  async sync(context) {
    const config = validateCompatibleApiConfig(context.config);
    const started = performance.now();
    const parsed = modelCatalogSchema.safeParse(await request(context, "models"));
    if (!parsed.success) throw new ConnectionError("The API did not return a supported model catalog.");
    if (!parsed.data.data.some((model) => model.id === config.model)) throw new ConnectionError("The selected model is absent from the source catalog. Check its model ID and account access.");
    return { status: "connected", latencyMs: Math.round(performance.now() - started), events: [] };
  },
};
