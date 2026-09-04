import { STATIONS } from '../audio/Radio';
/** Title screen + pause overlay. */
export class Menu {
  el: HTMLDivElement;
  mode: 'title' | 'pause' = 'title';

  constructor(
    parent: HTMLElement,
    private actions: { newGame: () => void; continueGame: () => void; resetSave: () => void; resume: () => void; save: () => void; quit: () => void; hasSave: () => boolean; saveSummary: () => string | null; runStats: () => string | null; getSettings: () => { sensitivity: number; masterVolume: number; radioVolume: number; cutscenes: number; radioStation: number }; setSetting: (key: 'sensitivity' | 'masterVolume' | 'radioVolume' | 'cutscenes' | 'radioStation', value: number) => void },
  ) {
    this.el = document.createElement('div');
    this.el.id = 'menu';
    parent.appendChild(this.el);
    this.render();
  }

  show(mode: 'title' | 'pause'): void {
    this.mode = mode;
    this.render();
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  private render(): void {
    const hasSave = this.actions.hasSave();
    this.el.innerHTML = `
      <div class="stripe top"></div>
      <h1>SUNSET SYNDICATE</h1>
      <div class="sub">SOL PALMA, FLORIDA · 1996</div>
      <div class="runstats" style="display:none;font-family:var(--mono);font-size:13px;color:var(--cyan);letter-spacing:1px;margin-top:-18px;margin-bottom:6px"></div>
      <div class="buttons"></div>
      <div class="settings" style="display:none;min-width:360px;font-size:13px;color:#ddd;background:rgba(0,0,0,0.4);padding:12px 16px;border-radius:6px;border:1px solid #444"></div>
      <div class="howto" style="display:none;max-width:640px;font-size:13px;line-height:1.5;color:#ddd;background:rgba(0,0,0,0.4);padding:12px 16px;border-radius:6px;border:1px solid #444">
        <b style="color:#4ff2e8">THE LOOP</b> · Pager beeps → accept → buy supplies from Rico (docks) → PREP TABLE → PACKAGING → walk to the meeting spot → E to sell.<br/>
        <b style="color:#4ff2e8">CUSTOMERS</b> · They walk around their home zone and carry limited cash (more as you get closer). Miss the window and they wait 30 min at 30% off, then leave. Offer locked ones a free sample; sell to unlocked ones on the street. Better relationship = bigger orders, friends unlock.<br/>
        <b style="color:#4ff2e8">PRODUCTS</b> · Base + up to 3 modifiers (order matters). Name your products. Customers ask for the daily hot effect (+25%). Haggling (one try per order) unlocks after your second sale. News breaks twice a day.<br/>
        <b style="color:#4ff2e8">HEAT</b> · Cops who see a deal raise it. Break line of sight, go home, or rest. Clean hands survive a stop-and-search; contraband does not. Sprint has stamina — you cannot outrun a chase forever. Dumpsters in the alleys are hiding spots (E) — but only once the cop has lost sight of you.<br/>
        <b style="color:#4ff2e8">SCALE UP</b> · Pawn shop equipment → Dizzy the runner (motel) → Warehouse 7 (docks) → Marisol the worker (port) → Vince the dealer (arcade) → the '88 sedan (Rojas).<br/>
        <b style="color:#4ff2e8">KEYS</b> · E interact · TAB backpack · P pager · M map · N radio · B place equipment · F3 fps.
      </div>
      <div class="credits">
        <b>SUNSET SYNDICATE</b> — an original game. All products, businesses, people and the city of Sol Palma are fictional.<br/><br/>
        <b>THIRD-PARTY ASSETS (all CC0 1.0 / public domain, used with thanks)</b><br/>
        Sound effects, UI sounds, music jingles and car models: <b>Kenney</b> (kenney.nl) — Impact Sounds, RPG Audio, Interface Sounds, Casino Audio, Music Jingles, Car Kit.<br/>
        Radio music: <b>HoliznaCC0</b> — Back In The 80s, Night Driving, Retro Synths, City Lights, Night Life, Make Funk · <b>Komiku</b> — Sunset On The Beach, Beach · <b>Loyalty Freak Music</b> — Chillin' At The Club.<br/>
        SIGNAL ZERO and every other sound not listed above is synthesised in-game.<br/><br/>
        Full per-file table: public/assets/LICENSES.md in the repository.
      </div>
      <div class="controls">WASD move · MOUSE look · SHIFT sprint · SPACE jump<br/>E interact · TAB inventory · P pager · Y/X accept/decline page · M map · N radio · 1-8 select item · ESC pause<br/><br/><span style="color:#ff9a3c">All products in this game are fictional. Click to capture the mouse.</span></div>
      <div class="stripe bottom"></div>`;
    const btns = this.el.querySelector('.buttons') as HTMLElement;
    btns.style.display = 'flex';
    btns.style.flexDirection = 'column';
    btns.style.gap = '10px';
    btns.style.minWidth = '260px';
    const add = (label: string, fn: () => void, cls = 'big'): void => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      btns.appendChild(b);
    };
    const settingsEl = this.el.querySelector('.settings') as HTMLElement;
    const st = this.actions.getSettings();
    const slider = (label: string, key: 'sensitivity' | 'masterVolume' | 'radioVolume', min: number, max: number, step: number): void => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.gap = '12px';
      row.style.margin = '6px 0';
      const lbl = document.createElement('span');
      lbl.textContent = label;
      const val = document.createElement('span');
      val.style.minWidth = '40px';
      val.style.textAlign = 'right';
      val.textContent = st[key].toFixed(2);
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = String(min);
      inp.max = String(max);
      inp.step = String(step);
      inp.value = String(st[key]);
      inp.style.flex = '1';
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); val.textContent = v.toFixed(2); this.actions.setSetting(key, v); });
      row.append(lbl, inp, val);
      settingsEl.appendChild(row);
    };
    slider('Mouse sensitivity', 'sensitivity', 0.2, 3, 0.05);
    slider('Master volume', 'masterVolume', 0, 1, 0.05);
    slider('Radio volume', 'radioVolume', 0, 1, 0.05);
    const stRow = document.createElement('div');
    stRow.style.display = 'flex';
    stRow.style.justifyContent = 'space-between';
    stRow.style.alignItems = 'center';
    stRow.style.margin = '6px 0';
    const sel = document.createElement('select');
    sel.style.background = '#1a1026';
    sel.style.color = '#eee';
    sel.style.border = '1px solid #555';
    sel.style.padding = '2px 6px';
    STATIONS.forEach((station, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${station.name} ${station.freq}`;
      opt.selected = i === st.radioStation;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => this.actions.setSetting('radioStation', parseInt(sel.value, 10)));
    stRow.append('Radio station', sel);
    settingsEl.appendChild(stRow);
    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.margin = '6px 0';
    row.style.cursor = 'pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = st.cutscenes >= 0.5;
    cb.addEventListener('change', () => this.actions.setSetting('cutscenes', cb.checked ? 1 : 0));
    row.append('Cutscenes (intro, purchases, arrests)', cb);
    settingsEl.appendChild(row);
    const stats = this.mode === 'title' ? this.actions.saveSummary() : this.actions.runStats();
    const statsEl = this.el.querySelector('.runstats') as HTMLElement;
    if (stats) {
      statsEl.textContent = stats;
      statsEl.style.display = 'block';
    }
    if (this.mode === 'title') {
      if (hasSave) add('CONTINUE', this.actions.continueGame, 'big primary');
      add('NEW GAME', this.actions.newGame, hasSave ? 'big' : 'big primary');
      if (hasSave) add('RESET SAVE', () => { if (confirm('Delete your save?')) { this.actions.resetSave(); this.render(); } }, 'big');
      add('HOW TO PLAY', () => this.toggle('.howto'), 'big');
      add('SETTINGS', () => this.toggle('.settings'), 'big');
      add('CREDITS', () => this.toggle('.credits'), 'big');
    } else {
      add('RESUME', this.actions.resume, 'big primary');
      add('HOW TO PLAY', () => this.toggle('.howto'), 'big');
      add('SETTINGS', () => this.toggle('.settings'), 'big');
      add('CREDITS', () => this.toggle('.credits'), 'big');
      add('SAVE GAME', () => { this.actions.save(); }, 'big');
      add('QUIT TO TITLE', () => { this.actions.save(); this.actions.quit(); this.show('title'); }, 'big');
    }
  }

  /** Show one of the fold-out panels, hiding the others. */
  private toggle(sel: string): void {
    for (const other of ['.howto', '.settings', '.credits']) {
      const el = this.el.querySelector(other) as HTMLElement;
      if (other === sel) el.style.display = el.style.display === 'none' || !el.style.display ? 'block' : 'none';
      else el.style.display = 'none';
    }
  }
}
