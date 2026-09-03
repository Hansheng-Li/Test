import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { resolveItem, countItem, looseProductsInInventory } from '../systems/InventorySystem';
import { previewPrep, prepDuration, packagingPerUnitSeconds, recipeDisplayName } from '../systems/ProductionSystem';
import { MODIFIER_IDS, BASE_SUPPLY_IDS } from '../data/items';
import { MAX_MODIFIERS, parseRecipeKey } from '../data/products';
import { workerNeeds } from '../systems/WorkerSystem';

/**
 * PREP TABLE: choose input + modifiers, run a short stir minigame, collect product.
 * The minigame is deliberately light: hit STIR while the needle is in the green zone
 * to shave time off the batch.
 */
export class PrepUI extends Panel {
  private input: string | null = null;
  private mods: string[] = [];
  private units = 1;
  private running = false;
  private remaining = 0;
  private total = 0;
  private needle = 0;
  private needleDir = 1;
  private zoneStart = 0.55;
  private hits = 0;
  private progressEl: HTMLElement | null = null;
  private needleEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private pendingName: string | null = null;

  constructor(parent: HTMLElement, private api: GameAPI) {
    super('prep-panel', 'PREP TABLE', parent);
  }

  open(): void {
    this.running = false;
    this.pendingName = null;
    if (this.input && countItem(this.api.state, this.input) === 0) this.input = null;
    super.open();
  }

