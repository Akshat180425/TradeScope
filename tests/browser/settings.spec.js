import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { navigate, snapshot } from './helpers.js';

test('registration, protected administration, session reload and logout', async ({
  page,
}, info) => {
  const email = `browser-${info.project.name}-${Date.now()}@example.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('browser-example-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Buy AAPL', exact: true })).toBeEnabled();
  expect((await page.request.get('/api/admin')).status()).toBe(403);
  execFileSync(process.execPath, ['scripts/admin.js', '--email', email], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      INVESTOGRAM_DATABASE: path.resolve('.local/browser-tests-platform.sqlite'),
    },
    windowsHide: true,
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Advance one minute', exact: true })).toBeEnabled();
  const before = await snapshot(page);
  await page.getByRole('button', { name: 'Advance one minute', exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page)).simulation.tick)
    .toBe(before.simulation.tick + 1);
  await navigate(page, 'Administration');
  await page.getByLabel('Simulated INR per USD').fill('85');
  await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).simulation.fxRate).toBe(85);
  await page.locator('.account-button').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true }).last()).toBeVisible();
  expect((await page.request.get('/api/state')).status()).toBe(401);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('browser-example-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.locator('.account-button')).toContainText('Administrator');
});
