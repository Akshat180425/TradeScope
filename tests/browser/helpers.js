import { expect } from '@playwright/test';
export async function openDemo(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open demo workspace' }).click();
  await expect(page.getByRole('button', { name: 'Buy AAPL', exact: true })).toBeEnabled();
}
export async function navigate(page, name) {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}
export async function snapshot(page) {
  return (await page.request.get('/api/state')).json();
}