  render(): void {
    const st = this.api.state;
    const body = this.body;
    body.innerHTML = '';
    if (this.pendingName) {
      const key = this.pendingName;
      body.innerHTML = `<h3>NEW PRODUCT CREATED</h3><div>${recipeDisplayName(st, key)} — <span class="desc" style="color:#aaa">${st.recipes[key]?.effects.join(' · ')}</span></div><p>Give it a street name. It will show up on pagers, in your backpack and in sale messages.</p>`;
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.maxLength = 24;
      inp.placeholder = 'e.g. PALM PANIC';
      inp.value = st.recipes[key]?.customName ?? '';
      body.appendChild(inp);
      const row = document.createElement('div');
      row.className = 'pager-btns';
      row.appendChild(this.button('NAME IT', () => { if (inp.value.trim()) this.api.nameRecipe(key, inp.value); this.pendingName = null; this.render(); }, 'primary'));
      row.appendChild(this.button('KEEP DEFAULT', () => { this.pendingName = null; this.render(); }));
      body.appendChild(row);
      setTimeout(() => inp.focus(), 0);
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { if (inp.value.trim()) this.api.nameRecipe(key, inp.value); this.pendingName = null; this.render(); } });
      return;
    }
    if (this.running) {
      body.innerHTML = `<h3>MIXING…</h3><div class="progress"><div></div></div><div class="sweet"><div class="zone" style="left:${this.zoneStart * 100}%;width:18%"></div><div class="needle"></div></div><p class="status"></p>`;
      this.progressEl = body.querySelector('.progress > div');
      this.needleEl = body.querySelector('.needle');
      this.statusEl = body.querySelector('.status');
      const b = this.button('STIR  [SPACE]', () => this.stir(), 'primary big');
      body.appendChild(b);
      return;
    }
    // --- setup screen
    const inputs: { id: string; label: string }[] = [];
    for (const id of BASE_SUPPLY_IDS) if (countItem(st, id) > 0) inputs.push({ id, label: `${resolveItem(st, id).name} x${countItem(st, id)}` });
    for (const p of looseProductsInInventory(st)) {
      const parsed = parseRecipeKey(p.key);
      if (parsed && parsed.mods.length < MAX_MODIFIERS) inputs.push({ id: p.id, label: `${resolveItem(st, p.id).name} x${p.qty} (refine)` });
    }
    const sec1 = document.createElement('div');
    sec1.innerHTML = '<h3>1. INPUT</h3>';
    if (inputs.length === 0) sec1.innerHTML += '<div style="color:#ffb3c1">You have no base supplies. Buy Sunset Pulp, Velvet Wax or Neon Gel from Rico at the container yard.</div>';
    const rowIn = document.createElement('div');
    rowIn.className = 'pager-btns';
    for (const it of inputs) {
      const b = this.button(it.label, () => { this.input = it.id; this.mods = []; this.render(); }, this.input === it.id ? 'primary' : '');
      rowIn.appendChild(b);
    }
    sec1.appendChild(rowIn);
    body.appendChild(sec1);
    const sec2 = document.createElement('div');
    sec2.innerHTML = '<h3>2. MODIFIERS (optional, order matters)</h3>';
    const rowMod = document.createElement('div');
    rowMod.className = 'pager-btns';
    for (const m of MODIFIER_IDS) {
      const have = countItem(st, m);
      const idx = this.mods.indexOf(m);
      const b = this.button(`${idx >= 0 ? idx + 1 + '. ' : ''}${resolveItem(st, m).name} x${have}`, () => {
        if (idx >= 0) this.mods.splice(idx, 1);
        else if (this.mods.length < 2) this.mods.push(m);
        this.render();
      }, idx >= 0 ? 'primary' : '');
      b.disabled = have === 0 || !this.input;
      rowMod.appendChild(b);
    }
    sec2.appendChild(rowMod);
    body.appendChild(sec2);
    const sec3 = document.createElement('div');
    sec3.innerHTML = '<h3>3. BATCH</h3>';
    const preview = this.input ? previewPrep(st, { inputItem: this.input, mods: this.mods, units: this.units }) : null;
    if (this.input) {
      let max = countItem(st, this.input);
      for (const m of this.mods) max = Math.min(max, countItem(st, m));
      this.units = Math.max(1, Math.min(this.units, max));
      const rowU = document.createElement('div');
      rowU.className = 'pager-btns';
      rowU.appendChild(this.button('-', () => { this.units = Math.max(1, this.units - 1); this.render(); }));
      const lbl = document.createElement('span');
      lbl.style.padding = '6px 10px';
      lbl.textContent = `${this.units} unit${this.units > 1 ? 's' : ''} (max ${max})`;
      rowU.appendChild(lbl);
      rowU.appendChild(this.button('+', () => { this.units = Math.min(max, this.units + 1); this.render(); }));
      rowU.appendChild(this.button('MAX', () => { this.units = max; this.render(); }));
      sec3.appendChild(rowU);
      if (preview?.ok && preview.recipe) {
        const r = preview.recipe;
        const known = st.recipes[r.key];
        const p = document.createElement('div');
        p.style.marginTop = '8px';
        p.innerHTML = `RESULT: <b style="color:#ff8fd8">${known?.customName ?? r.defaultName}</b> ${r.effects.map((e) => `<span class="tag effect">${e}</span>`).join('')} <span class="price">$${r.value}/unit</span>` +
          (known ? '' : ' <span class="tag" style="background:#3a3a1a;color:#ffd166">NEW RECIPE</span>') +
          `<div class="desc" style="color:#aaa">Takes ${prepDuration(st)}s${st.upgrades.includes('eq_mixer') ? ' · Turbo Mixer: +1 bonus unit' : ''}.</div>`;
        sec3.appendChild(p);
        const start = this.button('START MIXING', () => this.start(), 'primary big');
        start.style.marginTop = '8px';
        sec3.appendChild(start);
      } else if (preview && !preview.ok) {
        sec3.innerHTML += `<div style="color:#ffb3c1">${preview.reason === 'too_many_mods' ? 'Too many modifiers on this product.' : 'Cannot prep this.'}</div>`;
      }
    }
    body.appendChild(sec3);
    // --- worker assignment
    if (st.worker?.hired) {
      const w = st.worker;
      const sec4 = document.createElement('div');
      sec4.innerHTML = `<h3>WORKER · ${w.name.toUpperCase()} (${w.property})</h3>`;
      const info = document.createElement('div');
      info.className = 'desc';
      info.style.color = '#aaa';
      if (w.recipeKey) {
        const n = workerNeeds(st, w.property, w.recipeKey);
        const missing = n ? [!n.hasBase ? 'base supply' : '', !n.hasMods ? 'modifiers' : '', !n.hasBags ? 'baggies (will output loose product)' : ''].filter(Boolean) : [];
        info.innerHTML = `Making <b style="color:#ff8fd8">${recipeDisplayName(st, w.recipeKey)}</b> from ${w.property} storage · ${w.produced} units so far · progress ${Math.round(w.progress * 100)}%` + (missing.length ? `<br/><span style="color:#ffb3c1">Storage is missing: ${missing.join(', ')}</span>` : '');
      } else info.textContent = 'Not assigned. Pick a recipe below; Marisol pulls supplies from storage and puts packaged product back.';
      sec4.appendChild(info);
      const rowW = document.createElement('div');
      rowW.className = 'pager-btns';
      for (const r of Object.values(st.recipes)) {
        rowW.appendChild(this.button((r.customName ?? r.defaultName) + (w.recipeKey === r.key ? ' ✓' : ''), () => { this.api.assignWorker(r.key); this.render(); }, w.recipeKey === r.key ? 'primary' : 'cyan'));
      }
      if (w.recipeKey) rowW.appendChild(this.button('STOP', () => { this.api.assignWorker(null); this.render(); }));
      sec4.appendChild(rowW);
      body.appendChild(sec4);
    }
  }

  private start(): void {
    if (!this.input) return;
    this.total = prepDuration(this.api.state);
    this.remaining = this.total;
    this.hits = 0;
    this.needle = 0;
    this.needleDir = 1;
    this.running = true;
    this.api.sfx('mix');
    this.render();
  }

  private stir(): void {
    if (!this.running) return;
    const inZone = this.needle >= this.zoneStart && this.needle <= this.zoneStart + 0.18;
    if (inZone) {
      this.hits++;
      this.remaining = Math.max(0, this.remaining - 0.8);
      this.zoneStart = 0.15 + Math.random() * 0.6;
      this.api.sfx('click');
      const z = this.el.querySelector('.zone') as HTMLElement | null;
      if (z) z.style.left = this.zoneStart * 100 + '%';
      if (this.statusEl) this.statusEl.textContent = `Nice stir! (${this.hits})`;
    } else {
      this.api.sfx('error');
      if (this.statusEl) this.statusEl.textContent = 'Missed the zone.';
    }
  }

  onKey(code: string): boolean {
    if (this.running && code === 'Space') {
      this.stir();
      return true;
    }
    return false;
  }

  update(dt: number): void {
    if (!this.running) return;
    this.remaining -= dt;
    this.needle += this.needleDir * dt * 1.4;
    if (this.needle > 1) { this.needle = 1; this.needleDir = -1; }
    if (this.needle < 0) { this.needle = 0; this.needleDir = 1; }
    if (this.progressEl) this.progressEl.style.width = ((1 - this.remaining / this.total) * 100).toFixed(1) + '%';
    if (this.needleEl) this.needleEl.style.left = (this.needle * 100).toFixed(1) + '%';
    if (this.remaining <= 0) {
      this.running = false;
      const r = this.api.prep({ inputItem: this.input!, mods: this.mods, units: this.units });
      if (r.ok && r.recipe) {
        this.api.sfx('unlock');
        this.api.toast(`Prepped ${r.units}x ${recipeDisplayName(this.api.state, r.recipe.key)}${this.hits >= 2 ? ' · smooth batch!' : ''}`);
        const isNew = !this.api.state.recipes[r.recipe.key]?.customName;
        if (isNew) this.pendingName = r.recipe.key;
        if (countItem(this.api.state, this.input!) === 0) { this.input = null; this.mods = []; }
      } else {
        this.api.sfx('error');
        this.api.toast(r.reason === 'no_space' ? 'Backpack is full. Free a slot first.' : 'Prep failed: ' + (r.reason ?? 'unknown'), 'warn');
      }
      this.render();
    }
  }
}

