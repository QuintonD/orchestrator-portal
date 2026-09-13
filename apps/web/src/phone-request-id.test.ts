import { afterEach, describe, expect, it, vi } from "vitest";
import { phoneRequestId } from "./phone-request-id.js";

afterEach(() => vi.unstubAllGlobals());

describe("phone request IDs", () => {
  it("preserves the random bytes except for UUID version and variant bits", () => {
    const entropy = vi.fn((bytes: Uint8Array) => {
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes).toHaveLength(16);
      bytes.set([0, 1, 2, 3, 4, 5, 0xa6, 7, 0xd8, 9, 10, 11, 12, 13, 14, 255]);
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues: entropy });
    expect(phoneRequestId()).toBe("00010203-0405-4607-9809-0a0b0c0d0eff");
    expect(entropy).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, {}, { getRandomValues: () => { throw new Error("Entropy provider failed"); } }])("fails closed when entropy is unavailable: %j", (crypto) => {
    vi.stubGlobal("crypto", crypto);
    expect(() => phoneRequestId()).toThrow("Secure randomness is unavailable. No phone request was sent. Stop phone access remains available.");
  });
});
