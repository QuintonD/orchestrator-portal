import { test, expect } from './fixtures.js';

test('each atlas has sixteen visible cells with transparent separation', async ({ page }) => {
  await page.goto('/agents');
  for (const theme of ['animals', 'symbols', 'geometry']) {
    const cells = await page.evaluate(async (value) => {
      const image = new Image(); image.src = `/assets/assistants-${value}.png`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return Array.from({ length: 16 }, (_, index) => {
        const col = index % 4, row = Math.floor(index / 4);
        const x = Math.floor(col * canvas.width / 4), y = Math.floor(row * canvas.height / 4);
        const width = Math.floor((col + 1) * canvas.width / 4) - x;
        const height = Math.floor((row + 1) * canvas.height / 4) - y;
        const pixels = context.getImageData(x, y, width, height).data;
        let ink = 0, edgeInk = 0, transparent = 0;
        for (let pixel = 0; pixel < width * height; pixel++) {
          const alpha = pixels[pixel * 4 + 3]!;
          if (alpha === 0) transparent++;
          if (alpha <= 80) continue;
          ink++;
          if (pixel % width < 2 || pixel % width >= width - 2 || Math.floor(pixel / width) < 2 || Math.floor(pixel / width) >= height - 2) edgeInk++;
        }
        return { ink, edgeInk, transparent: transparent / (width * height) };
      });
    }, theme);
    for (const cell of cells) {
      expect(cell.ink, `${theme}: empty cell`).toBeGreaterThan(50);
      expect(cell.edgeInk, `${theme}: artwork crosses a cell boundary`).toBe(0);
      expect(cell.transparent, `${theme}: opaque background`).toBeGreaterThan(0.7);
    }
  }
});

test('icon themes preview, apply immediately and persist across reload', async ({ page }) => {
  await page.goto('/agents');
  const sprite = page.locator('.agent-surface .assistant-sprite').first();
  await expect(sprite).toHaveAttribute('data-icon-theme', 'symbols');
  await page.getByRole('button', { name: 'Assistant icon themes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Assistant icons', exact: true });
  await expect(dialog.locator('.assistant-sprite')).toHaveCount(12);
  await dialog.getByRole('button', { name: 'Animals', exact: true }).click();
  await expect(sprite).toHaveAttribute('data-icon-theme', 'animals');
  await dialog.getByRole('button', { name: 'Preview animation' }).click();
  const preview = dialog.locator('.assistant-sprite').first();
  await expect(preview).toHaveClass(/is-working/);
  const frame = await preview.evaluate((el) => getComputedStyle(el).maskPosition);
  await expect.poll(() => preview.evaluate((el) => getComputedStyle(el).maskPosition)).not.toBe(frame);
  await dialog.getByRole('button', { name: 'Stop preview' }).click();
  await expect(preview).not.toHaveClass(/is-working/);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(sprite).toHaveAttribute('data-icon-theme', 'animals');
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Animals Selected' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Geometry', exact: true }).click();
  await page.goto('/agents');
  await expect(sprite).toHaveAttribute('data-icon-theme', 'geometry');
});

test('reduced motion freezes previews and invalid preferences recover', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('orchestrator-icon-theme', '../../bad.png'));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/agents');
  await expect(page.locator('.agent-surface .assistant-sprite').first()).toHaveAttribute('data-icon-theme', 'symbols');
  await page.getByRole('button', { name: 'Assistant icon themes', exact: true }).click();
  await page.getByRole('button', { name: 'Preview animation' }).click();
  const sprite = page.getByRole('dialog').locator('.assistant-sprite').first();
  expect(await sprite.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Stop preview' })).toBeInViewport();
});

test('a request animates only its assistant and stops after failure', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/assistants/*/run', async (route) => {
    await pending;
    await route.fulfill({ status: 502, json: { error: 'Source temporarily unavailable' } });
  });
  await page.goto('/agents');
  await expect(page.locator('.agent-surface .is-working')).toHaveCount(0);
  await page.getByRole('button', { name: 'Request report', exact: true }).first().click();
  await expect(page.locator('.agent-surface .is-working')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Awaiting source…' })).toBeDisabled();
  release();
  await expect(page.getByRole('status')).toContainText('Source temporarily unavailable');
  await expect(page.locator('.agent-surface .is-working')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Request report', exact: true }).first()).toBeEnabled();
});

test('an empty status filter offers a return to existing assistants', async ({ page }) => {
  await page.goto('/agents');
  await page.getByRole('button', { name: 'unknown', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No unknown assistants' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all assistants' }).click();
  await expect(page.locator('.agent-surface').first()).toBeVisible();
});

test('empty report filters offer recovery', async ({ page }) => {
  await page.route('**/api/reports', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: (await response.json()).map((report: object) => ({ ...report, review: 'unreviewed' })) });
  });
  await page.goto('/reports');
  await page.getByRole('button', { name: 'disputed', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No reports in this view' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all reports' }).click();
  await expect(page.locator('.report-row').first()).toBeVisible();
});
