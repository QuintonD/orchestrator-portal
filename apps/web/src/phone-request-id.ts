// getRandomValues also works in contexts where randomUUID is unavailable.
// Keep request IDs cryptographic without depending on secure-context APIs.
export function phoneRequestId(): string {
  const bytes = new Uint8Array(16);
  try { globalThis.crypto.getRandomValues(bytes); }
  catch { throw new Error("Secure randomness is unavailable. No phone request was sent. Stop phone access remains available."); }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
