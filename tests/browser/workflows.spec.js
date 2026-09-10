import { test, expect } from '@playwright/test';
import { openDemo, navigate, snapshot } from './helpers.js';

test.beforeEach(async ({ page }) => openDemo(page));

test('market search, buying, order details, portfolio and transaction exports', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('textbox', { name: 'Search instruments' }).fill('micro');
  await page.getByRole('button', { name: 'Select Microsoft' }).click();
  await page.getByRole('button', { name: 'Buy MSFT', exact: true }).click();
  await expect(page.getByText(/Order filled at/)).toBeVisible();
  const state = await snapshot(page);
  expect(state.portfolio.holdings.find((h) => h.symbol === 'MSFT').quantity).toBe(10);
  expect(state.portfolio.feesPaid).toBeGreaterThan(0);
  await navigate(page, 'Orders');
  await page.getByRole('button', { name: 'View order ' + state.orders[0].id }).click();
  await expect(page.getByRole('heading', { name: 'Order lifecycle' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Fees paid')).toBeVisible();
  await page.keyboard.press('Escape');
  await navigate(page, 'Portfolio');
  await expect(page.getByRole('heading', { name: 'Portfolio performance' })).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/portfolio-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await navigate(page, 'Activity');
  await page.getByRole('button', { name: 'Cash ledger', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'trading fee', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('investogram-ledger.csv');
  expect(errors).toEqual([]);
});

test('limit and stop orders reserve cash and can be cancelled', async ({ page }) => {
  await page.getByLabel('Order type').selectOption('stop_limit');
  await page.getByLabel('Stop price (USD)').fill('900');
  await page.getByLabel('Limit price (USD)').fill('910');
  await page.getByLabel('Quantity').fill('2');
  await page.getByLabel('Time in force').selectOption('day');
  await page.getByRole('button', { name: 'Buy AAPL', exact: true }).click();
  await expect(page.getByText('Stop order accepted. Waiting for trigger.')).toBeVisible();
  expect((await snapshot(page)).portfolio.reservedCash).toBeGreaterThan(1820);
  await navigate(page, 'Orders');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('waiting');
  await page.getByRole('button', { name: /Cancel order O/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel order', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching orders' })).toBeVisible();
  expect((await snapshot(page)).portfolio.reservedCash).toBe(0);
});

test('futures and options show margin, expiries and closing records', async ({ page }, info) => {
  await navigate(page, 'Futures & Options');
  await page.getByRole('button', { name: 'Open long AAPL', exact: true }).click();
  await expect(page.locator('.positions-section tbody tr')).toHaveCount(1);
  await expect(page.locator('.positions-section tbody')).toContainText('liquidation');
  await page.getByRole('button', { name: 'Options', exact: true }).click();
  await page.getByRole('button', { name: 'Put', exact: true }).click();
  await page.getByRole('button', { name: 'Buy put AAPL', exact: true }).click();
  await expect(page.locator('.positions-section tbody tr')).toHaveCount(1);
  await page.screenshot({
    path: `docs/screenshots/derivatives-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close position', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'No open options positions' })).toBeVisible();
  expect((await snapshot(page)).portfolio.positions).toHaveLength(1);
});

test('watchlists and currency preferences survive reload; alerts remain private', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add AMZN to watchlist' }).click();
  await expect(page.getByRole('button', { name: 'Remove AMZN from watchlist' })).toBeVisible();
  await page.getByLabel('Display currency').selectOption('INR');
  await expect(page.locator('.fx-disclosure')).toContainText('Orders and cash settle in USD');
  await page.reload();
  await expect(page.getByLabel('Display currency')).toHaveValue('INR');
  await expect(page.getByRole('button', { name: 'Remove AMZN from watchlist' })).toBeVisible();
  await navigate(page, 'Price alerts');
  await page.getByLabel('Target price (USD)').fill('900');
  await page.getByRole('button', { name: 'Create alert', exact: true }).click();
  await expect(page.locator('.alerts-list tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: /Remove alert A/ }).click();
  await expect(page.getByRole('heading', { name: 'No price alerts' })).toBeVisible();
});

test('virtual funding is excluded from portfolio return', async ({ page }) => {
  await navigate(page, 'Portfolio');
  await page.getByRole('button', { name: 'Virtual funding', exact: true }).click();
  await page.getByLabel('Amount (USD)').fill('5000');
  await page.getByRole('button', { name: 'Confirm virtual deposit', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const state = await snapshot(page);
  expect(state.portfolio.cash).toBe(105000);
  expect(state.performance.returnPercent).toBe(0);
  expect(state.portfolio.pnl).toBe(0);
});

test('all views fit and the connection error can recover', async ({ page }, info) => {
  for (const view of [
    'Markets',
    'Futures & Options',
    'Portfolio',
    'Orders',
    'Activity',
    'Price alerts',
  ]) {
    await navigate(page, view);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await navigate(page, 'Markets');
  await expect(page.getByRole('button', { name: 'Buy AAPL', exact: true })).toBeEnabled();
  await page.screenshot({
    path: `docs/screenshots/markets-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.route('**/api/state?**', (route) => route.abort());
  await page.getByRole('button', { name: 'Select Microsoft' }).click();
  await expect(page.getByRole('alert')).toContainText('Backend unavailable');
  await page.unroute('**/api/state?**');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
