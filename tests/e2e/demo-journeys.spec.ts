import { test, expect } from './fixtures.js';

test('conversation keeps its composer above navigation at phone and compact heights', async ({ page }) => {
  for (const height of [851, 540]) {
    await page.setViewportSize({ width: 393, height });
    await page.goto('/assistant');
    const send = page.getByRole('button', { name: 'Send message' });
    await expect(send).toBeInViewport({ ratio: 1 });
    const sendBox = (await send.boundingBox())!;
    const navigation = (await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox())!;
    expect(sendBox.y + sendBox.height).toBeLessThanOrEqual(navigation.y);
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('What is my priority?');
    await send.click();
    await expect(page.locator('.message-body').last()).toContainText('launch positioning');
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  }
});

test('assistant pause, resume, briefing and correction preserve the original report', async ({ page }, testInfo) => {
  const name = `Flow reviewer ${testInfo.project.name} ${Date.now()}`;
  const response = await page.request.post('/api/assistants', { data: {
    name, purpose: 'Review the launch decision with evidence.', criteria: 'Provide sources and next steps.',
    connectorId: 'demo', cadence: 'manual', providerPolicy: 'local', spendingLimit: 0,
    scope: [], runtimePolicyConfirmed: true,
  } });
  expect(response.ok()).toBe(true);
  await page.goto('/agents');
  const assistant = page.locator('.agent-surface').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await assistant.getByRole('button', { name: `Pause ${name}`, exact: true }).click();
  await expect(assistant.getByRole('button', { name: 'Request report' })).toBeDisabled();
  await page.reload();
  await assistant.getByRole('button', { name: `Resume ${name}`, exact: true }).click();
  await assistant.getByRole('button', { name: 'Request report' }).click();
  const report = page.locator('.report-row').filter({ has: page.getByRole('heading', { name: new RegExp(name) }) }).first();
  await expect(report).toContainText('Studio launch');
  await report.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Recommended next step');
  await dialog.getByLabel('Correction or follow-up').fill('Separate launch progress from readiness to publish.');
  await dialog.getByRole('button', { name: 'Send correction', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: new RegExp(`Revision · ${name}`) })).toBeVisible();
  await expect(dialog).toContainText('Separate launch progress from readiness to publish.');
  await expect(dialog.getByText('claimed', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.report-row').filter({ has: page.getByRole('heading', { name: new RegExp(name) }) })).toHaveCount(2);
  await page.setViewportSize({ width: 393, height: 540 });
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Conversations', exact: true }).click();
  const toast = page.getByRole('status');
  await expect(toast).toBeVisible();
  const toastBox = (await toast.boundingBox())!;
  const sendBox = (await page.getByRole('button', { name: 'Send message' }).boundingBox())!;
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(sendBox.y);
});
