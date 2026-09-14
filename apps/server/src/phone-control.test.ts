import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./server.js";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

const cleanup: Array<() => Promise<unknown>> = [];
const adminToken = "synthetic_phone_admin_token_private_123456789";
const agentToken = "synthetic_scoped_agent_token_once_123456789";
const brokerKeys = generateKeyPairSync("ed25519");
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
async function signedReply(value: unknown, url: string, init: RequestInit) {
  const response = value instanceof Response ? value : Response.json(value);
  const text = await response.text();
  const fields = ["orchestrator-phone-control/http-response/v1", new Headers(init.headers).get("x-phone-request-nonce"), init.method, new URL(url).pathname, digest(String(init.body ?? "")), response.status, digest(text)];
  const headers = new Headers(response.headers); headers.set("x-phone-response-signature", sign(null, Buffer.from(JSON.stringify(fields)), brokerKeys.privateKey).toString("base64url"));
  return new Response(text, { status: response.status, headers });
}
const phone = { id: "phone", label: "Fixture phone", busy: false };
const scope = { apps: ["org.example.notes"], operations: ["describe", "observe", "apps.list", "tap"], expiresAt: new Date(Date.now() + 600000).toISOString() };
const session = { id: "session", deviceId: phone.id, ...scope };
const state = { devices: [phone], sessions: [session], credentials: [] };
const call = { id: "request", deviceId: "phone", sessionId: "session", method: "tap", params: { observationId: "screen", x: 20, y: 30 } };
const screen = { observationId: "screen", packageName: "org.example.notes", windowId: 1, width: 400, height: 800, capturedAt: new Date().toISOString(), nodes: [{ id: "node", text: "Untrusted <script>prompt</script>", bounds: { left: 0, top: 0, right: 100, bottom: 60 }, editable: true, clickable: true }], screenshot: { mimeType: "image/png", base64: "iVBORw0KGgo=" } };
const recovery = { retryCount: 1, initialError: "screenshot_internal_error", initialStage: "awaiting_callback", initialElapsedMs: 5000, totalElapsedMs: 6000 };

afterEach(async () => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture({ demo = false, configured = true } = {}) {
  vi.stubEnv("ORCHESTRATOR_PHONE_BROKER_TOKEN", configured ? adminToken : "");
  vi.stubEnv("ORCHESTRATOR_PHONE_BROKER_PUBLIC_KEY", brokerKeys.publicKey.export({ type: "spki", format: "pem" }).toString());
  const directory = await mkdtemp(path.join(os.tmpdir(), "phone-api-test-"));
  cleanup.push(async () => {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("phone-api-test-")) throw new Error("Unsafe fixture cleanup path");
    await rm(directory, { recursive: true, force: true });
  });
  const app = await createApp({ dataDir: directory, demo, host: "127.0.0.1", isLoopback: true, allowedOrigins: new Set(["http://127.0.0.1:4400"]) });
  cleanup.push(() => app.close());
  if (demo) return { app, headers: {} as Record<string, string>, cookie: "" };
  const setup = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { displayName: "Phone fixture", password: "synthetic fixture password long enough" } });
  expect(setup.statusCode).toBe(201);
  const cookie = setup.cookies.map((item) => `${item.name}=${item.value}`).join("; ");
  const csrf = setup.cookies.find((item) => item.name === "orchestrator_csrf")!.value;
  return { app, headers: { cookie, "x-csrf-token": csrf }, cookie };
}
function mockBroker(fn: (url: string, init: RequestInit) => unknown = (url) => url.endsWith("/audit") ? { events: [] } : state) {
  const spy = vi.fn(async (url: string, init: RequestInit) => {
    const value = await fn(url, init);
    if (value instanceof Error) throw value;
    return signedReply(value, url, init);
  });
  vi.stubGlobal("fetch", spy); return spy;
}

