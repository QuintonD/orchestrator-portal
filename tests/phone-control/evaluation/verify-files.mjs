import { createHash, timingSafeEqual } from "node:crypto";
import { EvaluationInputError, MAX_INPUT_BYTES } from "./evaluate.mjs";

const opaqueId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
function input(condition) { if (!condition) throw new EvaluationInputError("invalid_file_records"); }
function records(value) {
  input(value !== null && typeof value === "object" && !Array.isArray(value));
  const entries = Object.entries(value); input(entries.length > 0 && entries.length <= 128);
  let size = 0;
  for (const [key, bytes] of entries) {
    input(opaqueId.test(key) && bytes instanceof Uint8Array);
    size += bytes.byteLength; input(size <= MAX_INPUT_BYTES);
  }
  return entries;
}
function equal(left, right) {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

// The owner harness supplies bytes from a complete, preregistered synthetic corpus.
// No agent-provided path is interpreted, opened, or printed by this module.
export function verifyDocumentState({ targetId, expectedBytes, before, after }) {
  input(typeof targetId === "string" && opaqueId.test(targetId));
  input(expectedBytes instanceof Uint8Array && expectedBytes.byteLength <= MAX_INPUT_BYTES);
  const previous = records(before); const current = records(after);
  input(Object.hasOwn(before, targetId));
  const sameInventory = previous.length === current.length && previous.every(([key]) => Object.hasOwn(after, key));
  const exactTarget = Object.hasOwn(after, targetId) && equal(after[targetId], expectedBytes);
  const unrelatedUnchanged = previous.every(([key, bytes]) => key === targetId || (Object.hasOwn(after, key) && equal(bytes, after[key])));
  return {
    verification: { verifierId: "document-state-v1", source: "independent", outcome: sameInventory && exactTarget && unrelatedUnchanged ? "success" : "failure" },
    checks: { exactTarget, sameInventory, unrelatedUnchanged, protectedFiles: previous.length - 1 },
  };
}

// Hash only non-sensitive synthetic inputs; never use content hashes as redaction
// for short secrets. The digest freezes test parameters without retaining text.
export function syntheticDocumentVariant(seed) {
  input([17, 29, 43].includes(seed));
  const encoder = new TextEncoder();
  const text = {
    17: "# Emulator notes\n\nKeep the grocery list.\n",
    29: "# Emulator notes\n\nKeep café and 日本語 exactly.\n",
    43: "# Emulator notes\r\n\r\nKeep the last line without a newline",
  }[seed];
  const append = `\n\nChecked item ${seed}: local emulator task completed.\n`;
  const before = { target: encoder.encode(text), unrelated: encoder.encode(`Unrelated record ${seed}; preserve byte for byte.\n`) };
  const expectedBytes = encoder.encode(text + append);
  const parameterSha256 = createHash("sha256").update(before.target).update(before.unrelated).update(expectedBytes).digest("hex");
  return { targetId: "target", expectedBytes, before, parameterSha256 };
}
