import { test, expect, Page } from '@playwright/test';

/**
 * Core-loop end-to-end test: starter box → prep → package → pager order → accept →
 * meet the customer → sell → cash + relationship. Drives the game through its
 * public API plus real key presses. Software-rendered browsers are slow, hence
 * the frame-based waits and the long timeout.
 */
test.setTimeout(240_000);

type G = {
  startNewGame(): void;
  input: { locked: boolean };
  state: { cash: number; inventory: ({ id: string; qty: number } | null)[]; orders: { id: number; status: string; customerId: string; price: number }[]; customers: Record<string, { relationship: number }>; flags: Record<string, boolean> };
  city: { objects: { kind: string; position: { x: number; y: number; z: number } }[] };
  player: { teleport(x: number, y: number, z: number, yaw: number): void; pitch: number };
  customers: Map<number, { position: { x: number; z: number } }>;
  orderTimer: number;
  openPanelId: string | null;
};

const frames = (page: Page, n: number) =>
  page.evaluate((n) => new Promise<void>((r) => { let k = 0; const step = () => (++k >= n ? r() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);

const faceObject = (page: Page, kind: string, back: number) =>
  page.evaluate(({ kind, back }) => {
    const g = (window as unknown as { game: G }).game;
    const o = g.city.objects.find((x) => x.kind === kind)!;
    const p = o.position;
    const px = p.x + back;
    const pz = p.z;
    g.player.teleport(px, 0.3, pz, Math.atan2(-(p.x - px), -(p.z - pz)));
    g.player.pitch = -0.35;
  }, { kind, back });

const inv = (page: Page) => page.evaluate(() => (window as unknown as { game: G }).game.state.inventory.filter(Boolean).map((s) => `${s!.id}x${s!.qty}`));

test('a new player can complete the first sale', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.click('#menu button:has-text("NEW GAME")');
  await page.evaluate(() => { const g = (window as unknown as { game: G }).game; g.input.locked = true; });
  await frames(page, 3);

  // starter box
  await faceObject(page, 'starter_box', 1.5);
  await frames(page, 3);
  await expect(page.locator('#prompt')).toContainText('STARTER BOX');
  await page.keyboard.press('KeyE');
  await frames(page, 3);
  expect(await inv(page)).toEqual(expect.arrayContaining(['pulp_sunsetx3', 'baggiesx6']));

  // prep table minigame
  await faceObject(page, 'prep_table', 1.4);
  await frames(page, 3);
  await page.keyboard.press('KeyE');
  await frames(page, 3);
  await expect(page.locator('#prep-panel')).toHaveClass(/open/);
  await page.click('#prep-panel button:has-text("Sunset Pulp")');
  await page.click('#prep-panel button:has-text("MAX")');
  await page.click('#prep-panel button:has-text("START MIXING")');
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Space');
    await frames(page, 2);
    await page.waitForTimeout(100);
    const done = await page.evaluate(() => (window as unknown as { game: G }).game.state.inventory.some((s) => s && s.id.startsWith('prod:')));
    if (done) break;
  }
  await frames(page, 2);
  expect(await inv(page)).toEqual(expect.arrayContaining(['prod:SUNSETx3']));
  const nameInput = page.locator('#prep-panel input[type=text]');
  if (await nameInput.count()) {
    await nameInput.fill('PALM PANIC');
    await page.click('#prep-panel button:has-text("NAME IT")');
  }
  await page.keyboard.press('Escape');
  await frames(page, 2);

  // packaging
  await faceObject(page, 'pack_table', 1.4);
  await frames(page, 3);
  await page.keyboard.press('KeyE');
  await frames(page, 3);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Space');
    for (let k = 0; k < 30; k++) {
      await frames(page, 2);
      await page.waitForTimeout(80);
      const n = await page.evaluate(() => { const s = (window as unknown as { game: G }).game.state.inventory.find((x) => x && x.id.startsWith('pkg:')); return s ? s.qty : 0; });
      if (n >= i + 1) break;
    }
  }
  expect(await inv(page)).toEqual(expect.arrayContaining(['pkg:SUNSETx3']));
  await page.keyboard.press('Escape');

  // pager order
  await page.evaluate(() => { (window as unknown as { game: G }).game.orderTimer = 0; });
  await frames(page, 6);
  const order = await page.evaluate(() => (window as unknown as { game: G }).game.state.orders[0]);
  expect(order.status).toBe('pending');
  expect(order.customerId).toBe('tasha');
  await page.keyboard.press('KeyP');
  await frames(page, 3);
  await page.click('#pager-panel button:has-text("ACCEPT")');
  await page.keyboard.press('Escape');
  await frames(page, 3);

  // walk (teleport) to the customer and sell
  await page.evaluate(() => {
    const g = (window as unknown as { game: G }).game;
    const c = Array.from(g.customers.values())[0];
    const px = c.position.x + 2;
    const pz = c.position.z + 0.5;
    g.player.teleport(px, 0.3, pz, Math.atan2(-(c.position.x - px), -(c.position.z - pz)));
    g.player.pitch = -0.1;
  });
  await frames(page, 4);
  await expect(page.locator('#prompt')).toContainText('SELL');
  const cashBefore = await page.evaluate(() => (window as unknown as { game: G }).game.state.cash);
  await page.keyboard.press('KeyE');
  await frames(page, 4);
  const after = await page.evaluate(() => { const g = (window as unknown as { game: G }).game; return { cash: g.state.cash, rel: g.state.customers.tasha.relationship, status: g.state.orders[0].status }; });
  expect(after.status).toBe('completed');
  expect(after.cash).toBe(cashBefore + order.price);
  expect(after.rel).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
