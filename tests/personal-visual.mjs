import { chromium, _android as android } from 'playwright';
import { expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { nativeControls } from './android/native.mjs';

const native = process.argv.includes('--android');
const output = path.resolve('test-results/personal-visual', native ? 'android' : 'browser');
await mkdir(output, { recursive: true });
const dataDir = await mkdtemp(path.join(output, 'synthetic-'));
const port = native ? 4473 : 4472;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['apps/server/dist/server.js'], { env: { ...process.env, ORCHESTRATOR_DEMO: '1', ORCHESTRATOR_PORT: String(port), ORCHESTRATOR_HOST: '127.0.0.1', ORCHESTRATOR_DATA_DIR: dataDir }, stdio: 'ignore', windowsHide: true });
let browser, device, page; const captures = [], errors = [];
async function shot(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: overflow`);
  if (device) { await new Promise((r) => setTimeout(r, 250)); await device.screenshot({ path: path.join(output, name + '.png') }); }
  else await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
  captures.push(name); console.log(`PASS ${name}`);
}
try {
  await expect.poll(() => fetch(`${base}/healthz`).then((r) => r.status).catch(() => 0), { timeout: 20000 }).toBe(200);
  if (native) {
    const sdk = process.env.ANDROID_HOME ?? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'); const serial = process.env.ANDROID_QA_SERIAL ?? 'emulator-5560'; assert.match(serial, /^emulator-\d+$/);
    const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    execFileSync(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    assert.equal(execFileSync(adb, ['-s', serial, 'shell', 'getprop', 'ro.kernel.qemu'], { encoding: 'utf8' }).trim(), '1');
    execFileSync(adb, ['-s', serial, 'shell', 'pm', 'clear', 'io.github.quintond.orchestrator.debug']);
    const devices = await android.devices({ omitDriverInstall: true }); device = devices.find((d) => d.serial() === serial); await Promise.all(devices.filter((d) => d !== device).map((d) => d.close())); assert(device, 'Disposable emulator required');
    await device.shell('am start -W -n io.github.quintond.orchestrator.debug/io.github.quintond.orchestrator.MainActivity');
    const ui = nativeControls(() => device); await ui.fill({ desc: 'Gateway address' }, base); await ui.tap({ text: 'Connect to gateway' });
    page = await (await device.webView({ pkg: 'io.github.quintond.orchestrator.debug' })).page();
    await expect.poll(() => page.url()).toContain(base);
  } else { browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); }
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of native ? [0] : [1440, 393, 320]) {
    if (width) await page.setViewportSize({ width, height: width === 1440 ? 1000 : 851 });
    for (const theme of ['light', 'dark']) {
      await page.goto(`${base}/personal`); await page.evaluate((theme) => localStorage.setItem('orchestrator-theme', theme), theme); await page.reload();
      for (const area of ['today', 'projects', 'money', 'life']) {
        await page.getByRole('navigation', { name: 'Personal workspace' }).getByRole('button', { name: ({ today: 'Today', projects: 'Projects', money: 'Money', life: 'Life & agenda' })[area], exact: true }).click(); await expect(page.locator('.personal-card').first()).toBeVisible(); await shot(`${width || 'native'}-${theme}-${area}`);
      }
    }
  }
  if (!native) await page.setViewportSize({ width: 393, height: 851 });
  await page.goto(`${base}/personal?area=projects`); await page.getByRole('button', { name: 'New project', exact: true }).click(); await shot('project-create-phone'); await page.keyboard.press('Escape');
  await page.locator('.personal-project-card').first().click(); await shot('project-plan-phone');
  const dialog = page.getByRole('dialog'); await dialog.getByRole('checkbox').check(); await dialog.getByRole('button', { name: 'Prepare deliverables' }).click(); await expect(dialog.locator('.personal-draft').first()).toBeVisible(); await shot('project-draft-phone');
  await dialog.getByRole('button', { name: 'Pause', exact: true }).click(); await page.keyboard.press('Escape');
  await page.goto(`${base}/personal?area=money`); await page.getByRole('button', { name: 'My money plan', exact: true }).click(); await shot('money-plan-phone'); await page.keyboard.press('Escape');
  await page.goto(`${base}/personal?area=life`); await page.getByRole('button', { name: 'Check in', exact: true }).click(); await shot('checkin-phone');
  if (device) { await page.getByLabel('Progress (sessions)').fill('1'); await page.getByLabel('What helped or got in the way?').fill('Native keyboard and check-in flow verified.'); await page.getByRole('button', { name: 'Record progress' }).click(); await expect(page.getByRole('dialog')).toContainText('Native keyboard and check-in flow verified.'); await shot('checkin-recorded-native'); }
  if (device) { await device.shell('input keyevent 4'); await expect(page.getByRole('dialog')).not.toBeVisible(); }
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'results.json'), JSON.stringify({ native, captures, errors }, null, 2));
} catch (e) { if (page) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}); await writeFile(path.join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => '')).catch(() => {}); } throw e; } finally { await browser?.close(); await device?.close(); server.kill(); }
