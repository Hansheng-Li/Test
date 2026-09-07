import { test, expect, Page } from '@playwright/test';

/**
 * Police end-to-end: a witnessed street deal pulls an officer over for a stop-and-search; clean
 * hands walk away, contraband means BUSTED and release at the station; and a chasing cop who can
 * see you refuses the dumpster trick until you break line of sight.
 */
test.setTimeout(240_000);

type Cop = { pstate: string; position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }; mesh: { position: { copy(v: unknown): void } }; noticeCooldown: number; faceToward(x: number, z: number): void; distanceTo(x: number, z: number): number };
type G = {
  startNewGame(): void;
  talkToWanderer(w: unknown): void;
  hideInDumpster(o: unknown): void;
  beginArrest(): void;
  settings: { cutscenes: number };
  input: { locked: boolean };
  running: boolean;
  arrested: boolean;
  arrestTimer: number;
  hiding: unknown;
  police: Cop[];
  wanderers: Map<string, { id?: string; customerId?: string; def?: { id: string }; position: { x: number; y: number; z: number } }>;
  city: { objects: { kind: string; position: { x: number; y: number; z: number } }[]; colliders: { lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number, steps?: number): boolean } };
  player: { teleport(x: number, y: number, z: number, yaw: number): void; position: { x: number; y: number; z: number }; pitch: number };
  state: { heat: number; cash: number; inventory: ({ id: string; qty: number } | null)[]; customers: Record<string, { relationship: number; lastOrderMinute: number; unlocked: boolean }>; recipes: Record<string, unknown>; stats: { arrests: number; sales: number }; flags: Record<string, boolean> };
};

