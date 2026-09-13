import { expect } from "@playwright/test";
import assert from "node:assert/strict";

export function nativeControls(getDevice) {
  async function findNode(selector, expectedPassword) {
    const device = getDevice();
    const result = (await device.shell("uiautomator dump /sdcard/orchestrator-qa.xml")).toString();
    if (!result.includes("dumped to")) return null;
    const xml = (await device.shell("cat /sdcard/orchestrator-qa.xml")).toString();
    const names = { text: "text", desc: "content-desc", res: "resource-id", clazz: "class" };
    const decode = value => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
    for (const item of xml.matchAll(/<node\s[^>]+/g)) {
      const attributes = Object.fromEntries([...item[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], decode(match[2])]));
      if (!Object.entries(selector).every(([key, value]) => value instanceof RegExp ? value.test(attributes[names[key]] ?? "") : attributes[names[key]] === value)) continue;
      const bounds = attributes.bounds.match(/\d+/g).map(Number);
      if (bounds[2] <= bounds[0] || bounds[3] <= bounds[1] || attributes.enabled === "false") continue;
      return {
        point: { x: (bounds[0] + bounds[2]) / 2, y: (bounds[1] + bounds[3]) / 2, bounds },
        password: attributes.password === "true" && attributes.class === "android.widget.EditText",
        maskedLength: /^\u2022*$/u.test(attributes.text ?? "") ? (attributes.text ?? "").length : null,
        passwordMatches: typeof expectedPassword === "string" && attributes.text === expectedPassword,
      };
    }
    return null;
  }
  async function find(selector) { return (await findNode(selector))?.point ?? null; }
  async function waitNode(selector) {
    let target;
    await expect.poll(async () => { target = await findNode(selector); return !!target; }, { timeout: 20000 }).toBe(true);
    return target;
  }
  async function wait(selector) { return (await waitNode(selector)).point; }
  async function tap(selector) {
    const point = await wait(selector);
    await getDevice().shell(`input tap ${Math.round(point.x)} ${Math.round(point.y)}`);
  }
  async function focus(selector, tapTarget = tap) {
    await tapTarget(selector);
    // A cold emulator can expose the Activity before its input window accepts
    // the first tap. Reacquire current bounds and focus again, while still
    // requiring a visible IME before injecting or verifying any text.
    await expect.poll(async () => {
      if (await keyboardShown()) return true;
      await tapTarget(selector);
      return keyboardShown();
    }, { timeout: 20000 }).toBe(true);
  }
  async function fill(selector, value) {
    // All test inputs are synthetic ASCII. Do not interpolate arbitrary shell text.
    assert.match(value, /^[a-zA-Z0-9:/._ -]+$/);
    await focus(selector);
    // IME startup can interrupt shell text injection. Check the resulting native
    // field before continuing, and retry this idempotent fill if it was partial.
    for (let attempt = 0; attempt < 3; attempt++) {
      await getDevice().shell("input keycombination 113 29");
      await getDevice().shell(`input text ${value.replaceAll(" ", "%s")}`);
      if (await find({ ...selector, text: value })) return;
    }
    await wait({ ...selector, text: value });
  }
  async function fillPassword(selector, value) {
    assert.ok(typeof value === "string" && /^[a-zA-Z0-9:/._ -]+$/.test(value), "Password input must be synthetic ASCII");
    const requirePassword = node => assert.ok(node?.password, "Expected a native password field");
    await focus(selector, async target => {
      const node = await waitNode(target);
      requirePassword(node);
      await getDevice().shell(`input tap ${Math.round(node.point.x)} ${Math.round(node.point.y)}`);
    });
    const complete = async () => {
      const node = await findNode(selector, value);
      requirePassword(node);
      return node.maskedLength === value.length || node.passwordMatches;
    };
    // Android can expose a mask or the value for a protected field. Compare
    // locally without returning text; successful login verifies the credential.
    for (let attempt = 0; attempt < 3; attempt++) {
      requirePassword(await findNode(selector));
      await getDevice().shell("input keycombination 113 29");
      try { await getDevice().shell(`input text ${value.replaceAll(" ", "%s")}`); }
      catch { throw new Error("Native password text input failed"); }
      if (await complete()) return;
    }
    await expect.poll(complete, { timeout: 20000 }).toBe(true);
  }
  async function tapWeb(page, locator) {
    const { bounds } = await wait({ clazz: "android.webkit.WebView" });
    await expect(locator).toBeVisible();
    await expect(locator).toBeEnabled();
    // CDP's input/quad conversion can retain the old Android display density.
    // Measure and hit-test in the document, then send actual Android touch input.
    await locator.evaluate(element => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
    await expect.poll(() => locator.evaluate(element => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit === element || element.contains(hit);
    })).toBe(true);
    const box = await locator.evaluate(element => element.getBoundingClientRect().toJSON());
    const scale = (bounds[2] - bounds[0]) / await page.evaluate(() => innerWidth);
    await getDevice().shell(`input tap ${Math.round(bounds[0] + (box.x + box.width / 2) * scale)} ${Math.round(bounds[1] + (box.y + box.height / 2) * scale)}`);
  }
  async function key(key) { await getDevice().shell(`input keyevent ${key === "Back" ? 4 : 3}`); }
  async function keyboardShown() { return /mInputShown=true|isInputViewShown=true/.test((await getDevice().shell("dumpsys input_method")).toString()); }
  async function hideKeyboard() { if (await keyboardShown()) await key("Back"); }
  async function background(pkg) {
    await key("Home");
    // The launcher can resume before the previous Activity completes onPause/onStop.
    // Wait for the OS lifecycle acknowledgement before simulating process death.
    await expect.poll(async () => {
      const dump = (await getDevice().shell("dumpsys activity activities")).toString();
      const activity = dump.split(`packageName=${pkg} processName=${pkg}`)[1];
      return activity?.match(/\bstate=(\w+)/)?.[1];
    }, { timeout: 20000 }).toBe("STOPPED");
  }
  return { find, wait, tap, fill, fillPassword, tapWeb, key, keyboardShown, hideKeyboard, background };
}
