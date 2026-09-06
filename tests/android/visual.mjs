// Follow-up visual review on the disposable emulator prepared by qa.mjs.
import { _android as android } from 'playwright';
import { expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const serial = process.env.ANDROID_QA_SERIAL ?? 'emulator-5560';
assert.match(serial, /^emulator-\d+$/);
const output = path.resolve('test-results/android/design-final');
await mkdir(output, { recursive: true });
const dataDir = await mkdtemp(path.join(output, 'synthetic-'));
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
assert(sdk, 'Set ANDROID_HOME');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
execFileSync(adb, ['-s', serial, 'reverse', 'tcp:4461', 'tcp:4461']);
const server = spawn(process.execPath, ['apps/server/dist/server.js'], {
  env: { ...process.env, ORCHESTRATOR_DEMO: '1', ORCHESTRATOR_PORT: '4461', ORCHESTRATOR_HOST: '127.0.0.1', ORCHESTRATOR_DATA_DIR: dataDir },
  stdio: 'ignore', windowsHide: true,
});
let device;
try {
  await expect.poll(async () => fetch('http://127.0.0.1:4461/healthz').then((r) => r.status).catch(() => 0)).toBe(200);
  const devices = await android.devices({ omitDriverInstall: true });
  device = devices.find((entry) => entry.serial() === serial);
  await Promise.all(devices.filter((entry) => entry !== device).map((entry) => entry.close()));
  assert(device, 'QA emulator is required');
  await device.shell('am start -n io.github.quintond.orchestrator.debug/io.github.quintond.orchestrator.MainActivity');
  const page = await (await device.webView({ pkg: 'io.github.quintond.orchestrator.debug' })).page();
  for (const theme of ['light', 'dark']) {
    await page.goto('http://127.0.0.1:4461');
    await page.evaluate((value) => {
      localStorage.setItem('orchestrator-theme', value);
      localStorage.setItem('orchestrator-icon-theme', 'symbols');
    }, theme);
    for (const [route, title] of [['/', 'Portal'], ['/reports', 'Reports'], ['/connections', 'Connections'], ['/agents', 'Team'], ['/assistant', 'Conversations'], ['/assistant?assistant=sage', 'Sage'], ['/insights', 'Insights']]) {
      await page.goto(`http://127.0.0.1:4461${route}`);
      await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
      if (route === '/reports') {
        const heading = page.locator('.report-row h2').first();
        await expect(heading).toBeVisible();
        assert((await heading.boundingBox()).width > 200, 'Report title was squeezed');
      }
      if (route === '/connections') await expect(page.getByRole('heading', { name: 'Found on your gateway' })).toBeVisible();
      if (route === '/agents') await expect(page.locator('.assistant-sigil').first()).toBeVisible();
      await page.evaluate(() => Promise.all(Array.from(document.images, (image) => image.decode().catch(() => {}))));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await new Promise((resolve) => setTimeout(resolve, 250));
      await device.screenshot({ path: path.join(output, `${title.toLowerCase()}-${theme}.png`) });
    }
  }
  await page.goto('http://127.0.0.1:4461/agents');
  await page.getByRole('button', { name: 'Assistant icon themes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Assistant icons' });
  await expect(dialog.locator('.assistant-sprite')).toHaveCount(12);
  await page.evaluate(() => Promise.all(['animals', 'symbols', 'geometry'].map(async (theme) => {
    const atlas = new Image(); atlas.src = `/assets/assistants-${theme}.png`; await atlas.decode();
  })));
  await dialog.getByRole('button', { name: 'Animals', exact: true }).click();
  await dialog.getByRole('button', { name: 'Preview animation' }).click();
  const preview = dialog.locator('.assistant-sprite').first();
  const frame = await preview.evaluate((el) => getComputedStyle(el).maskPosition);
  await expect.poll(() => preview.evaluate((el) => getComputedStyle(el).maskPosition)).not.toBe(frame);
  await dialog.getByRole('button', { name: 'Stop preview' }).click();
  await device.screenshot({ path: path.join(output, 'icon-picker-dark.png') });
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.locator('.agent-surface .assistant-sprite').first()).toHaveAttribute('data-icon-theme', 'animals');
  await device.screenshot({ path: path.join(output, 'assistants-animals-dark.png') });
  console.log(`Android visual review: 16 surfaces captured, theme persistence and animation passed in ${output}`);
} finally {
  await device?.close();
  server.kill();
}
