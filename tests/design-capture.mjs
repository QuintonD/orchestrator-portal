// Reproducible visual review against a fresh synthetic workspace, never personal data.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const output = path.resolve('test-results/design-review');
await mkdir(output, { recursive: true });
const dataDir = await mkdtemp(path.join(output, 'synthetic-'));
const server = spawn(process.execPath, ['apps/server/dist/server.js'], {
  env: { ...process.env, ORCHESTRATOR_DEMO: '1', ORCHESTRATOR_PORT: '4417', ORCHESTRATOR_HOST: '127.0.0.1', ORCHESTRATOR_DATA_DIR: dataDir },
  stdio: 'ignore', windowsHide: true,
});
let browser;
const results = [];
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Visual QA gateway exited');
    if (await fetch('http://127.0.0.1:4417/healthz').then((r) => r.ok).catch(() => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  for (const theme of ['light', 'dark']) {
    for (const [size, width, height] of [['mobile', 393, 851], ['desktop', 1440, 1000]]) {
      // Separate viewport journeys represent independent clients, as in e2e/fixtures.ts.
      const client = 1 + (theme === 'dark' ? 2 : 0) + (size === 'desktop' ? 1 : 0);
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', extraHTTPHeaders: { 'X-Forwarded-For': `198.18.0.${client}` } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript((value) => localStorage.setItem('orchestrator-theme', value), theme);
      for (const [route, title] of [['/', 'Portal'], ['/agents', 'Team'], ['/reports', 'Reports'], ['/connections', 'Connections'], ['/assistant', 'Conversations'], ['/work', 'Work'], ['/councils', 'Councils'], ['/activity', 'Activity'], ['/attention', 'Attention'], ['/brain', 'Knowledge'], ['/insights', 'Insights'], ['/settings', 'Settings']]) {
        await page.goto(`http://127.0.0.1:4417${route}`);
        await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
        if (route === '/agents') await page.locator('.assistant-sigil').first().waitFor();
        if (route === '/reports') await page.locator('.evidence-strip').waitFor();
        if (route === '/connections') await page.getByRole('heading', { name: 'Found on your gateway' }).waitFor();
        await page.evaluate(() => Promise.all(Array.from(document.images, (image) => image.decode().catch(() => {}))));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${title} overflowed`);
        const name = `${title.toLowerCase()}-${size}-${theme}`;
        await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
        if (route === '/' && size === 'mobile') await page.screenshot({ path: path.join(output, `${name}-viewport.png`) });
        results.push({ name, overflow: false });
        if (route === '/agents') {
          await page.getByRole('button', { name: 'Assistant icon themes', exact: true }).click();
          await page.evaluate(() => Promise.all(['animals', 'symbols', 'geometry'].map(async (theme) => {
            const atlas = new Image(); atlas.src = `/assets/assistants-${theme}.png`; await atlas.decode();
          })));
          await page.screenshot({ path: path.join(output, `icon-picker-${size}-${theme}.png`) });
          await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
          for (const iconTheme of ['animals', 'geometry']) {
            await page.evaluate((value) => { localStorage.setItem('orchestrator-icon-theme', value); window.dispatchEvent(new StorageEvent('storage', { key: 'orchestrator-icon-theme', newValue: value })); }, iconTheme);
            await page.screenshot({ path: path.join(output, `assistants-${iconTheme}-${size}-${theme}.png`), fullPage: true });
          }
        }
      }
      assert.deepEqual(errors, [], 'Unexpected browser errors');
      console.log(`Reviewed ${size} ${theme}: 12 routes and icon variants`);
      await page.close();
    }
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2));
  const files = (await readdir(output)).filter((file) => file.endsWith('.png') && !file.startsWith('all-')).sort();
  await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Orchestrator visual QA</title><style>body{background:#f7f6f2;color:#171715;font:16px system-ui;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px}figure{margin:0}img{width:100%;height:400px;object-fit:contain;object-position:top;background:#e9e8e2}figcaption{margin:8px 0;font-size:13px}</style><h1>Orchestrator visual QA</h1><p>Fresh synthetic workspace. Select an image to inspect it at full size.</p><main>${files.map((file) => `<figure><a href="${file}"><img src="${file}" loading="lazy" alt="${file.slice(0,-4)}"></a><figcaption>${file.slice(0,-4)}</figcaption></figure>`).join('')}</main></html>`);
  console.log(`Captured ${results.length} surfaces in ${output}`);
} finally {
  await browser?.close();
  server.kill();
}
