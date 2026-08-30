import { describe, expect, it } from "vitest";
import { portalEventSchema, sendMessageSchema } from "./index.js";

describe("public contracts", () => {
  it("rejects empty messages", () => {
    expect(sendMessageSchema.safeParse({ connectorId: "demo", body: " " }).success).toBe(false);
  });

  it("applies event defaults", () => {
    const event = portalEventSchema.parse({ source: "test", kind: "work", title: "Finished" });
    expect(event.status).toBe("observed");
    expect(event.metadata).toEqual({});
  });
});
