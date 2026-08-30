import { describe, expect, it } from "vitest";
import { compactNumber, cx, money } from "./lib.js";

describe("interface formatting", () => {
  it("combines only meaningful class names", () => {
    expect(cx("card", false, undefined, "span-2")).toBe("card span-2");
  });

  it("keeps dense dashboard values readable", () => {
    expect(compactNumber(1_250_000)).toMatch(/1\.3M|1\.25M/);
    expect(money(4.2)).toContain("4.20");
  });
});
