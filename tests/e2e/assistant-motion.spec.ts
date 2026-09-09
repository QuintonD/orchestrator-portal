import { test, expect } from "./fixtures.js";
import { readFile } from "node:fs/promises";

test("reduced motion explains a still preview and explicit full motion moves actual nodes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/assistant-motion");
  const field = page.locator(".motion-studio__art .presence-field");
  const node = field.locator('[data-node="assistant-1"]');
  await expect(page.getByText("Your device has reduced motion enabled.", { exact: false })).toBeVisible();
  await expect(field).toHaveAttribute("data-motion", "paused");
  const before = await node.getAttribute("transform");
  await page.getByRole("button", { name: "Play full motion", exact: true }).click();
  await expect(field).toHaveAttribute("data-motion", "running");
  await expect.poll(() => node.getAttribute("transform")).not.toBe(before);
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await expect(field).toHaveAttribute("data-motion", "paused");
  const stopped = await node.getAttribute("transform");
  await page.waitForTimeout(200);
  expect(await node.getAttribute("transform")).toBe(stopped);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await field.scrollIntoViewIfNeeded();
  await expect.poll(() => node.getAttribute("transform")).not.toBe(stopped);
  await page.getByRole("combobox", { name: "Motion preference" }).selectOption("system");
  await expect(field).toHaveAttribute("data-motion", "paused");
});

test("original comparison uses the transparent PNG at exactly the live artboard size", async ({ page }) => {
  await page.goto("/assistant-motion");
  const field = page.locator(".motion-studio__art .presence-field");
  const bounds = await field.boundingBox();
  await page.getByRole("button", { name: "Compare original" }).click();
  const image = field.locator("img");
  await expect(image).toBeVisible();
  expect(await field.boundingBox()).toEqual(bounds);
  expect(await image.evaluate(async element => {
    const img = element as HTMLImageElement; await img.decode();
    const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d")!; context.drawImage(img, 0, 0);
    const data = context.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data;
    let ink = 0; for (let i = 3; i < data.length; i += 4) if (data[i]! > 128) ink++;
    return { width: img.naturalWidth, height: img.naturalHeight, alpha: context.getImageData(0, 0, 1, 1).data[3], visibleInk: ink > 40000, servedAsset: new URL(img.src).pathname === "/assistant-original.png" };
  })).toEqual({ width: 1371, height: 1148, alpha: 0, visibleInk: true, servedAsset: true });
  await page.screenshot({ path: `test-results/assistant-motion/original-${test.info().project.name}.png` });
  await page.getByRole("button", { name: "Back to animation" }).click();
  await expect(field.locator("svg")).toBeVisible();
  expect(await field.boundingBox()).toEqual(bounds);
});

test("all studies render, finite gestures settle, and themes fit desktop and mobile", async ({ page }, testInfo) => {
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/")) requests.push(request.url()); });
  await page.goto("/assistant-motion");
  await page.getByRole("combobox", { name: "Motion preference" }).selectOption("full");
  const field = page.locator(".motion-studio__art .presence-field");
  for (const group of ["Idle", "Active", "Network", "Personality", "Outcome"]) {
    await page.getByRole("group", { name: "Animation categories" }).getByRole("button", { name: group, exact: true }).click();
    const buttons = page.getByRole("group", { name: "Assistant animations" }).getByRole("button");
    for (let i = 0; i < await buttons.count(); i++) {
      await buttons.nth(i).click();
      await field.scrollIntoViewIfNeeded();
      if (await field.getAttribute("data-state") === "still") await expect(field.locator("img")).toBeVisible();
      else {
        await expect(field.locator("svg")).toBeVisible();
        expect(await field.locator('[data-node="centre"]').count()).toBe(1);
        expect(await field.locator(".assistant-mark__node").count()).toBeLessThanOrEqual(36);
        const attachmentError = await field.evaluate(element => {
          let error = 0;
          for (const stem of element.querySelectorAll<SVGPathElement>(".assistant-mark__stem[data-child]")) {
            if (stem.getAttribute("opacity") === "0") continue;
            const node = element.querySelector<SVGGElement>(`[data-node="${stem.dataset.child}"]`)!;
            const parent = element.querySelector<SVGGElement>(`[data-node="${node.dataset.parent}"]`)!;
            const path = stem.getAttribute("d")!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
            if (path.length !== 4) continue;
            for (const [anchor, x, y] of [[parent, path[0], path[1]], [node, path[2], path[3]]] as const) {
              const radius = Number(anchor.querySelector(".rig-ring")!.getAttribute("r"));
              error = Math.max(error, Math.abs(Math.hypot(x! - Number(anchor.dataset.x), y! - Number(anchor.dataset.y)) - radius));
            }
          }
          return error;
        });
        expect(attachmentError).toBeLessThan(.003);
      }
      if (["success", "error"].includes((await field.getAttribute("data-state"))!)) {
        await expect(field.locator("svg")).toHaveAttribute("data-settled", "true");
        await page.getByRole("button", { name: "Replay animation" }).click();
        await field.scrollIntoViewIfNeeded();
        await expect(field.locator("svg")).toHaveAttribute("data-settled", "false");
      }
    }
  }
  await page.getByRole("button", { name: "Reset team", exact: true }).click();
  await page.getByRole("button", { name: "Drift in 3D", exact: false }).click();
  await field.scrollIntoViewIfNeeded();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.getByRole("button", { name: "Pause motion" })).toHaveCSS("color", theme === "dark" ? "rgb(244, 243, 239)" : "rgb(17, 17, 17)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/assistant-motion/${testInfo.project.name}-${theme}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(requests).toEqual([]);
});

