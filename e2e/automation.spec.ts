import { test, expect, Page } from '@playwright/test';

/**
 * Automation end-to-end: buy Warehouse 7 at its sign, place a prep-station kit inside,
 * hire Marisol, assign her a named recipe at the placed table, and watch her turn
 * warehouse supplies into packaged product that survives a save/reload.
 */
test.setTimeout(240_000);

type G = {
  startNewGame(): void;
  continueGame(): void;
  save(): void;
  buy(shop: string, item: string, qty: number): unknown;
  settings: { cutscenes: number };
  input: { locked: boolean };
  state: {
    cash: number;
    properties: string[];
    placedStations: { kind: string }[];
    inventory: ({ id: string; qty: number } | null)[];
    storage: Record<string, { id: string; qty: number }[]>;
    worker: { hired: boolean; recipeKey: string | null; produced: number; progress: number } | null;
    recipes: Record<string, unknown>;
    flags: Record<string, boolean>;
  };
  city: { objects: { kind: string; position: { x: number; y: number; z: number } }[] };
  placedObjects: { kind: string; position: { x: number; z: number } }[];
  player: { teleport(x: number, y: number, z: number, yaw: number): void; pitch: number };
};

const g = (page: Page) => page.evaluate(() => (window as unknown as { game: G }).game);
const frames = (page: Page, n: number) =>
  page.evaluate((n) => new Promise<void>((r) => { let k = 0; const step = () => (++k >= n ? r() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
const faceObject = (page: Page, kind: string, back: number, pitch = -0.35) =>
  page.evaluate(({ kind, back, pitch }) => {
    const game = (window as unknown as { game: G }).game;
    const o = game.city.objects.find((x) => x.kind === kind)!;
    const px = o.position.x + back;
    const pz = o.position.z;
    game.player.teleport(px, 0.3, pz, Math.atan2(-(o.position.x - px), -(o.position.z - pz)));
    game.player.pitch = pitch;
  }, { kind, back, pitch });
const pressE = async (page: Page) => { await frames(page, 2); await page.keyboard.press('KeyE'); await frames(page, 3); };
const prompt = (page: Page) => page.evaluate(() => { const p = document.getElementById('prompt')!; return p.style.display === 'none' ? '' : p.textContent ?? ''; });

test('warehouse, placed station and worker produce packaged product', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('sunset_syndicate_settings', JSON.stringify({ lang: 0 })));
  await page.goto('/');
  await expect(page.locator('#menu h1')).toHaveText('SUNSET SYNDICATE');
  await page.evaluate(() => {
    localStorage.clear();
    const game = (window as unknown as { game: G }).game;
    game.startNewGame();
    game.settings.cutscenes = 0;
    game.input.locked = true;
    game.state.flags.starterTaken = true;
    game.state.cash = 5000;
  });
  await frames(page, 3);

  // buy the warehouse at its FOR SALE sign (two presses: ask, confirm)
  await faceObject(page, 'warehouse_sign', 2.5, -0.05);
  await frames(page, 3);
  expect(await prompt(page)).toMatch(/warehouse/i);
  await pressE(page);
  await pressE(page);
  expect((await g(page)).state.properties).toContain('warehouse');

  // kits from the pawn shop, then placement mode inside
  await page.evaluate(() => { const game = (window as unknown as { game: G }).game; game.buy('pawn', 'prep_station_kit', 1); game.buy('pawn', 'shelf_kit', 1); });
  await page.evaluate(() => {
    const game = (window as unknown as { game: G }).game;
    const a = game.city.objects.find((o) => o.kind === 'placement_area')!;
    game.player.teleport(a.position.x - 6, 0.3, a.position.z + 4, -Math.PI / 2 + 0.3);
    game.player.pitch = -0.5;
  });
  await frames(page, 3);
  await page.keyboard.press('KeyB');
  await frames(page, 4);
  expect(await prompt(page)).toContain('PLACE');
  await page.mouse.click(640, 360);
  await frames(page, 3);
  expect((await g(page)).state.placedStations.map((s) => s.kind)).toEqual(['prep_table']);

  // hire Marisol at the port
  await faceObject(page, 'worker_contact', 2, -0.1);
  await frames(page, 3);
  expect(await prompt(page)).toMatch(/marisol/i);
  await pressE(page);
  await pressE(page);
  expect((await g(page)).state.worker?.hired).toBe(true);

  // stock the shelves, assign a named recipe at the placed table
  await page.evaluate(() => {
    const game = (window as unknown as { game: G }).game;
    game.state.storage.warehouse = [{ id: 'pulp_sunset', qty: 4 }, { id: 'mod_flux', qty: 4 }, { id: 'baggies', qty: 10 }];
    game.state.recipes['SUNSET+mod_flux'] = { key: 'SUNSET+mod_flux', base: 'SUNSET', mods: ['mod_flux'], effects: ['ENERGY'], value: 30, defaultName: 'SUNSET', customName: 'BEACH BOLT' };
    const o = game.placedObjects.find((x) => x.kind === 'prep_table')!;
    game.player.teleport(o.position.x + 1.6, 0.3, o.position.z, Math.PI / 2);
    game.player.pitch = -0.3;
  });
  await frames(page, 3);
  expect(await prompt(page)).toMatch(/prep/i);
  await pressE(page);
  await page.click('#prep-panel button:has-text("BEACH BOLT")');
  await frames(page, 2);
  await page.keyboard.press('Escape');
  expect((await g(page)).state.worker?.recipeKey).toBe('SUNSET+mod_flux');

  // she finishes a unit: base + modifier + baggie consumed, one packaged unit on the shelf
  await page.evaluate(() => { (window as unknown as { game: G }).game.state.worker!.progress = 0.99; });
  await frames(page, 30);
  const after = (await g(page)).state;
  expect(after.worker?.produced).toBeGreaterThanOrEqual(1);
  expect(after.storage.warehouse.find((s) => s.id === 'pkg:SUNSET+mod_flux')?.qty).toBeGreaterThanOrEqual(1);
  expect(after.storage.warehouse.find((s) => s.id === 'pulp_sunset')?.qty).toBeLessThan(4);

  // everything survives a save and reload
  await page.evaluate(() => (window as unknown as { game: G }).game.save());
  await page.reload();
  await expect(page.locator('#menu h1')).toHaveText('SUNSET SYNDICATE');
  await page.evaluate(() => { const game = (window as unknown as { game: G }).game; game.continueGame(); game.input.locked = true; });
  await frames(page, 3);
  const loaded = (await g(page)).state;
  expect(loaded.properties).toContain('warehouse');
  expect(loaded.placedStations.map((s) => s.kind)).toEqual(['prep_table']);
  expect(loaded.worker?.recipeKey).toBe('SUNSET+mod_flux');
  expect(loaded.storage.warehouse.find((s) => s.id === 'pkg:SUNSET+mod_flux')?.qty).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
