import { test, expect } from '@playwright/test';

/** Smoke test: the game boots, a new game shows the HUD, and no uncaught errors occur. */
test('game loads, HUD appears, no startup errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await expect(page.locator('#menu h1')).toHaveText('SUNSET SYNDICATE');
  await page.click('#menu button:has-text("NEW GAME")');
  // the opening flyover plays; any key skips it
  await expect(page.locator('#cutscene')).toHaveClass(/on/);
  await page.keyboard.press('Space');
  await expect(page.locator('#cutscene')).not.toHaveClass(/on/);
  await expect(page.locator('#hud-cash')).toBeVisible();
  await expect(page.locator('#hud-cash .val')).toHaveText('$80');
  await expect(page.locator('#hud-objective .text')).toContainText('STARTER BOX');
  // let a couple of seconds of simulation run
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => {
    const g = (window as unknown as { game: { state: { cash: number }; running: boolean; fps: number } }).game;
    return { cash: g.state.cash, running: g.running };
  });
  expect(state.running).toBe(true);
  expect(state.cash).toBe(80);
  expect(errors).toEqual([]);
});
