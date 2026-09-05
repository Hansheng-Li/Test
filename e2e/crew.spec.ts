import { test, expect, Page } from '@playwright/test';

/**
 * Crew end-to-end: hire Dizzy at the motel and send him a pager order from storage; hire Vince
 * at the arcade, hand him stock and a customer through the dealer panel, let his corner sell,
 * and collect the cash. Time is advanced through the game clock; the runner trip is real-time.
 */
test.setTimeout(240_000);

type G = {
  startNewGame(): void;
  tryGenerateOrder(): void;
  acceptOrder(id: number): void;
  openPanel(id: string): void;
  closePanel(): void;
  settings: { cutscenes: number };
  input: { locked: boolean };
  clock: { totalMinutes: number };
  state: {
    cash: number;
    inventory: ({ id: string; qty: number } | null)[];
    storage: Record<string, { id: string; qty: number }[]>;
    orders: { id: number; status: string; customerId: string }[];
    customers: Record<string, { unlocked: boolean; relationship: number; lastOrderMinute: number }>;
    recipes: Record<string, unknown>;
    runner: { hired: boolean; activeOrderId: number | null; deliveries: number } | null;
    dealer: { hired: boolean; stock: { id: string; qty: number }[]; customers: string[]; cash: number; sales: number } | null;
    flags: Record<string, boolean>;
  };
  city: { objects: { kind: string; position: { x: number; y: number; z: number } }[] };
  player: { teleport(x: number, y: number, z: number, yaw: number): void; pitch: number };
};

const g = (page: Page) => page.evaluate(() => (window as unknown as { game: G }).game);
const frames = (page: Page, n: number) =>
  page.evaluate((n) => new Promise<void>((r) => { let k = 0; const step = () => (++k >= n ? r() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
const faceObject = (page: Page, kind: string, back: number, pitch = -0.1) =>
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

test('runner delivers from storage and the dealer sells from his corner', async ({ page }) => {
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
    game.state.recipes['SUNSET'] = { key: 'SUNSET', base: 'SUNSET', mods: [], effects: ['ENERGY'], value: 24, defaultName: 'SUNSET' };
    game.state.storage.safehouse = [{ id: 'pkg:SUNSET', qty: 20 }];
    for (const c of Object.values(game.state.customers)) c.lastOrderMinute = -9999;
  });
  await frames(page, 3);

  // ---- Dizzy: hire at the motel, then send a pager order from storage
  await faceObject(page, 'runner_contact', 2);
  await frames(page, 3);
  expect(await prompt(page)).toMatch(/dizzy/i);
  await pressE(page);
  await pressE(page);
  expect((await g(page)).state.runner?.hired).toBe(true);
  await page.evaluate(() => { const game = (window as unknown as { game: G }).game; game.tryGenerateOrder(); const o = game.state.orders.find((x) => x.status === 'pending')!; game.acceptOrder(o.id); game.openPanel('pager-panel'); });
  await frames(page, 2);
  await page.click('#pager-panel button:has-text("SEND RUNNER")');
  await frames(page, 2);
  await page.keyboard.press('Escape');
  let s = (await g(page)).state;
  expect(s.orders.some((o) => o.status === 'runner')).toBe(true);
  expect(s.storage.safehouse.find((x) => x.id === 'pkg:SUNSET')!.qty).toBeLessThan(20);
  const cashBefore = s.cash;
  // the trip is real-time (up to ~90 s) and physics dt is capped at 0.05 s a frame: skip to the last second so 40 frames always cover it
  // Dizzy's 1-in-20 mishap roll is pinned for the wait (the mishap itself is covered by the unit tests)
  await page.evaluate(() => { const w = window as unknown as { game: G & { state: { orders: { status: string; runnerProgress?: number }[] } }; __rand?: () => number }; w.__rand = Math.random; Math.random = () => 0.1; for (const o of w.game.state.orders) if (o.status === 'runner') o.runnerProgress = 0.99; });
  await frames(page, 40);
  await page.evaluate(() => { const w = window as unknown as { __rand?: () => number }; if (w.__rand) Math.random = w.__rand; });
  s = (await g(page)).state;
  expect(s.runner?.deliveries).toBeGreaterThanOrEqual(1);
  expect(s.cash).toBeGreaterThan(cashBefore);

  // ---- Vince: hire at the arcade, give stock and a customer, let the corner work, collect
  await faceObject(page, 'dealer_contact', 2);
  await frames(page, 3);
  expect(await prompt(page)).toMatch(/vince/i);
  await pressE(page);
  await pressE(page);
  expect((await g(page)).state.dealer?.hired).toBe(true);
  await page.evaluate(() => { const game = (window as unknown as { game: G }).game; game.state.inventory[0] = { id: 'pkg:SUNSET', qty: 8 }; game.state.customers.tasha.relationship = 10; game.openPanel('dealer-panel'); });
  await frames(page, 2);
  await page.click('#dealer-panel button:has-text("GIVE ALL")');
  await page.click('#dealer-panel button:has-text("ASSIGN")');
  await frames(page, 2);
  s = (await g(page)).state;
  expect(s.dealer?.stock.reduce((a, x) => a + x.qty, 0)).toBe(8);
  expect(s.dealer?.customers.length).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Escape');
  // three dealer rounds; Vince's coin flips are pinned so the round always sells (the odds are covered by the unit tests)
  await page.evaluate(() => { const w = window as unknown as { game: G; __rand?: () => number }; w.__rand = Math.random; Math.random = () => 0.1; w.game.clock.totalMinutes += 300; });
  await frames(page, 6);
  await page.evaluate(() => { const w = window as unknown as { __rand?: () => number }; if (w.__rand) Math.random = w.__rand; });
  s = (await g(page)).state;
  expect(s.dealer!.sales).toBeGreaterThanOrEqual(1);
  expect(s.dealer!.cash).toBeGreaterThan(0);
  const held = s.dealer!.cash;
  const before = s.cash;
  await page.evaluate(() => (window as unknown as { game: G }).game.openPanel('dealer-panel'));
  await frames(page, 2);
  await page.click('#dealer-panel button:has-text("COLLECT")');
  await frames(page, 2);
  s = (await g(page)).state;
  expect(s.dealer!.cash).toBe(0);
  expect(Math.round(s.cash - before)).toBe(Math.round(held));
  expect(errors).toEqual([]);
});