test("satin has independent moving illumination and ring masks on the live geometry", async ({ page }, testInfo) => {
  await page.goto("/assistant-motion");
  await page.getByRole("combobox", { name: "Motion preference" }).selectOption("full");
  await expect(page.getByRole("button", { name: /^graphite$/i })).toHaveCount(0);
  await page.getByRole("button", { name: /^satin$/i }).click();
  const field = page.locator(".presence-field"); await field.scrollIntoViewIfNeeded();
  const gradients = field.locator("radialGradient");
  await expect(gradients).toHaveCount(6);
  const before = await gradients.evaluateAll(nodes => nodes.map(node => node.getAttribute("cx")));
  await expect.poll(() => gradients.evaluateAll(nodes => nodes.map(node => node.getAttribute("cx")))).not.toEqual(before);
  expect(await field.locator(".rig-cutouts circle").count()).toBe(6);
  expect(await gradients.evaluateAll(nodes => new Set(nodes.map(node => node.id)).size)).toBe(6);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await field.scrollIntoViewIfNeeded();
    const lightDirection = await gradients.first().evaluate(gradient => {
      const stops = gradient.querySelectorAll("stop");
      return Number(getComputedStyle(stops[0]!).stopOpacity) - Number(getComputedStyle(stops[3]!).stopOpacity);
    });
    if (theme === "dark") expect(lightDirection).toBeGreaterThan(0);
    else expect(lightDirection).toBeLessThan(0);
    await field.screenshot({ path: `test-results/assistant-motion/satin-${testInfo.project.name}-${theme}.png` });
  }
});

test("growth starts on the original rim, preserves the team, and supports adjacent parents", async ({ page }) => {
  await page.goto("/assistant-motion");
  await page.getByRole("combobox", { name: "Motion preference" }).selectOption("full");
  const field = page.locator(".motion-studio__art .presence-field");
  await page.getByRole("button", { name: "Reset team", exact: true }).click();
  await expect(field.locator("img")).toBeVisible();
  const original = await field.locator(".assistant-mark__node").evaluateAll(nodes => nodes.map(node => [node.getAttribute("data-node"), node.getAttribute("transform")]));
  await page.getByRole("button", { name: "Add assistant", exact: true }).click();
  await field.scrollIntoViewIfNeeded();
  await expect(field.locator(".assistant-mark__node")).toHaveCount(7);
  const radius = field.locator('[data-node="assistant-5"] .rig-ring');
  await expect.poll(async () => Number(await radius.getAttribute("r"))).toBeGreaterThan(1);
  const beforePause = Number(await radius.getAttribute("r"));
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await expect(field).toHaveAttribute("data-motion", "paused");
  const pausedRadius = Number(await radius.getAttribute("r"));
  expect(pausedRadius).toBeLessThan(beforePause + 1);
  await page.waitForTimeout(120);
  expect(Number(await radius.getAttribute("r"))).toBe(pausedRadius);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await field.scrollIntoViewIfNeeded();
  await expect.poll(async () => Number(await radius.getAttribute("r"))).toBeGreaterThan(6);
  expect(await field.locator(".assistant-mark__node").evaluateAll(nodes => nodes.slice(0, 6).map(node => [node.getAttribute("data-node"), node.getAttribute("transform")]))).toEqual(original);
  await page.getByRole("combobox", { name: "Growth parent" }).selectOption("assistant-1");
  await page.getByRole("button", { name: "Grow a team", exact: false }).click();
  await field.scrollIntoViewIfNeeded();
  await expect(field.locator('[data-node="assistant-6"]')).toHaveAttribute("data-parent", "assistant-1");
  await expect(page.getByTestId("team-total")).toHaveText("7");
  await page.getByRole("button", { name: "Form subteams", exact: false }).click();
  await field.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("team-total")).toHaveText("10");
  await expect(field.locator('[data-parent="assistant-7"]')).toHaveCount(2);
  await expect(field.locator("svg")).toHaveAttribute("data-settled", "true", { timeout: 7000 });
  await page.getByRole("button", { name: "Consolidate", exact: false }).click();
  await field.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("team-total")).toHaveText("10");
  await expect(field.locator("svg")).toHaveAttribute("data-settled", "true", { timeout: 7000 });
  const groups = await field.locator('.assistant-mark__node').count();
  expect(groups).toBeLessThan(11);
  await page.getByRole("button", { name: "Load 36 assistants" }).click();
  await field.scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute("data-state", "consolidating");
  await expect(field.locator('.rig-count').filter({ hasText: /^[78]$/ })).toHaveCount(5);
  await page.getByRole("group", { name: "Animation categories" }).getByRole("button", { name: "Idle", exact: true }).click();
  await page.getByRole("button", { name: "Drift in 3D", exact: false }).click();
  await field.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("team-total")).toHaveText("36");
  await expect(field.locator('.rig-count').filter({ hasText: /^[78]$/ })).toHaveCount(5);
  await field.evaluate(el => { el.style.position = "fixed"; el.style.top = "-2000px"; });
  await expect(field).toHaveAttribute("data-motion", "paused");
  const time = await field.locator("svg").getAttribute("data-time");
  await page.waitForTimeout(150);
  expect(await field.locator("svg").getAttribute("data-time")).toBe(time);
});

