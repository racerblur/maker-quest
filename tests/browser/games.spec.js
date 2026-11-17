import { test, expect } from '@playwright/test';
const suffix = process.env.TEST_BASE_URL ? '' : '?emulator';

test('Bot Battle builds, introduces the CPU, plays in a square arena and supports spectator mode', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/bot-battle.html' + suffix);
  await page.locator('#botName').fill('Staging Sparky');
  for (const weapon of ['spinner', 'flipper', 'ram']) {
    await page.locator(`[data-value="${weapon}"]`).click();
    await expect(page.locator(`[data-value="${weapon}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.locator('#start').click();
  await expect(page.locator('#matchup')).toBeVisible();
  await expect(page.locator('#matchPlayerName')).toContainText('Staging Sparky');
  await expect(page.locator('#matchCpuName')).not.toBeEmpty();
  await page.locator('#fightNow').click();
  await expect(page.locator('#battle')).toBeVisible();
  const box = await page.locator('#arena').boundingBox();
  expect(Math.abs(box.width - box.height)).toBeLessThan(2);
  await page.keyboard.down('w'); await page.keyboard.down('Space');
  await expect(page.locator('#timer')).not.toHaveText('TIME 60');
  await page.keyboard.up('w'); await page.keyboard.up('Space');
  await page.locator('#rebuild').click();
  await page.locator('#cpuMode').click();
  await page.locator('#start').click();
  await expect(page.locator('#matchup')).toBeVisible();
  await page.locator('#fightNow').click();
  await expect(page.locator('#battle')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/cpu-spectator/);
  expect(errors).toEqual([]);
});

test('Power Racing starts, accepts controls, uses battery and returns to its builder', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/power-racers.html' + suffix);
  await page.locator('summary').click();
  await page.locator('#name').fill('Staging Racer');
  await page.locator('#motor').selectOption('brushless');
  await page.locator('#start').click();
  await expect(page.locator('body')).toHaveClass(/playing/);
  await expect(page.locator('#status')).toContainText('Staging Racer');
  await page.keyboard.down('ArrowUp');
  await expect(page.locator('#batteryHud')).not.toHaveText('100%', { timeout: 10000 });
  await page.keyboard.up('ArrowUp'); await page.keyboard.down('ArrowDown');
  await expect(page.locator('[data-key="brake"]')).toBeVisible();
  await page.keyboard.up('ArrowDown'); await page.keyboard.down('r');
  await expect(page.locator('[data-key="reverse"]')).toBeVisible();
  await page.keyboard.up('r');
  await page.locator('#backToSetup').click();
  await expect(page.locator('body')).not.toHaveClass(/playing/);
  expect(errors).toEqual([]);
});

test('Google OAuth reaches the provider sign-in page (not a completed sign-in)', async ({ page }) => {
  test.skip(!process.env.TEST_BASE_URL, 'Real staging provider launch only');
  await page.goto('/staging/account.html');
  await expect(page.locator('#google')).toBeEnabled();
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#google').click();
  const popup = await popupPromise;
  await popup.waitForURL(url => url.hostname === 'accounts.google.com', { timeout: 30000 });
  await expect(popup.locator('body')).not.toContainText('Access blocked');
  await popup.close();
});
