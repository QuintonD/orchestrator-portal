import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const roots = ["components/phone-control", "apps/phone-android"];
const canonical = read(`${roots[0]}/LICENSE`);
assert.match(canonical, /GNU AFFERO GENERAL PUBLIC LICENSE/);
assert.match(canonical, /13\. Remote Network Interaction/);
for (const root of roots) {
  assert.equal(read(`${root}/LICENSE`), canonical, "Keep both canonical licence texts unchanged and identical");
  assert.match(read(`${root}/NOTICE`), /Copyright 2026 Orchestrator contributors/);
  assert.match(read(`${root}/NOTICE`), /https:\/\/github\.com\/QuintonD\/orchestrator-portal/);
  assert.match(read(`${root}/ATTRIBUTION.md`), /section 7\(b\)/);
}
assert.equal(JSON.parse(read("components/phone-control/package.json")).license, "AGPL-3.0-only");
assert.equal(JSON.parse(read("package.json")).license, "Apache-2.0");
assert.match(read("LICENSE"), /Apache License/);
assert.match(read("CONTRIBUTING.md"), /AGPL-3.0-only/);
console.log("PASS Phone Control licence boundaries and required notices; binary packaging is checked separately");
