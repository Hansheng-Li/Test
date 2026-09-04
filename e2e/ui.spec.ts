import { test, expect, Page } from '@playwright/test';

/**
 * Front-end end-to-end: title screen and settings, the opening cutscene and its skip, the radio
 * cycle on N, every panel hotkey, pause / quit to title / continue with the run summary.
 */
test.setTimeout(240_000);

type G = {
  running: boolean;
  settings: { radioStation: number; cutscenes: number };
  cutscene: { active: boolean };
  audio: { radio: { playing: boolean; station: number; current: { name: string } } };
  input: { locked: boolean };
  openPanelId: string | null;
  menu: { visible: boolean; mode: string };
  state: { cash: number };
};

const frames = (page: Page, n: number) =>
  page.evaluate((n) => new Promise<void>((r) => { let k = 0; const step = () => (++k >= n ? r() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
const g = (page: Page) => page.evaluate(() => { const game = (window as unknown as { game: G }).game; return { running: game.running, cut: game.cutscene.active, radio: game.audio.radio.playing, station: game.audio.radio.current.name, panel: game.openPanelId, menu: game.menu.visible, mode: game.menu.mode }; });

test('title, settings, intro skip, radio, panels, pause and continue', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#menu h1')).toHaveText('SUNSET SYNDICATE');
  await expect(page.locator('#menu button:has-text("CONTINUE")')).toHaveCount(0);

  // settings fold-out: station picker and cutscene toggle persist
  await page.click('#menu button:has-text("SETTINGS")');
  await page.selectOption('#menu .settings select', '1');
  expect(await page.evaluate(() => (window as unknown as { game: G }).game.settings.radioStation)).toBe(1);
  await page.click('#menu button:has-text("CREDITS")');
  await expect(page.locator('#menu .credits')).toBeVisible();

  // new game: the flyover plays, any key skips it, HUD appears
  await page.click('#menu button:has-text("NEW GAME")');
  await expect(page.locator('#cutscene')).toHaveClass(/on/);
  await page.keyboard.press('Space');
  await expect(page.locator('#cutscene')).not.toHaveClass(/on/);
  await expect(page.locator('#hud-cash')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { game: G }).game.input.locked = true; });

  // radio: N turns the walkman on at the remembered station and cycles
  await page.keyboard.press('KeyN');
  await frames(page, 3);
  let s = await g(page);
  expect(s.radio).toBe(true);
  expect(s.station).toBe('THE WAVE');
  await expect(page.locator('#radio')).toHaveClass(/on/);
  await page.keyboard.press('KeyN');
  await frames(page, 3);
  expect((await g(page)).station).toBe('FUNK CITY');

  // panels open and close on their hotkeys
  for (const [key, id] of [['Tab', 'inventory-panel'], ['KeyP', 'pager-panel'], ['KeyM', 'map-panel']] as const) {
    await page.keyboard.press(key);
    await frames(page, 2);
    expect((await g(page)).panel).toBe(id);
    await page.keyboard.press('Escape');
    await frames(page, 2);
    expect((await g(page)).panel).toBeNull();
  }

  // pause, save, quit to title with a run summary, continue
  await page.keyboard.press('Escape');
  await frames(page, 2);
  s = await g(page);
  expect(s.menu && s.mode === 'pause').toBe(true);
  await expect(page.locator('#menu .runstats')).toContainText('DAY 1');
  await page.click('#menu button:has-text("SAVE GAME")');
  await page.click('#menu button:has-text("QUIT TO TITLE")');
  await frames(page, 2);
  s = await g(page);
  expect(s.running).toBe(false);
  expect(s.radio).toBe(false);
  await expect(page.locator('#menu button:has-text("CONTINUE")')).toHaveCount(1);
  await page.click('#menu button:has-text("CONTINUE")');
  await expect(page.locator('#hud-cash .val')).toHaveText('$80');
  expect((await g(page)).running).toBe(true);
  expect(errors).toEqual([]);
});
