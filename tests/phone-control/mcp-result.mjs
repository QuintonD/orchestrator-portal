import assert from "node:assert/strict";

// A transport failure is not evidence that authorization was enforced.
export function assertMcpDenial(message, expectedCode) {
  assert.ok(["scope_forbidden", "unauthorized"].includes(expectedCode));
  assert.equal(message?.result?.isError, true);
  let value = message.result.structuredContent;
  if (value === undefined) {
    const content = message.result.content;
    assert.ok(Array.isArray(content) && content.length === 1 && content[0].type === "text");
    try { value = JSON.parse(content[0].text); }
    catch { throw new Error("MCP denial must contain a structured error"); }
  }
  // Do not place arbitrary received content in an assertion's actual value.
  assert.ok(value?.error?.code === expectedCode, "MCP must return the expected authorization denial");
}
