import { test, expect } from '@playwright/test';
import { openDemo, navigate } from './helpers.js';

test('candles, line mode and portfolio charts render across viewport sizes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().includes('of chart should')) errors.push(m.text());
  });
  await openDemo(page);
  for (const width of [320, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(page.locator('.price-candle').first()).toBeVisible();
    const bounds = await page.locator('.price-candle').first().boundingBox();
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'Line chart', exact: true }).click();
  await expect(page.locator('.price-chart .recharts-line-curve')).toHaveAttribute('d', /.+/);
  await page.getByRole('button', { name: 'Buy AAPL', exact: true }).click();
  await expect(page.getByText(/Order filled at/)).toBeVisible();
  await navigate(page, 'Portfolio');
  await expect(page.locator('.performance-chart .recharts-area-curve')).toHaveAttribute('d', /.+/);
  expect(errors).toEqual([]);
});
