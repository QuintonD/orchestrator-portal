import test from "node:test";
import assert from "node:assert/strict";
import { assertMcpDenial } from "./mcp-result.mjs";

test("scope and revocation proofs require the specific error in either MCP representation", () => {
  assertMcpDenial({ result: { isError: true, structuredContent: { error: { code: "scope_forbidden" } } } }, "scope_forbidden");
  assertMcpDenial({ result: { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code: "unauthorized" } }) }] } }, "unauthorized");
});

test("transport, validation and malformed MCP errors cannot pass authorization acceptance", () => {
  for (const code of ["native_unavailable", "invalid_request", "unauthorized", "private-secret-canary"]) {
    assert.throws(() => assertMcpDenial({ result: { isError: true, structuredContent: { error: { code } } } }, "scope_forbidden"), (error) => !String(error).includes("private-secret-canary"));
  }
  assert.throws(() => assertMcpDenial({ result: { isError: true, content: [{ type: "text", text: "private-secret-canary" }] } }, "unauthorized"), (error) => !String(error).includes("private-secret-canary"));
  assert.throws(() => assertMcpDenial({ result: { isError: false, structuredContent: { error: { code: "scope_forbidden" } } } }, "scope_forbidden"));
});