test("sound produces a real waveform after a gesture and mute suspends it", async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    (window as any).AudioContext = class extends Native {
      constructor() {
        super(); const context = this; const analyser = this.createAnalyser(); analyser.connect(this.destination);
        const createGain = this.createGain.bind(this); let first = true;
        this.createGain = () => {
          const gain = createGain();
          if (first) { first = false; const connect = gain.connect.bind(gain); gain.connect = ((destination: AudioNode) => connect(destination === context.destination ? analyser : destination)) as typeof gain.connect; }
          return gain;
        };
        (window as any).__motionAudio = { context, analyser };
      }
    };
  });
  await page.goto("/assistant-motion");
  expect(await page.evaluate(() => Boolean((window as any).__motionAudio))).toBe(false);
  await page.getByRole("combobox", { name: "Motion preference" }).selectOption("full");
  await page.getByRole("button", { name: "Sound off", exact: true }).click();
  await page.getByRole("button", { name: "Replay animation" }).click();
  await expect.poll(() => page.evaluate(() => {
    const audio = (window as any).__motionAudio, buffer = new Float32Array(1024);
    audio.analyser.getFloatTimeDomainData(buffer);
    return Math.max(...buffer.map(value => Math.abs(value)));
  })).toBeGreaterThan(.0001);
  await page.getByRole("slider", { name: "Sound volume" }).focus();
  await page.getByRole("slider", { name: "Sound volume" }).press("Home");
  await expect.poll(() => page.evaluate(() => {
    const buffer = new Float32Array(1024); (window as any).__motionAudio.analyser.getFloatTimeDomainData(buffer);
    return Math.max(...buffer.map(value => Math.abs(value)));
  })).toBeLessThan(.00001);
  const field = page.locator(".motion-studio__art .presence-field");
  await field.evaluate(el => { el.style.position = "fixed"; el.style.top = "-2000px"; });
  await expect.poll(() => page.evaluate(() => (window as any).__motionAudio.context.state)).toBe("suspended");
  await field.evaluate(el => el.removeAttribute("style"));
  await field.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => (window as any).__motionAudio.context.state)).toBe("running");
  await page.getByRole("button", { name: "Sound on", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__motionAudio.context.state)).toBe("suspended");
  await expect(page.getByRole("button", { name: "Sound off", exact: true })).toBeVisible();
});

test("standalone exports animate geometry and preserve the original PNG bytes", async ({ page }) => {
  expect(await readFile("assets/assistant-motion/original.png")).toEqual(await readFile("assets/Main_agent_assets/file_000000007eec81f5b3371bdf2befa371.png"));
  const body = await readFile("assets/assistant-motion/drifting.svg", "utf8");
  await page.route("**/motion-export.svg", route => route.fulfill({ contentType: "image/svg+xml", body }));
  await page.goto("/motion-export.svg");
  await expect(page.locator("parsererror")).toHaveCount(0);
  const before = await page.evaluate(() => (document.querySelectorAll(".motion-scene circle")[1] as SVGCircleElement).cx.animVal.value);
  await expect.poll(() => page.evaluate(() => (document.querySelectorAll(".motion-scene circle")[1] as SVGCircleElement).cx.animVal.value)).not.toBe(before);
  const contact = await readFile("assets/assistant-motion/index.html", "utf8");
  await page.route("**/motion-contact", route => route.fulfill({ contentType: "text/html", body: contact }));
  await page.goto("/motion-contact");
  await expect(page.locator("article")).toHaveCount(18);
  await page.getByRole("combobox", { name: "Motion", exact: true }).selectOption("full");
  await page.getByLabel("Pause all").check();
  expect(await page.locator("svg").evaluateAll(svgs => svgs.every(svg => (svg as SVGSVGElement).animationsPaused()))).toBe(true);
});