describe("standalone phone-control boundary", () => {
  it("keeps document scopes strict and propagates selected handles through sessions, credentials and tasks", async () => {
    const { app, headers } = await fixture();
    const resourceScope = { adapter: "android.document.v1", resourceIds: ["document-one"], effects: ["document.read", "document.replace"] };
    const grant = { apps: [], operations: ["describe", "stop", ...resourceScope.effects], disclosure: { screenshots: false }, resourceScope, ttlSeconds: 60 };
    const docSession = { id: "session", deviceId: "phone", ...grant, expiresAt: scope.expiresAt };
    const docCredential = { id: "agent", devices: ["phone"], sessionIds: ["session"], label: "Document agent", ...grant, expiresAt: scope.expiresAt };
    const docTask = { id: "task", deviceId: "phone", sessionId: "session", resourceScope, status: "active", expiresAt: scope.expiresAt, maxActions: 2, actionsUsed: 0, outcome: "unverified" };
    const forwarded: Record<string, unknown>[] = [];
    const fetchMock = mockBroker((url, init) => {
      if (init.body) forwarded.push(JSON.parse(String(init.body)));
      if (url.endsWith("/sessions")) return { session: docSession };
      if (url.endsWith("/credentials")) return { credential: { ...docCredential, token: agentToken } };
      if (url.endsWith("/tasks")) return { task: docTask };
      return url.endsWith("/audit") ? { events: [] } : { devices: [phone], sessions: [docSession], credentials: [docCredential], tasks: [docTask] };
    });
    const sessionResponse = await app.inject({ method: "POST", url: "/api/phone-control/sessions", headers, payload: { deviceId: "phone", ...grant } });
    expect(sessionResponse.statusCode).toBe(200); expect(sessionResponse.json().session.resourceScope).toEqual(resourceScope);
    const issued = await app.inject({ method: "POST", url: "/api/phone-control/credentials", headers, payload: { devices: ["phone"], sessionIds: ["session"], label: "Document agent", ...grant } });
    expect(issued.statusCode).toBe(200); expect(issued.json().credential.resourceScope).toEqual(resourceScope);
    const acquired = await app.inject({ method: "POST", url: "/api/phone-control/tasks", headers, payload: { deviceId: "phone", sessionId: "session", ttlSeconds: 60, maxActions: 2, resourceScope } });
    expect(acquired.statusCode).toBe(200); expect(acquired.json().task.resourceScope).toEqual(resourceScope);
    expect(forwarded).toHaveLength(3); expect(forwarded.every((body) => JSON.stringify(body.resourceScope) === JSON.stringify(resourceScope))).toBe(true);
    expect((await app.inject({ url: "/api/phone-control/state", headers })).json()).toMatchObject({ sessions: [{ resourceScope }], credentials: [{ resourceScope }], tasks: [{ resourceScope }] });
    fetchMock.mockClear();
    for (const invalid of [
      { ...grant, apps: ["org.example.notes"] }, { ...grant, disclosure: { screenshots: true } }, { ...grant, operations: ["observe"] },
      { ...grant, resourceScope: { ...resourceScope, adapter: "account.label.v1" } }, { ...grant, resourceScope: { ...resourceScope, account: "personal" } },
      { ...grant, resourceScope: { ...resourceScope, effects: ["document.replace"] } }, { ...grant, resourceScope: { ...resourceScope, resourceIds: ["same", "same"] } },
      { apps: [], operations: ["observe"], ttlSeconds: 60 }, { apps: ["org.example.notes"], operations: ["document.read"], ttlSeconds: 60 },
    ]) expect((await app.inject({ method: "POST", url: "/api/phone-control/sessions", headers, payload: { deviceId: "phone", ...invalid } })).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("projects only bounded document text for the requested handle and refuses malformed signed results", async () => {
    const { app, headers } = await fixture();
    const input = { ...call, method: "document.read", taskId: "task", params: { resourceId: "document-one" } };
    const text = "Untrusted document <script>content</script>\n😀";
    const result = { resourceId: "document-one", text, revision: digest(text) };
    const fetchMock = mockBroker(() => ({ id: call.id, status: "observed", result }));
    const read = await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: input });
    expect(read.json()).toEqual({ id: call.id, status: "observed", result }); expect(read.headers["cache-control"]).toBe("no-store"); expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const malformed of [
      { ...result, resourceId: "other" }, { ...result, revision: "0".repeat(64) }, { ...result, revision: result.revision.toUpperCase() },
      { ...result, text: "x".repeat(2001), revision: digest("x".repeat(2001)) }, { ...result, privateUri: "content://provider/private" },
      { ...result, text: "\u0000", revision: digest("\u0000") }, { ...result, text: "\ud800", revision: digest("\ud800") },
    ]) {
      const mock = mockBroker(() => ({ id: call.id, status: "observed", result: malformed }));
      const response = (await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: input })).json();
      expect(response.status).toBe("unknown"); expect(response.result).toBeUndefined(); expect(mock).toHaveBeenCalledTimes(1);
    }
  });

  it("requires document task binding and exact replacement revisions without retrying ambiguous writes", async () => {
    const { app, headers } = await fixture();
    const input = { ...call, method: "document.replace", taskId: "task", params: { resourceId: "document-one", expectedRevision: digest("original"), text: "" } };
    let fetchMock = mockBroker(() => ({ id: call.id, status: "completed", result: { status: "completed" } }));
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: input })).json().status).toBe("completed");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).toEqual(input);
    fetchMock.mockClear();
    for (const invalid of [
      { ...input, taskId: undefined }, { ...input, method: "document.read", taskId: undefined, params: { resourceId: "document-one" } },
      { ...input, params: { ...input.params, expectedRevision: "current" } }, { ...input, params: { ...input.params, text: "x".repeat(2001) } },
      { ...input, params: { ...input.params, text: "\u0000" } }, { ...input, params: { ...input.params, account: "personal" } },
    ]) expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: invalid })).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    for (const result of [{ status: "dispatched" }, { status: "completed", revision: digest("private") }]) {
      fetchMock = mockBroker(() => ({ id: call.id, status: "completed", result }));
      const response = (await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: input })).json();
      expect(response.status).toBe("unknown"); expect(response.result).toBeUndefined(); expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("preserves strict capture recovery on signed observations and terminal guard errors", async () => {
    const { app, headers } = await fixture();
    const observe = () => app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, method: "observe", params: { includeScreenshot: false } } });
    for (const totalElapsedMs of [6000, 9001, 60000]) {
      const captureRecovery = { ...recovery, totalElapsedMs };
      const fetchMock = mockBroker(() => ({ id: call.id, status: "observed", result: { ...screen, captureRecovery, privateMetadata: "discard" } }));
      const result = (await observe()).json();
      expect(result).toMatchObject({ status: "observed", result: { captureRecovery } });
      expect(result.result.screenshot).toBeUndefined(); expect(JSON.stringify(result)).not.toContain("discard"); expect(fetchMock).toHaveBeenCalledTimes(1);
    }
    for (const code of ["screenshot_timeout", "device_locked", "session_expired", "stopped"]) {
      const fetchMock = mockBroker(() => ({ id: call.id, status: "rejected", error: { code, message: "private native message", details: { captureRecovery: recovery, privateMetadata: "discard" } } }));
      const result = (await observe()).json();
      expect(result).toMatchObject({ status: "rejected", error: { code, details: { captureRecovery: recovery } } });
      expect(result.result).toBeUndefined(); expect(JSON.stringify(result)).not.toMatch(/discard|private native message/); expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects malformed recovery metadata in signed successes and failures", async () => {
    const { app, headers } = await fixture();
    const invalid = [null, [], {}, { ...recovery, retryCount: 2 }, { ...recovery, initialError: "screenshot_timeout" }, { ...recovery, initialStage: "encoding" }, { ...recovery, initialElapsedMs: -1 }, { ...recovery, initialElapsedMs: "5000" }, { ...recovery, initialElapsedMs: 60001, totalElapsedMs: 60001 }, { ...recovery, totalElapsedMs: 60001 }, { ...recovery, totalElapsedMs: 4999 }, { ...recovery, totalElapsedMs: 1.5 }, { ...recovery, privateMetadata: "discard" }];
    for (const captureRecovery of invalid) for (const success of [true, false]) {
      const fetchMock = mockBroker(() => success ? { id: call.id, status: "observed", result: { ...screen, captureRecovery } } : { id: call.id, status: "rejected", error: { code: "device_locked", message: "rejected", details: { captureRecovery } } });
      const result = (await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, method: "observe", params: {} } })).json();
      expect(result).toMatchObject({ status: "unknown", error: { code: "BROKER_UNCONFIRMED" } });
      expect(result.result).toBeUndefined(); expect(result.error.details).toBeUndefined(); expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("binds recovery facts to the signed body and never treats them as mutation authority", async () => {
    const { app, headers } = await fixture();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const value = { id: call.id, status: "observed", result: { ...screen, captureRecovery: recovery } };
      const signed = await signedReply(value, url, init);
      return new Response(JSON.stringify({ ...value, result: { ...value.result, captureRecovery: { ...recovery, totalElapsedMs: 6001 } } }), { headers: signed.headers });
    }));
    const result = (await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, method: "observe", params: {} } })).json();
    expect(result).toMatchObject({ status: "unknown", error: { code: "BROKER_UNCONFIRMED" } }); expect(result.result).toBeUndefined();
    mockBroker(() => ({ id: call.id, status: "observed", result: { ...screen, captureRecovery: recovery } }));
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, taskId: "task" } })).json().status).toBe("unknown");
  });

  it("does not let signed contradictory or incomplete mutation receipts clear pending authority", async () => {
    const { app, headers } = await fixture();
    for (const invalid of [
      { id: call.id, status: "completed" },
      { id: call.id, status: "completed", result: { status: "dispatched" }, error: { code: "outcome_unknown", message: "unconfirmed" } },
      { id: call.id, status: "rejected", result: { status: "dispatched" }, error: { code: "scope_forbidden", message: "refused" } },
      { id: call.id, status: "observed", result: screen },
      { id: call.id, status: "unknown", result: { status: "dispatched" } },
    ]) {
      mockBroker(() => invalid);
      expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: call })).json().status).toBe("unknown");
    }
  });

  it("rejects unsigned and tampered receipts and preserves authenticated predispatch refusal", async () => {
    const { app, headers } = await fixture();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: call.id, status: "rejected" })));
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: call })).json().status).toBe("unknown");
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const signed = await signedReply({ id: call.id, status: "unknown" }, url, init);
      return new Response(JSON.stringify({ id: call.id, status: "rejected" }), { headers: signed.headers });
    }));
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: call })).json().status).toBe("unknown");
    mockBroker((_url, init) => Response.json({ error: { code: "scope_forbidden" }, dispatch: { state: "not_dispatched", requestHash: digest(String(init.body)) } }, { status: 403 }));
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: call })).json()).toMatchObject({ status: "rejected", error: { code: "scope_forbidden" } });
  });

  it("rejects authenticated state replays across nonce, route, method, request bytes and response status", async () => {
    const { app, headers } = await fixture();
    for (const variant of ["unsigned", "nonce", "route", "method", "body", "status"]) {
      vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
        const value = url.endsWith("/audit") ? { events: [] } : state;
        if (variant === "unsigned") return Response.json(value);
        const alteredHeaders = new Headers(init.headers);
        if (variant === "nonce") alteredHeaders.set("x-phone-request-nonce", "replayed-nonce-1234567890123456");
        const response = await signedReply(value, variant === "route" ? "http://127.0.0.1:4421/v1/legal" : url, {
          ...init, headers: alteredHeaders, ...(variant === "method" ? { method: "POST" } : {}), ...(variant === "body" ? { body: "{}" } : {}),
        });
        return variant === "status" ? new Response(await response.text(), { status: 403, headers: response.headers }) : response;
      }));
      expect((await app.inject({ url: "/api/phone-control/state", headers })).json().mode).toBe("unavailable");
    }
  });

  it("projects bounded task status without converting a completed reservation into verification", async () => {
    const { app, headers } = await fixture();
    const task = { id: "task", deviceId: "phone", sessionId: "session", actorId: "owner", status: "completed", expiresAt: scope.expiresAt, maxActions: 2, actionsUsed: 1, outcome: "unverified" };
    const fetchMock = mockBroker((url) => url.endsWith("/audit") ? { events: [] } : url.endsWith("/state") ? { ...state, tasks: [task] } : { task });
    const listed = await app.inject({ url: "/api/phone-control/state", headers });
    expect(listed.json().tasks).toEqual([task]);
    const ended = await app.inject({ method: "DELETE", url: "/api/phone-control/tasks/task", headers });
    expect(ended.json().task.outcome).toBe("unverified");
    const invalid = await app.inject({ method: "POST", url: "/api/phone-control/tasks", headers, payload: { deviceId: "phone", sessionId: "session", ttlSeconds: 301, maxActions: 1 } });
    expect(invalid.statusCode).toBe(400); expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("preserves separate disclosure grants and refuses unrecognized permission fields", async () => {
    const { app, headers } = await fixture();
    const payload = { deviceId: "phone", apps: scope.apps, operations: ["observe"], disclosure: { screenshots: false }, ttlSeconds: 60 };
    const fetchMock = mockBroker(() => ({ session: { ...session, disclosure: { screenshots: false } } }));
    const result = await app.inject({ method: "POST", url: "/api/phone-control/sessions", headers, payload });
    expect(result.statusCode).toBe(200); expect(result.json().session.disclosure.screenshots).toBe(false);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body)).disclosure).toEqual({ screenshots: false });
    expect((await app.inject({ method: "POST", url: "/api/phone-control/sessions", headers, payload: { ...payload, disclosure: { screenshots: true, allContent: true } } })).statusCode).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves bounded semantic metadata, rejects unknown directions, and forwards one scroll", async () => {
    const { app, headers } = await fixture();
    const semantic = { resourceId: "org.example.notes:id/document", className: "android.widget.ScrollView", enabled: true, scrollable: true, checkable: true, checkedState: "mixed", selected: false, hintText: "Document", stateDescription: "Draft", actions: ["scrollForward"] };
    const fetchMock = mockBroker((_url, init) => {
      const input = JSON.parse(String(init.body));
      return { id: input.id, status: input.method === "observe" ? "observed" : "completed", result: input.method === "observe" ? { ...screen, nodes: [{ ...screen.nodes[0], ...semantic, arbitraryAuthority: "discard" }] } : { status: "dispatched" } };
    });
    const result = await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, method: "observe", params: {} } });
    expect(result.json().result.nodes[0]).toMatchObject(semantic); expect(result.body).not.toContain("discard");
    const scroll = { ...call, method: "node.scroll", params: { observationId: "screen", nodeId: "node", direction: "forward" } };
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: scroll })).json().status).toBe("completed");
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...scroll, params: { ...scroll.params, direction: "arbitrary-action" } } })).statusCode).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const invalid of [{ resourceId: "x".repeat(257) }, { checkedState: "approved" }, { actions: ["grantPermissions"] }, { actions: ["click", "click"] }, { enabled: "yes" }]) {
      mockBroker(() => ({ id: call.id, status: "observed", result: { ...screen, nodes: [{ ...screen.nodes[0], ...invalid }] } }));
      expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, method: "observe", params: {} } })).json().status).toBe("unknown");
    }
  });

  it("preserves explicit credential session attenuation and rejects empty bindings", async () => {
    const { app, headers } = await fixture();
    const grant = { label: "Bound agent", devices: [phone.id], apps: scope.apps, operations: ["observe"], ttlSeconds: 600, sessionIds: [session.id] };
    const fetchMock = mockBroker(() => ({ credential: { ...grant, id: "agent", expiresAt: scope.expiresAt, token: agentToken } }));
    const result = await app.inject({ method: "POST", url: "/api/phone-control/credentials", headers, payload: grant });
    expect(result.json().credential.sessionIds).toEqual([session.id]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body)).sessionIds).toEqual([session.id]);
    expect((await app.inject({ method: "POST", url: "/api/phone-control/credentials", headers, payload: { ...grant, sessionIds: [] } })).statusCode).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("requires browser authentication, CSRF and permitted origins", async () => {
    const { app, headers, cookie } = await fixture(); const fetchMock = mockBroker();
    expect((await app.inject({ url: "/api/phone-control/state" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers: { cookie }, payload: call })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers: { ...headers, origin: "https://evil.example" }, payload: call })).statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps unconfigured and demo modes disconnected even with an admin token", async () => {
    const disabled = await fixture({ configured: false }); const fetchMock = mockBroker();
    expect((await disabled.app.inject({ url: "/api/phone-control/state", headers: disabled.headers })).json().mode).toBe("disabled");
    expect((await disabled.app.inject({ method: "POST", url: "/api/phone-control/call", headers: disabled.headers, payload: call })).statusCode).toBe(503);
    const demo = await fixture({ demo: true });
    expect((await demo.app.inject({ url: "/api/phone-control/state" })).json()).toMatchObject({ mode: "demo", credentials: [], sessions: [] });
    expect((await demo.app.inject({ method: "POST", url: "/api/phone-control/call", payload: call })).statusCode).toBe(409);
    expect((await demo.app.inject({ method: "POST", url: "/api/phone-control/devices/phone/stop", payload: {} })).statusCode).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a fixed origin and projects state without private keys or transport details", async () => {
    const { app, headers } = await fixture();
    const fetchMock = mockBroker((url) => url.endsWith("/audit") ? { events: [] } : { ...state, devices: [{ ...phone, token: "native-secret", origin: "http://private.invalid" }], credentials: [{ id: "agent", label: "Agent", devices: ["phone"], ...scope, token: "should-never-be-listed", tokenHash: "private-hash" }] });
    const result = await app.inject({ url: "/api/phone-control/state", headers: { ...headers, origin: "http://127.0.0.1:4400" } });
    expect(result.json().mode).toBe("connected");
    expect(result.headers["cache-control"]).toBe("no-store");
    for (const value of [adminToken, "native-secret", "private.invalid", "should-never-be-listed", "private-hash"]) expect(result.body).not.toContain(value);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(new URL(url).origin).toBe("http://127.0.0.1:4421");
      expect(init.headers).toEqual({ authorization: `Bearer ${adminToken}`, "x-phone-request-nonce": expect.stringMatching(/^[A-Za-z0-9_-]{16,96}$/) });
      expect(init.redirect).toBe("error"); expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("fails closed on unavailable, malformed, oversized, or secret-reflecting broker responses", async () => {
    const { app, headers } = await fixture();
    for (const invalid of [new Error(`connect failed ${adminToken}`), Response.json({ message: adminToken }, { status: 401 }), Response.json({ ...state, secret: adminToken }), Response.json({ ...state, devices: "invalid" }), new Response("x".repeat(8 * 1024 * 1024 + 1))]) {
      mockBroker(() => invalid);
      const result = await app.inject({ url: "/api/phone-control/state", headers });
      expect(result.json()).toEqual({ mode: "unavailable", devices: [], sessions: [], credentials: [], events: [] });
      expect(result.body).not.toContain(adminToken);
    }
  });

  it("rejects raw shell, target overrides, path injection, malformed gestures and oversized bodies before dispatch", async () => {
    const { app, headers } = await fixture(); const fetchMock = mockBroker();
    for (const payload of [
      { ...call, method: "shell" }, { ...call, url: "http://evil.example" }, { ...call, deviceId: "../other" }, { ...call, deviceId: "a".repeat(97) },
      { ...call, params: { ...call.params, command: "whoami" } }, { ...call, params: { ...call.params, x: -1 } }, { ...call, params: { ...call.params, x: 16384 } },
      { ...call, method: "key", params: { observationId: "screen", key: "power" } }, { ...call, method: "type", params: { observationId: "screen", nodeId: "node", text: "bad\u0000text" } },
      { ...call, method: "swipe", params: { observationId: "screen", points: [{ x: 1, y: 2 }], durationMs: 500 } },
      { ...call, method: "swipe", params: { observationId: "screen", points: Array.from({ length: 21 }, () => ({ x: 1, y: 2 })), durationMs: 500 } },
      { ...call, method: "pinch", params: { observationId: "screen", centerX: 1, centerY: 2, scale: 1, durationMs: 500 } },
      { ...call, method: "type", params: { observationId: "screen", nodeId: "n_0_0", text: "x".repeat(2001) } },
      { ...call, method: "observe", params: { includeScreenshot: "yes" } },
    ]) expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, padding: "x".repeat(40000) } })).statusCode).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves native receipt semantics, removes arbitrary results and never retries ambiguous actions", async () => {
    const { app, headers } = await fixture();
    const fetchMock = mockBroker(() => ({ id: "request", status: "completed", result: { status: "dispatched", secret: "private-native-data", verified: true } }));
    const completed = await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: call });
    expect(completed.json()).toEqual({ id: "request", status: "completed" }); expect(completed.body).not.toContain("verified");
    fetchMock.mockImplementationOnce(async () => { throw new Error(`timeout ${adminToken}`); });
    const unknown = await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, id: "second" } });
    expect(unknown.json()).toMatchObject({ id: "second", status: "unknown", error: { code: "BROKER_UNCONFIRMED" } });
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(unknown.body).not.toContain(adminToken);
    fetchMock.mockImplementationOnce(async () => Response.json({ id: "wrong", status: "completed" }));
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: call })).json().status).toBe("unknown");
    const audit = (await app.inject({ url: "/api/audit", headers })).body;
    expect(audit).toContain("phone.call"); expect(audit).not.toContain("observationId"); expect(audit).not.toContain(adminToken);
  });

  it("requires explicit screenshot opt-in and sanitizes observed data and capability output", async () => {
    const { app, headers } = await fixture();
    const fetchMock = mockBroker(() => ({ id: "request", status: "observed", result: { ...screen, secret: "discard", nodes: screen.nodes.map((node) => ({ ...node, password: "discard" })) } }));
    const observe = (includeScreenshot: boolean) => app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, method: "observe", params: { includeScreenshot } } });
    const tree = (await observe(false)).json(); expect(tree.result.screenshot).toBeUndefined(); expect(JSON.stringify(tree)).not.toContain("discard");
    expect(tree.result.nodes[0].text).toBe(screen.nodes[0]!.text);
    expect((await observe(true)).json().result.screenshot).toEqual(screen.screenshot);
    fetchMock.mockImplementationOnce(async (url, init) => signedReply({ id: "request", status: "observed", result: { protocolVersion: 1, platform: "android", methods: ["describe", "observe"], session: {}, capabilities: { screenshots: true, gestures: false, biometricConsent: false }, secret: "discard" } }, url, init));
    const described = await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, method: "describe", params: {} } });
    expect(described.json().result.capabilities.biometricConsent).toBe(false); expect(described.body).not.toContain("discard");
  });

  it("accepts actual broker projections of native-shaped descriptions, trees, screenshots and node clicks", async () => {
    const { app, headers } = await fixture();
    // Exercise the independently shipped broker code, not a second handwritten projection.
    const modulePath = new URL("../../../components/phone-control/src/broker.mjs", import.meta.url).href;
    const { Broker } = await import(/* @vite-ignore */ modulePath);
    const nativeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const input = JSON.parse(String(init.body));
      const result = input.method === "describe" ? { protocolVersion: 1, platform: "android", appVersion: "0.1.0-alpha.1", methods: ["describe", "observe", "node.click"], session: { expiresAt: Date.now() + 600000 }, capabilities: { windowScreenshot: true, tree: true, perActionConsent: "strong_biometric", strongBiometricAvailable: true, fixtureAutomation: false }, limits: { sessionMs: 600000, observationMs: 60000, maxNodes: 300 }, transport: "adb-loopback", nativeSecret: "not-for-browser" }
        : input.method === "observe" ? { ...screen, capturedAt: Date.now(), touchBounds: { left: 24, top: 20, right: 376, bottom: 760 }, nodes: [{ ...screen.nodes[0], id: "n_0_0" }] } : { status: "dispatched" };
      return Response.json({ id: input.id, result });
    });
    const broker = new Broker({ config: { devices: [{ ...phone, origin: "http://127.0.0.1:8837", token: "synthetic_native_token_1234567890" }] }, state: { credentials: [], sessions: [], receipts: [], audit: [] }, save: () => {}, fetchImpl: nativeFetch });
    broker.data.sessions.push({ ...session, disclosure: { screenshots: true }, operations: ["describe", "observe", "node.click"] });
    const reservation = broker.createTask({ id: "owner", admin: true }, { deviceId: phone.id, sessionId: session.id, ttlSeconds: 60, maxActions: 2 }).task;
    mockBroker(async (_url, init) => broker.call({ id: "owner", admin: true }, JSON.parse(String(init.body))));
    const invoke = (id: string, method: string, params: Record<string, unknown>) => app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, taskId: reservation.id, id, method, params } });
    const description = await invoke("describe", "describe", {});
    expect(description.json()).toMatchObject({ status: "observed", result: { capabilities: { screenshots: true, gestures: false, biometricConsent: true } } });
    expect(description.body).not.toContain("not-for-browser");
    const observed = await invoke("observe", "observe", { includeScreenshot: true });
    expect(observed.json()).toMatchObject({ status: "observed", result: { screenshot: screen.screenshot, touchBounds: { left: 24, top: 20, right: 376, bottom: 760 }, nodes: [{ id: "n_0_0" }] } });
    expect(typeof observed.json().result.capturedAt).toBe("string");
    const clicked = await invoke("click", "node.click", { observationId: "screen", nodeId: "n_0_0" });
    expect(clicked.json()).toEqual({ id: "click", status: "completed" });
    expect(nativeFetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(nativeFetch.mock.calls[2]![1].body)).params).toMatchObject({ expectedPackage: "org.example.notes", nodeId: "n_0_0" });
  });

  it("preserves optional safe touch rectangles and refuses malformed or out-of-image bounds", async () => {
    const { app, headers } = await fixture();
    let touchBounds: unknown;
    mockBroker(() => ({ id: "request", status: "observed", result: { ...screen, ...(touchBounds === undefined ? {} : { touchBounds }) } }));
    const observe = () => app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { ...call, method: "observe", params: {} } });
    for (const bounds of [undefined, { left: 24, top: 20, right: 376, bottom: 760 }, { left: 0, top: 0, right: 0, bottom: 0 }]) {
      touchBounds = bounds;
      const receipt = (await observe()).json();
      expect(receipt.status).toBe("observed"); expect(receipt.result.touchBounds).toEqual(bounds);
    }
    for (const bounds of [
      { left: -1, top: 0, right: 400, bottom: 800 }, { left: 0.5, top: 0, right: 400, bottom: 800 },
      { left: 0, top: 0, right: 401, bottom: 800 }, { left: 0, top: 0, right: 400, bottom: 801 },
      { left: 20, top: 0, right: 20, bottom: 800 }, { left: 20, top: 10, right: 10, bottom: 800 },
      { left: 0, top: 0, right: 400 }, null,
    ]) {
      touchBounds = bounds;
      const receipt = (await observe()).json(); expect(receipt.status).toBe("unknown"); expect(receipt.result).toBeUndefined();
    }
  });

  it("integrates selected-document reads and replacements through the real broker without storing document contents", async () => {
    const { app, headers } = await fixture();
    const modulePath = new URL("../../../components/phone-control/src/broker.mjs", import.meta.url).href;
    const { Broker } = await import(/* @vite-ignore */ modulePath);
    let text = "Private original document";
    const resourceId = "selected-document";
    const nativeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const input = JSON.parse(String(init.body));
      expect(input.params.resourceId).toBe(resourceId);
      if (input.method === "document.replace") { expect(input.params.expectedRevision).toBe(digest(text)); text = input.params.text; }
      return Response.json({ id: input.id, result: input.method === "document.read" ? { resourceId, revision: digest(text), text } : { status: "completed" } });
    });
    const broker = new Broker({ config: { devices: [{ ...phone, origin: "http://127.0.0.1:8837", token: "synthetic_native_token_1234567890" }] }, state: { credentials: [], sessions: [], receipts: [], audit: [] }, save: () => {}, fetchImpl: nativeFetch });
    const owner = { id: "owner", admin: true };
    const resourceScope = { adapter: "android.document.v1", resourceIds: [resourceId], effects: ["document.read", "document.replace"] };
    const docSession = broker.createSession(owner, { deviceId: phone.id, apps: [], operations: ["document.read", "document.replace", "stop"], resourceScope, ttlSeconds: 60 }).session;
    const reservation = broker.createTask(owner, { deviceId: phone.id, sessionId: docSession.id, resourceScope, ttlSeconds: 60, maxActions: 2 }).task;
    mockBroker(async (_url, init) => broker.call(owner, JSON.parse(String(init.body))));
    const invoke = (id: string, method: string, params: Record<string, unknown>) => app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { id, deviceId: phone.id, sessionId: docSession.id, taskId: reservation.id, method, params } });
    const read = await invoke("read-document", "document.read", { resourceId });
    expect(read.json()).toMatchObject({ status: "observed", result: { resourceId, text, revision: digest(text) } });
    const replaced = await invoke("replace-document", "document.replace", { resourceId, expectedRevision: read.json().result.revision, text: "Private replacement text" });
    expect(replaced.json()).toEqual({ id: "replace-document", status: "completed" });
    expect(nativeFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(nativeFetch.mock.calls[1]![1].body)).params.deadlineAt).toBeLessThanOrEqual(Date.parse(reservation.expiresAt));
    const persisted = JSON.stringify(broker.data);
    const audit = (await app.inject({ url: "/api/audit", headers })).body;
    for (const secret of ["Private original document", "Private replacement text"]) { expect(persisted).not.toContain(secret); expect(audit).not.toContain(secret); }
  });

  it("creates narrow scopes, shows a new agent token only on issuance and can revoke access", async () => {
    const { app, headers, cookie } = await fixture();
    const newCredential = { id: "agent", label: "Agent", devices: ["phone"], ...scope };
    const fetchMock = mockBroker((url, init) => url.endsWith("/credentials") && init.method === "POST" ? { credential: { ...newCredential, token: agentToken, tokenHash: "discard" } } : init.method === "DELETE" ? { revoked: true } : { session });
    const grant = { label: "Agent", devices: ["phone"], apps: ["org.example.notes"], operations: ["observe"], ttlSeconds: 600 };
    expect((await app.inject({ method: "POST", url: "/api/phone-control/credentials", headers: { cookie }, payload: grant })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/phone-control/credentials", headers, payload: { ...grant, apps: ["*"] } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/phone-control/credentials", headers, payload: { ...grant, ttlSeconds: 86401 } })).statusCode).toBe(400);
    const created = await app.inject({ method: "POST", url: "/api/phone-control/credentials", headers, payload: grant });
    expect(created.json().credential.token).toBe(agentToken); expect(created.headers["cache-control"]).toBe("no-store"); expect(created.body).not.toContain("tokenHash");
    expect((await app.inject({ method: "POST", url: "/api/phone-control/sessions", headers, payload: { deviceId: "phone", apps: grant.apps, operations: ["describe"], ttlSeconds: 600 } })).json().session.id).toBe("session");
    expect((await app.inject({ method: "DELETE", url: "/api/phone-control/credentials/agent", headers })).json().revoked).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const audit = (await app.inject({ url: "/api/audit", headers })).body; expect(audit).not.toContain(agentToken); expect(audit).not.toContain(adminToken);
  });

  it("reserves stop access when the ordinary phone request rate limit is exhausted", async () => {
    const { app, headers } = await fixture();
    const fetchMock = mockBroker((url) => url.endsWith("/stop") ? { revoked: true, stopStatus: "unknown" } : { id: "request", status: "rejected", error: { code: "consent_denied", message: "rejected" } });
    let last = 0;
    for (let index = 0; index < 61; index++) last = (await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: call })).statusCode;
    expect(last).toBe(429);
    const stop = await app.inject({ method: "POST", url: "/api/phone-control/devices/phone/stop", headers, payload: {} });
    expect(stop.statusCode).toBe(200); expect(stop.json()).toEqual({ revoked: true, stopStatus: "unknown" }); expect(fetchMock).toHaveBeenCalledTimes(61);
  });
  it("enforces folder draft schemas and accepts only verified safe creation receipts", async () => {
    const { app, headers } = await fixture();
    const resourceId = "8c82feef-05f7-43a5-a337-c77b682ab7cd";
    const resourceScope = { adapter: "android.folder-drafts.v1", resourceIds: [resourceId], effects: ["draft.create"] };
    let result: unknown = { status: "completed" };
    const upstream = mockBroker((url, init) => url.endsWith("/sessions") ? { session: { ...session, apps: [], operations: ["draft.create", "stop"], resourceScope } } : { id: "request", status: "completed", result });
    const grant = { deviceId: "phone", apps: [], operations: ["draft.create", "stop"], resourceScope, ttlSeconds: 600 };
    expect((await app.inject({ method: "POST", url: "/api/phone-control/sessions", headers, payload: grant })).statusCode).toBe(200);
    for (const payload of [
      { ...grant, apps: ["org.example.notes"] }, { ...grant, operations: ["draft.create", "document.read"] },
      { ...grant, disclosure: { screenshots: true } }, { ...grant, resourceScope: { ...resourceScope, effects: ["draft.create", "document.replace"] } },
      { ...grant, resourceScope: { ...resourceScope, resourceIds: ["content://private/tree"] } },
      { ...grant, resourceScope: { ...resourceScope, resourceIds: [resourceId, resourceId] } },
      { ...grant, resourceScope: undefined, apps: ["org.example.notes"] },
    ]) expect((await app.inject({ method: "POST", url: "/api/phone-control/sessions", headers, payload })).statusCode).toBe(400);
    const draft = { ...call, taskId: "task", method: "draft.create", params: { resourceId, text: "Private draft text" } };
    for (const payload of [
      { ...draft, taskId: undefined }, { ...draft, params: { ...draft.params, filename: "existing.txt" } },
      { ...draft, params: { ...draft.params, uri: "content://private" } },
      { ...draft, params: { ...draft.params, overwrite: true } },
      ...["bad\u0000text", "\ud800", "x".repeat(2001)].map((text) => ({ ...draft, params: { resourceId, text } })),
    ]) expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload })).statusCode).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect((await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: draft })).json()).toEqual({ id: "request", status: "completed" });
    for (const unsafe of [{ status: "dispatched" }, { status: "completed", text: "Private draft text" }, { status: "completed", uri: "content://private" }]) {
      result = unsafe;
      const receipt = (await app.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: draft })).json();
      expect(receipt.status).toBe("unknown"); expect(receipt.result).toBeUndefined();
    }
    expect((await app.inject({ url: "/api/audit", headers })).body).not.toContain("Private draft text");
  });

});
