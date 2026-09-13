import assert from "node:assert/strict";
import test from "node:test";
import { nativeControls } from "./native.mjs";

const selector = { clazz: "android.widget.EditText" };
const password = "synthetic-password-only";

function fixture({ isPassword = true, passwordState, displayed = value => "\u2022".repeat(value.length), inputFailure = false } = {}) {
  let text = "", writes = 0, taps = 0, selections = 0;
  const device = { async shell(command) {
    if (command === "uiautomator dump /sdcard/orchestrator-qa.xml") return "UI hierarchy dumped to: /sdcard/orchestrator-qa.xml";
    if (command === "cat /sdcard/orchestrator-qa.xml") return `<hierarchy><node class="android.widget.EditText" text="${text}" password="${passwordState ? passwordState({ taps, writes }) : isPassword}" enabled="true" bounds="[10,20][210,80]" /></hierarchy>`;
    if (command === "dumpsys input_method") return "mInputShown=true";
    if (command === "input tap 110 50") { taps++; return ""; }
    if (command === "input keycombination 113 29") { selections++; return ""; }
    if (command.startsWith("input text ")) {
      writes++;
      const value = command.slice("input text ".length).replaceAll("%s", " ");
      if (inputFailure) throw new Error(`Shell rejected ${value}`);
      text = displayed(value, writes);
      return "";
    }
    throw new Error("Unexpected fake device command");
  } };
  return { ui: nativeControls(() => device), counts: () => ({ writes, taps, selections }) };
}

test("password fill accepts the complete native mask without disclosing text", async () => {
  const { ui, counts } = fixture();
  await ui.fillPassword(selector, password);
  assert.deepEqual(counts(), { writes: 1, taps: 1, selections: 1 });
  assert.deepEqual(await ui.find(selector), { x: 110, y: 50, bounds: [10, 20, 210, 80] });
});

test("password fill accepts an exact protected value without exporting it", async () => {
  const { ui, counts } = fixture({ displayed: value => value });
  await ui.fillPassword(selector, password);
  assert.equal(counts().writes, 1);
  assert.deepEqual(await ui.find(selector), { x: 110, y: 50, bounds: [10, 20, 210, 80] });
});

test("password fill reacquires and replaces a partial entry within its existing attempt limit", async () => {
  const { ui, counts } = fixture({ displayed: (value, attempt) => "\u2022".repeat(value.length - (attempt === 1 ? 1 : 0)) });
  await ui.fillPassword(selector, password);
  assert.equal(counts().writes, 2);
  assert.equal(counts().selections, 2);
});

test("password fill refuses a non-password field before any input", async () => {
  const { ui, counts } = fixture({ isPassword: false });
  await assert.rejects(ui.fillPassword(selector, password), /Expected a native password field/);
  assert.deepEqual(counts(), { writes: 0, taps: 0, selections: 0 });
});

test("password fill refuses a field that loses password protection after focus", async () => {
  const { ui, counts } = fixture({ passwordState: ({ taps }) => taps === 0 });
  await assert.rejects(ui.fillPassword(selector, password), /Expected a native password field/);
  assert.deepEqual(counts(), { writes: 0, taps: 1, selections: 0 });
});

test("password errors do not expose the input or the shell failure", async () => {
  const { ui } = fixture({ inputFailure: true });
  await assert.rejects(ui.fillPassword(selector, password), error => {
    assert.equal(error.message, "Native password text input failed");
    assert.equal(error.stack.includes(password), false);
    return true;
  });
  await assert.rejects(ui.fillPassword(selector, "invalid$synthetic"), error => {
    assert.equal(error.message, "Password input must be synthetic ASCII");
    assert.equal(error.stack.includes("invalid$synthetic"), false);
    return true;
  });
});

test("ordinary fill still verifies exact plaintext and replaces incorrect same-length input", async () => {
  const { ui, counts } = fixture({ isPassword: false, displayed: (value, attempt) => attempt === 1 ? "x".repeat(value.length) : value });
  await ui.fill(selector, "http://127.0.0.1:4482");
  assert.equal(counts().writes, 2);
  assert.equal(counts().selections, 2);
});

test("password fill rejects wrong mask length and incorrect visible text after bounded attempts", { timeout: 25000, concurrency: true }, async t => {
  await Promise.all([
    ["wrong mask length", value => "\u2022".repeat(value.length - 1)],
    ["partial visible password", value => value.slice(0, -1)],
    ["same-length non-mask", value => "x".repeat(value.length)],
  ].map(([name, displayed]) => t.test(name, async () => {
    const { ui, counts } = fixture({ displayed });
    await assert.rejects(ui.fillPassword(selector, password), error => {
      assert.equal(error.message.includes(password), false);
      assert.match(error.message, /Timeout 20000ms exceeded/);
      return true;
    });
    assert.equal(counts().writes, 3);
    assert.equal(counts().selections, 3);
  })));
});