/** PACKAGING TABLE: seal loose product into baggies one press at a time (or all at once with a Heat Sealer). */
export class PackUI extends Panel {
  private key: string | null = null;
  private cooldown = 0;
  private sealing = false;
  private queue = 0;

  constructor(parent: HTMLElement, private api: GameAPI) {
    super('pack-panel', 'PACKAGING TABLE', parent);
  }

  open(): void {
    this.sealing = false;
    this.queue = 0;
    super.open();
  }

  render(): void {
    const st = this.api.state;
    const body = this.body;
    body.innerHTML = '';
    const loose = looseProductsInInventory(st);
    const bags = countItem(st, 'baggies');
    body.innerHTML = `<div>BAGGIES: <b style="color:${bags > 0 ? '#ffd166' : '#ffb3c1'}">${bags}</b> <span class="desc" style="color:#999">(Quick Stop 24 sells them, $1 each)</span></div>`;
    if (loose.length === 0) {
      body.innerHTML += '<h3>NOTHING TO PACKAGE</h3><div style="color:#ffb3c1">Prep some product at the PREP TABLE first.</div>';
      return;
    }
    if (!this.key || !loose.find((l) => l.key === this.key)) this.key = loose[0].key;
    const sec = document.createElement('div');
    sec.innerHTML = '<h3>PRODUCT</h3>';
    const row = document.createElement('div');
    row.className = 'pager-btns';
    for (const l of loose) row.appendChild(this.button(`${resolveItem(st, l.id).name} x${l.qty}`, () => { this.key = l.key; this.render(); }, this.key === l.key ? 'primary' : ''));
    sec.appendChild(row);
    body.appendChild(sec);
    const have = loose.find((l) => l.key === this.key)!.qty;
    const can = Math.min(have, bags);
    const sec2 = document.createElement('div');
    sec2.innerHTML = `<h3>SEAL</h3><div>${can} unit${can === 1 ? '' : 's'} can be packaged now.${st.upgrades.includes('eq_sealer') ? ' Heat Sealer installed: whole batch in one go.' : ' Press SEAL once per unit.'}</div>`;
    const b = this.button(st.upgrades.includes('eq_sealer') ? `SEAL ALL (${can})  [SPACE]` : 'SEAL ONE  [SPACE]', () => this.seal(), 'primary big');
    b.disabled = can === 0;
    b.style.marginTop = '8px';
    sec2.appendChild(b);
    const prog = document.createElement('div');
    prog.className = 'progress';
    prog.style.marginTop = '8px';
    prog.innerHTML = '<div></div>';
    sec2.appendChild(prog);
    body.appendChild(sec2);
  }