const frames = (page: Page, n: number) =>
  page.evaluate((n) => new Promise<void>((r) => { let k = 0; const step = () => (++k >= n ? r() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
const game = (page: Page) => page.evaluate(() => { const g = (window as unknown as { game: G }).game; return { heat: Math.round(g.state.heat), cop: g.police[0].pstate, arrested: g.arrested, arrests: g.state.stats.arrests, cash: g.state.cash, hiding: !!g.hiding, pos: [Math.round(g.player.position.x), Math.round(g.player.position.z)], inv: g.state.inventory.filter(Boolean).length }; });

/** Put cop 0 at `dist` metres from the player with line of sight, in the given state. */
const placeCop = (page: Page, dist: number, pstate: string) =>
  page.evaluate(({ dist, pstate }) => {
    const g = (window as unknown as { game: G }).game;
    const cop = g.police[0];
    const px = g.player.position.x;
    const pz = g.player.position.z;
    for (let a = 0; a < 16; a++) {
      const cx = px + Math.cos((a * Math.PI) / 8) * dist;
      const cz = pz + Math.sin((a * Math.PI) / 8) * dist;
      if (g.city.colliders.lineOfSight(cx, 1.9, cz, px, 1.5, pz, 10)) {
        cop.position.set(cx, 0.3, cz);
        cop.mesh.position.copy(cop.position);
        cop.pstate = pstate;
        cop.noticeCooldown = 0;
        cop.faceToward(px, pz);
        return true;
      }
    }
    return false;
  }, { dist, pstate });

test('witnessed deal, stop-and-search, bust and the dumpster rule', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('sunset_syndicate_settings', JSON.stringify({ lang: 0 })));
  await page.goto('/');
  await expect(page.locator('#menu h1')).toHaveText('SUNSET SYNDICATE');
  await page.evaluate(() => {
    localStorage.clear();
    const g = (window as unknown as { game: G }).game;
    g.startNewGame();
    g.settings.cutscenes = 0;
    g.input.locked = true;
    g.state.flags.starterTaken = true;
    g.state.cash = 500;
    g.state.recipes['SUNSET'] = { key: 'SUNSET', base: 'SUNSET', mods: [], effects: ['ENERGY'], value: 24, defaultName: 'SUNSET' };
    g.state.inventory[0] = { id: 'pkg:SUNSET', qty: 6 };
  });
  await frames(page, 6);

  // 1. a street deal in front of an officer: heat lands above the search threshold and he comes over
  // whichever unlocked customer is out walking becomes the buyer
  const dealt = await page.evaluate(() => {
    const g = (window as unknown as { game: G }).game;
    const w = Array.from(g.wanderers.values()).find((x) => x.def && g.state.customers[x.def.id]?.unlocked);
    if (!w) return false;
    (window as unknown as { buyer: string }).buyer = w.def!.id;
    g.state.customers[w.def!.id].relationship = 20;
    g.state.customers[w.def!.id].lastOrderMinute = -9999;
    g.player.teleport(w.position.x + 1.5, 0.3, w.position.z, 0);
    return true;
  });
  expect(dealt).toBe(true);
  expect(await placeCop(page, 9, 'PATROL')).toBe(true);
  const sold = await page.evaluate(() => {
    const g = (window as unknown as { game: G }).game;
    const w = Array.from(g.wanderers.values()).find((x) => x.def?.id === (window as unknown as { buyer: string }).buyer)!;
    const before = g.state.stats.sales;
    g.talkToWanderer(w);
    return g.state.stats.sales > before;
  });
  expect(sold).toBe(true);
  let s = await game(page);
  expect(s.heat).toBeGreaterThanOrEqual(40);
  await frames(page, 12);
  s = await game(page);
  expect(['NOTICE', 'APPROACH']).toContain(s.cop);

  // 2. clean hands: drop the product, let him search, walk away free
  await page.evaluate(() => { const g = (window as unknown as { game: G }).game; g.state.inventory[0] = null; });
  await page.evaluate(() => { const g = (window as unknown as { game: G }).game; const cop = g.police[0]; cop.pstate = 'APPROACH'; cop.position.set(g.player.position.x + 1.5, 0.3, g.player.position.z); cop.mesh.position.copy(cop.position); });
  await frames(page, 40);
  s = await game(page);
  expect(s.arrested).toBe(false);
  expect(s.arrests).toBe(0);
  expect(s.cop).not.toBe('APPROACH');

  // 3. the dumpster rule: a chasing cop with line of sight refuses the hide; out of sight it works
  await page.evaluate(() => { const g = (window as unknown as { game: G }).game; const d = g.city.objects.find((o) => o.kind === 'dumpster')!; g.player.teleport(d.position.x + 1.5, 0.3, d.position.z, 0); g.state.heat = 90; });
  expect(await placeCop(page, 5, 'CHASE')).toBe(true);
  await page.evaluate(() => { const g = (window as unknown as { game: G }).game; g.hideInDumpster(g.city.objects.find((o) => o.kind === 'dumpster')!); });
  expect((await game(page)).hiding).toBe(false);
  await page.evaluate(() => { const g = (window as unknown as { game: G }).game; const cop = g.police[0]; cop.position.set(g.player.position.x + 40, 0.3, g.player.position.z + 40); cop.mesh.position.copy(cop.position); g.hideInDumpster(g.city.objects.find((o) => o.kind === 'dumpster')!); });
  expect((await game(page)).hiding).toBe(true);
  await page.keyboard.press('KeyE');
  await frames(page, 3);
  expect((await game(page)).hiding).toBe(false);

  // 4. caught holding: BUSTED, fine, confiscation, release in front of the station
  const cashBeforeBust = (await game(page)).cash;
  await page.evaluate(() => { const g = (window as unknown as { game: G }).game; g.state.inventory[0] = { id: 'pkg:SUNSET', qty: 3 }; g.beginArrest(); });
  await frames(page, 2);
  s = await game(page);
  expect(s.arrested).toBe(true);
  expect(s.arrests).toBe(1);
  expect(s.inv).toBe(0);
  expect(s.cash).toBeLessThan(cashBeforeBust);
  await page.evaluate(() => { (window as unknown as { game: G }).game.arrestTimer = 0.01; });
  await frames(page, 4);
  s = await game(page);
  expect(s.arrested).toBe(false);
  expect(s.pos).toEqual([70, -24]);
  expect(s.heat).toBe(0);
  expect(errors).toEqual([]);
});
