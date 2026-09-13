import test from "node:test";
import assert from "node:assert/strict";
import { verifyDocumentState, syntheticDocumentVariant } from "./verify-files.mjs";

test("all fixed variants verify exact target bytes and preserve unrelated data", () => {
  for (const seed of [17, 29, 43]) {
    const variant = syntheticDocumentVariant(seed);
    const after = { ...variant.before, target: variant.expectedBytes };
    const result = verifyDocumentState({ ...variant, after });
    assert.equal(result.verification.outcome, "success"); assert.equal(result.checks.protectedFiles, 1);
    assert.equal(variant.parameterSha256, syntheticDocumentVariant(seed).parameterSha256);
    assert.ok(!JSON.stringify(result).includes("Emulator notes"));
  }
});

test("visible claim without file update, normalized newlines, truncation and unrelated edits fail", () => {
  const variant = syntheticDocumentVariant(43);
  for (const after of [
    variant.before,
    { ...variant.before, target: variant.expectedBytes.subarray(0, -1) },
    { ...variant.before, target: new TextEncoder().encode(new TextDecoder().decode(variant.expectedBytes).replaceAll("\r\n", "\n")) },
    { target: variant.expectedBytes, unrelated: new Uint8Array([0]) },
    { target: variant.expectedBytes },
    { ...variant.before, target: variant.expectedBytes, added: new Uint8Array([1]) },
  ]) assert.equal(verifyDocumentState({ ...variant, after }).verification.outcome, "failure");
});

test("file verifier accepts byte records only and never interprets arbitrary paths", () => {
  const variant = syntheticDocumentVariant(17);
  assert.throws(() => verifyDocumentState({ ...variant, before: { "C:\\SECRET_CANARY": new Uint8Array() }, after: {} }), (e) => !String(e).includes("SECRET_CANARY"));
  assert.throws(() => verifyDocumentState({ ...variant, after: { target: "forged file" } }));
  assert.throws(() => syntheticDocumentVariant(99));
});
