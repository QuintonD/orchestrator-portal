import { describe, expect, it } from "vitest";
import { ftsQuery } from "./knowledge.js";

describe("knowledge search", () => {
  it("turns user text into a bounded literal prefix query", () => {
    expect(ftsQuery('portal "strategy" launch')).toBe('"portal"* AND "strategy"* AND "launch"*');
  });

  it("ignores tiny and empty terms", () => {
    expect(ftsQuery(" a   an useful ")).toBe('"an"* AND "useful"*');
  });
});
