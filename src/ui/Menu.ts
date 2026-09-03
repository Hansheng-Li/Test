/** Title screen + pause overlay. */
export class Menu {
  el: HTMLDivElement;
  mode: 'title' | 'pause' = 'title';

  constructor(
    parent: HTMLElement,
    private actions: { newGame: () => void; continueGame: () => void; resetSave: () => void; resume: () => void; save: () => void; hasSave: () => boolean; getSettings: () => { sensitivity: number; masterVolume: number; radioVolume: number }; setSetting: (key: 'sensitivity' | 'masterVolume' | 'radioVolume', value: number) => void },
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
      <div class="buttons"></div>
      <div class="settings" style="display:none;min-width:360px;font-size:13px;color:#ddd;background:rgba(0,0,0,0.4);padding:12px 16px;border-radius:6px;border:1px solid #444"></div>
      <div class="howto" style="display:none;max-width:640px;font-size:13px;line-height:1.5;color:#ddd;background:rgba(0,0,0,0.4);padding:12px 16px;border-radius:6px;border:1px solid #444">
        <b style="color:#4ff2e8">THE LOOP</b> · Pager beeps → accept → buy supplies from Rico (docks) → PREP TABLE → PACKAGING → walk to the meeting spot → E to sell.<br/>
        <b style="color:#4ff2e8">CUSTOMERS</b> · They walk around their home zone. Offer locked ones a free sample; sell to unlocked ones on the street. Better relationship = bigger orders, friends unlock.<br/>
        <b style="color:#4ff2e8">PRODUCTS</b> · Base + up to 3 modifiers (order matters). Name your products. Watch the daily hot effect (+25%).<br/>
        <b style="color:#4ff2e8">HEAT</b> · Cops who see a deal raise it. Break line of sight, go home, or rest. Clean hands survive a stop-and-search; contraband does not. Sprint has stamina — you cannot outrun a chase forever.<br/>
        <b style="color:#4ff2e8">SCALE UP</b> · Pawn shop equipment → Dizzy the runner (motel) → Warehouse 7 (docks) → Marisol the worker (port) → Vince the dealer (arcade) → the '88 sedan (Rojas).<br/>
        <b style="color:#4ff2e8">KEYS</b> · E interact · TAB backpack · P pager · M map · N walkman · B place equipment · F3 fps.
      </div>
      <div class="controls">WASD move · MOUSE look · SHIFT sprint · SPACE jump<br/>E interact · TAB inventory · P pager · Y/X accept/decline page · M map · N walkman · 1-8 select item · ESC pause<br/><br/><span style="color:#ff9a3c">All products in this game are fictional. Click to capture the mouse.</span></div>
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
    if (this.mode === 'title') {
      if (hasSave) add('CONTINUE', this.actions.continueGame, 'big primary');
      add('NEW GAME', this.actions.newGame, hasSave ? 'big' : 'big primary');
      if (hasSave) add('RESET SAVE', () => { if (confirm('Delete your save?')) { this.actions.resetSave(); this.render(); } }, 'big');
    } else {
      add('RESUME', this.actions.resume, 'big primary');
      add('HOW TO PLAY', () => { const h = this.el.querySelector('.howto') as HTMLElement; h.style.display = h.style.display === 'none' ? 'block' : 'none'; }, 'big');
      add('SETTINGS', () => { const h = this.el.querySelector('.settings') as HTMLElement; h.style.display = h.style.display === 'none' ? 'block' : 'none'; }, 'big');
      add('SAVE GAME', () => { this.actions.save(); }, 'big');
      add('QUIT TO TITLE', () => { this.actions.save(); this.show('title'); }, 'big');
    }
  }
}
