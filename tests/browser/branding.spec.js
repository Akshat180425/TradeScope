import { test, expect } from '@playwright/test';
import { openDemo } from './helpers.js';

test('TradeScope branding is visible on authentication and the trading workspace', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page).toHaveTitle('TradeScope | Trading workspace');
  await expect(page.locator('.auth-header .brand')).toContainText('TradeScope');
  await expect(page.locator('body')).not.toContainText(/investogram/i);
  await page.screenshot({
    path: `docs/screenshots/auth-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await openDemo(page);
  await expect(page.locator('body')).toContainText('TradeScope');
  await expect(page.locator('body')).not.toContainText(/investogram/i);
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === 'tradescope_session')).toBe(true);
});