  private seal(): void {
    if (!this.key || this.sealing) return;
    const st = this.api.state;
    const loose = looseProductsInInventory(st).find((l) => l.key === this.key);
    const can = Math.min(loose?.qty ?? 0, countItem(st, 'baggies'));
    if (can <= 0) { this.api.sfx('error'); return; }
    this.queue = st.upgrades.includes('eq_sealer') ? can : 1;
    this.sealing = true;
    this.cooldown = packagingPerUnitSeconds(st);
    this.api.sfx('seal');
  }

  onKey(code: string): boolean {
    if (code === 'Space') { this.seal(); return true; }
    return false;
  }

  update(dt: number): void {
    if (!this.sealing) return;
    this.cooldown -= dt;
    const bar = this.el.querySelector('.progress > div') as HTMLElement | null;
    if (bar) bar.style.width = ((1 - Math.max(0, this.cooldown) / packagingPerUnitSeconds(this.api.state)) * 100).toFixed(0) + '%';
    if (this.cooldown <= 0) {
      const r = this.api.packageProduct(this.key!, 1);
      if (!r.ok) {
        this.sealing = false;
        this.api.sfx('error');
        this.api.toast(r.reason === 'no_space' ? 'Backpack is full.' : 'Packaging failed.', 'warn');
        this.render();
        return;
      }
      this.queue--;
      if (this.queue > 0) {
        this.cooldown = packagingPerUnitSeconds(this.api.state);
        this.api.sfx('seal');
      } else {
        this.sealing = false;
        this.api.toast(`Packaged ${recipeDisplayName(this.api.state, this.key!)}.`);
        this.render();
      }
    }
  }
}
