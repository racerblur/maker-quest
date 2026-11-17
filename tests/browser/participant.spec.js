import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const suffix = process.env.TEST_BASE_URL ? '' : '?emulator';

test('guest passport survives refresh and relaunch, resets, and stays isolated on logout', async ({ browser }) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: process.env.TEST_IGNORE_HTTPS_ERRORS === 'true', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`/staging/account.html${suffix}`);
  await expect(page.getByRole('button', { name: 'Continue as guest' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await expect(page.locator('#account-status')).toContainText('Signed in as a guest');
  await expect(page.locator('#save-name')).toBeEnabled();
  await page.locator('#display-name').fill('Sparky');
  await page.locator('#save-name').click();
  await expect(page.locator('#save-status')).toContainText('Display name saved');
  await page.goto(`/companion.html${suffix}`);
  await expect(page.locator('#toast')).toContainText('Passport synced');
  await page.locator('#mapClaim').click();
  await expect(page.locator('#toast')).toContainText(/saved|synced/);
  await expect(page.locator('#progress')).toHaveText('1 / 4 badges');
  await page.reload();
  await expect(page.locator('#toast')).toContainText('Passport synced');
  await expect(page.locator('#progress')).toHaveText('1 / 4 badges');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Export IndexedDB auth storage, close the context, and restore it. This tests
  // persisted browser state; a physical browser restart is a separate check.
  const storageState = await context.storageState({ indexedDB: true });
  await context.close();
  const second = await browser.newContext({ storageState, ignoreHTTPSErrors: process.env.TEST_IGNORE_HTTPS_ERRORS === 'true', viewport: { width: 390, height: 844 } });
  const restored = await second.newPage();
  await restored.goto(`/staging/account.html${suffix}`);
  await expect(restored.locator('#save-name')).toBeEnabled();
  await expect(restored.locator('#display-name')).toHaveValue('Sparky');
  await expect(restored.locator('#demo-badges')).toContainText('✓ robotics');
  await restored.goto(`/companion.html${suffix}`);
  await expect(restored.locator('#toast')).toContainText('Passport synced');
  await restored.getByRole('button', { name: '🎟️ Passport' }).click();
  restored.once('dialog', dialog => dialog.accept());
  await restored.locator('#reset').click();
  await expect(restored.locator('#progress')).toHaveText('0 / 4 badges');
  await expect(restored.locator('#toast')).toContainText(/saved|synced/);
  await restored.goto(`/staging/account.html${suffix}`);
  await expect(restored.locator('#save-name')).toBeEnabled();
  restored.once('dialog', dialog => dialog.accept());
  await restored.locator('#logout').click();
  await expect(restored.locator('#account-status')).toContainText('Signed out');
  await restored.locator('#guest').click();
  await expect(restored.locator('#save-name')).toBeEnabled();
  await expect(restored.locator('#display-name')).toHaveValue('Maker');
  await expect(restored.locator('#demo-badges')).not.toContainText('✓');
  await second.close();
});

test('staging pages load at mobile width without script errors', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/', '/companion.html', '/bot-battle.html', '/power-racers.html']) {
    await page.goto(path + suffix);
    await expect(page.locator('#staging-account')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('guest session persists after closing and restarting the Chromium process', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'maker-quest-session-'));
  const options = { headless: true,
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:4173',
    ignoreHTTPSErrors: process.env.TEST_IGNORE_HTTPS_ERRORS === 'true' };
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, options);
    let page = context.pages()[0];
    await page.goto(`/staging/account.html${suffix}`);
    await expect(page.locator('#guest')).toBeEnabled(); await page.locator('#guest').click();
    await expect(page.locator('#save-name')).toBeEnabled();
    await page.locator('#display-name').fill('Restart Maker'); await page.locator('#save-name').click();
    await expect(page.locator('#save-status')).toContainText('Display name saved');
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = context.pages()[0]; await page.goto(`/staging/account.html${suffix}`);
    await expect(page.locator('#save-name')).toBeEnabled();
    await expect(page.locator('#account-status')).toContainText('Signed in as a guest');
    await expect(page.locator('#display-name')).toHaveValue('Restart Maker');
  } finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
});
