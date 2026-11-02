import { test, expect } from '@playwright/test';
import { openDemo, navigate, snapshot } from './helpers.js';

test.beforeEach(async ({ page }) => openDemo(page));

test('a daily loss breach automatically pauses new exposure and cannot be resumed early', async ({
  page,
}) => {
  await navigate(page, 'Risk center');
  await page.getByLabel('Daily loss limit (USD)').fill('1');
  await page.getByRole('button', { name: 'Save limits' }).click();
  await expect.poll(async () => (await snapshot(page)).risk.limits.dailyLossLimit).toBe(1);
  await navigate(page, 'Markets');
  await page.getByRole('button', { name: 'Buy AAPL', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).risk.lossLocked).toBe(true);
  await expect(page.locator('.risk-pause-banner')).toContainText('Daily loss limit reached');
  await navigate(page, 'Risk center');
  await expect(page.getByRole('button', { name: 'Resume trading', exact: true })).toBeDisabled();
  await page.getByLabel('Daily loss limit (USD)').fill('5000');
  await page.getByRole('button', { name: 'Save limits' }).click();
  await expect.poll(async () => (await snapshot(page)).risk.limits.dailyLossLimit).toBe(5000);
  await expect(page.getByRole('button', { name: 'Resume trading', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume trading', exact: true })).toBeDisabled();
});

test('private journal supports linked executions, search, edits and deletion', async ({
  page,
}, info) => {
  await page.getByRole('button', { name: 'Buy AAPL', exact: true }).click();
  await expect(page.getByText(/Order filled at/)).toBeVisible();
  const trade = (await snapshot(page)).activity[0];
  await navigate(page, 'Trading journal');
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Opening range review');
  await page.getByLabel('Strategy', { exact: true }).fill('Opening range');
  await page.getByLabel('Tags (comma-separated, up to 8)').fill('momentum, review');
  await page
    .getByLabel('Trade thesis and review')
    .fill('Entered after confirmation. Review the spread and fees.');
  await page.getByLabel('Linked execution').selectOption(trade.id);
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Opening range review' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Opening range review' })).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/journal-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByLabel('Search journal').fill('missing');
  await expect(page.getByRole('heading', { name: 'No matching journal entries' })).toBeVisible();
  await page.getByLabel('Search journal').fill('');
  await page.getByRole('button', { name: 'Edit Opening range review' }).click();
  await page.getByRole('combobox', { name: 'Review status', exact: true }).selectOption('reviewed');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Journal review status').selectOption('reviewed');
  await expect(page.locator('.journal-entry')).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete Opening range review' }).click();
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No journal entries yet' })).toBeVisible();
});

test('risk limits and pause states reach the order ticket and persist after reload', async ({
  page,
}, info) => {
  await navigate(page, 'Risk center');
  await page.getByLabel('Maximum shares per symbol', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Save limits' }).click();
  await expect.poll(async () => (await snapshot(page)).risk.limits.maxSharesPerSymbol).toBe(5);
  await navigate(page, 'Markets');
  await expect(page.getByRole('button', { name: 'Buy AAPL', exact: true })).toBeDisabled();
  await page.getByLabel('Quantity').fill('2');
  await expect(page.getByRole('button', { name: 'Buy AAPL', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Buy AAPL', exact: true }).click();
  await expect(page.getByText(/Order filled at/)).toBeVisible();
  await navigate(page, 'Risk center');
  await page.getByRole('button', { name: 'Pause new exposure' }).click();
  await expect(page.getByRole('heading', { name: 'New exposure paused' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'New exposure paused' })).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/risk-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await navigate(page, 'Markets');
  await page.getByRole('button', { name: 'Sell', exact: true }).click();
  await page.getByLabel('Quantity').fill('1');
  await expect(page.getByRole('button', { name: 'Sell AAPL', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Sell AAPL', exact: true }).click();
  await expect(page.getByText(/Order filled at/)).toBeVisible();
  await navigate(page, 'Risk center');
  await page.getByRole('button', { name: 'Resume trading', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trading active' })).toBeVisible();
});

test('FX conversion and new workspaces fit narrow and wide screens', async ({ page }) => {
  await navigate(page, 'Portfolio');
  await page.getByLabel('Conversion amount', { exact: true }).fill('100');
  const rate = (await snapshot(page)).simulation.fxRate;
  await expect(page.getByLabel('Converted amount')).toContainText(
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(100 * rate),
  );
  await page.getByRole('combobox', { name: 'From currency', exact: true }).selectOption('INR');
  await page.getByLabel('Conversion amount', { exact: true }).fill(String(rate));
  await expect(page.getByLabel('Converted amount')).toContainText('$1.00');
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    for (const view of ['Portfolio', 'Risk center', 'Trading journal']) {
      await navigate(page, view);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
    }
  }
});
