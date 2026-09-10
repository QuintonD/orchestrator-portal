import { describe, expect, it } from "vitest";
import { assistantTemplates, connectorKindSchema, modelEvidence, resolveAssistantTemplate } from "./index.js";

describe("portable role execution", () => {
  it.each(connectorKindSchema.options)("offers the common library on %s without inventing execution", (kind) => {
    const roles = assistantTemplates.filter((t) => t.portable);
    expect(roles).toHaveLength(15);
    for (const role of roles) {
      expect(resolveAssistantTemplate(role, kind, [])?.mode).toBe("handoff");
      const direct = ["demo", "openclaw-cli", "hermes-api", "generic-webhook", "openai-compatible"].includes(kind);
      expect(resolveAssistantTemplate(role, kind, ["message.send"])?.mode).toBe(direct ? "runtime" : "handoff");
    }
  });
  it("keeps local guides inference-free and retires the duplicated context guide", () => {
    const retired = assistantTemplates.find((t) => t.id === "context-guide")!;
    expect(resolveAssistantTemplate(retired, "notion", [])).toBeUndefined();
    expect(retired.replacementId).toBe("librarian");
    for (const role of assistantTemplates.filter((t) => t.modelClass === "local" && !t.retired)) {
      expect(["index", "workspace"]).toContain(role.mode);
      expect(role.portable).toBe(false);
    }
    expect(resolveAssistantTemplate(assistantTemplates.find((t) => t.id === "librarian")!, "openai-compatible", ["message.send"])).toBeUndefined();
  });
  it("keeps benchmark effort, method version and estimates distinct from task recommendations", () => {
    expect(modelEvidence.index).toContain("v4.3");
    expect(modelEvidence.models.find((m) => m.model.endsWith("Luna") && m.effort === "medium")?.estimated).toBe(true);
    expect(new Set(assistantTemplates.map((t) => t.id)).size).toBe(assistantTemplates.length);
    expect(new Set(assistantTemplates.filter((t) => !t.retired).map((t) => t.criteria)).size).toBe(22);
  });
});
