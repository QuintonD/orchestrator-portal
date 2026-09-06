// A complete, isolated synthetic journey; no personal gateways or live providers.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const output = path.resolve('test-results/beta-review');
await mkdir(output, { recursive: true });
const dataDir = await mkdtemp(path.join(output, 'synthetic-'));
const server = spawn(process.execPath, ['apps/server/dist/server.js'], { env: { ...process.env, ORCHESTRATOR_DEMO: '1', ORCHESTRATOR_PORT: '4427', ORCHESTRATOR_HOST: '127.0.0.1', ORCHESTRATOR_DATA_DIR: dataDir }, stdio: 'ignore', windowsHide: true });
const baseURL = 'http://127.0.0.1:4427';
const results = [];
let browser, page;
async function step(name, action) { const started = Date.now(); await action(); results.push({ name, passed: true, milliseconds: Date.now() - started }); process.stdout.write(`PASS ${name}\n`); }
async function capture(name) { await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`); }
try {
  for (let i = 0; i < 100; i++) { if (await fetch(`${baseURL}/healthz`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
  page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await step('Immediate value and prepared workspace team', async () => {
    await page.goto('/'); await expect(page.locator('.prepared-work')).toContainText('results ready to review'); await capture('01-home-desktop');
    await page.goto('/agents'); await page.getByRole('button', { name: 'Add prepared team', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'A team, already prepared' });
    await expect(dialog.getByLabel('Team connection')).toHaveValue('workspace');
    await expect(dialog).toContainText('Already in your team'); await capture('02-default-team');
    await dialog.getByRole('button', { name: 'Add team & prepare reports' }).click();
    await expect(dialog).not.toBeVisible(); await expect(page.getByRole('heading', { name: 'Lens', exact: true })).toBeVisible();
  });
  await step('Role identity, distinct conversation and reload persistence', async () => {
    await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'Sage', exact: true }) }).click();
    await page.getByRole('button', { name: 'Open conversation', exact: true }).click();
    await expect(page).toHaveURL(/assistant=sage/); await expect(page.getByRole('heading', { name: 'Sage', exact: true, level: 1 })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('What evidence supports the launch copy?'); await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('.message-body').last()).toContainText('five-second comprehension check');
    await page.reload(); await expect(page.locator('.message-body').last()).toContainText('five-second comprehension check'); await capture('03-sage-conversation');
    await page.getByLabel('Conversation assistant').selectOption('atlas'); await expect(page.locator('.conversation-welcome')).toContainText('Atlas is ready');
  });
  await step('Report, in-place source inspection and evidence-led revision', async () => {
    await page.goto('/agents'); const atlas = page.locator('.agent-surface').filter({ has: page.getByRole('heading', { name: 'Atlas', exact: true }) });
    await atlas.getByRole('button', { name: 'Request report', exact: true }).click();
    await page.locator('.report-row').filter({ has: page.getByRole('heading', { name: /^Atlas ·/ }) }).first().click();
    const dialog = page.getByRole('dialog').first(); await expect(dialog).toContainText('Recommended next step'); await capture('04-structured-report');
    await dialog.getByRole('button', { name: 'Launch audience brief', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Launch audience brief', exact: true })).toContainText('Synthetic fixture v1'); await page.keyboard.press('Escape');
    await dialog.getByLabel('Correction or follow-up').fill('Require evidence before publication'); await dialog.getByRole('button', { name: 'Send correction', exact: true }).click();
    await expect(dialog).toContainText('Changed in this revision'); await expect(dialog).toContainText('Hold publication'); await capture('05-revision');
    await page.keyboard.press('Escape');
  });
  await step('Phone decision: compare options, inspect evidence, record once and follow work', async () => {
    await page.setViewportSize({ width: 393, height: 851 }); await page.goto('/attention');
    await page.locator('.attention-card').filter({ hasText: 'Launch copy needs your decision' }).getByRole('button', { name: 'Review', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog.locator('.decision-option')).toHaveCount(2); await capture('06-decision-phone');
    await dialog.getByRole('button', { name: 'Use this direction', exact: true }).click();
    await expect(dialog).not.toBeVisible(); await expect(page.locator('.attention-card').filter({ hasText: 'Launch copy needs your decision' })).toHaveCount(0);
    await page.goto('/work'); const project = page.locator('.project-card').filter({ has: page.getByRole('heading', { name: 'Studio launch', exact: true }) });
    await expect(project).toContainText('Direction chosen'); await expect(project).toContainText('54%'); await capture('07-work-after-decision');
    await page.goto('/'); await expect(page.locator('.outcome-counts')).toContainText('1 decisions recorded'); await capture('08-home-phone');
  });
  await step('Narrow dark layouts, icon themes, compact composer and keyboard focus', async () => {
    await page.evaluate(() => localStorage.setItem('orchestrator-theme', 'dark'));
    await page.setViewportSize({ width: 320, height: 740 }); await page.goto('/agents?source=demo'); await capture('09-defaults-narrow-dark');
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Assistant icon themes', exact: true }).click(); await capture('10-icons-dark'); await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 393, height: 540 }); await page.goto('/assistant?assistant=sage');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeInViewport({ ratio: 1 });
    await page.getByRole('textbox', { name: 'Message', exact: true }).focus(); await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeFocused(); await capture('11-compact-conversation');
  });
  await step('Profile preferences and archive preserve prior reports', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/agents');
    await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'Lens', exact: true }) }).click(); await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
    const dialog = page.getByRole('dialog'); await dialog.getByLabel('Name', { exact: true }).fill('Evidence guide'); await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Evidence guide', exact: true })).toBeVisible();
    await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'Evidence guide', exact: true }) }).click(); await page.getByRole('button', { name: 'Edit profile', exact: true }).click(); await page.getByRole('button', { name: 'Archive profile', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Evidence guide', exact: true })).toHaveCount(0);
  });
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'results.json'), JSON.stringify({ results, errors }, null, 2));
} catch (error) { if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}); throw error; }
finally { await browser?.close(); server.kill(); }
