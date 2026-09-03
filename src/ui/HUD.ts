import { GameState } from '../game/GameState';
import { resolveItem } from '../systems/InventorySystem';
import { heatLevel } from '../systems/HeatSystem';
import { ToastKind } from './UIContext';

/** Always-visible HUD: cash, clock, heat, objective, order, hotbar, prompt, toasts. */
export class HUD {
  root: HTMLDivElement;
  private cashEl: HTMLElement;
  private clockEl: HTMLElement;
  private heatBar: HTMLElement;
  private heatLabel: HTMLElement;
  private staminaBar: HTMLElement;
  private staminaWrap: HTMLElement;
  stamina = 1;
  hiddenMode = false;
  arrestMode = false;
  private objectiveEl: HTMLElement;
  private orderEl: HTMLElement;
  private orderBody: HTMLElement;
  private slotsEl: HTMLElement;
  private promptEl: HTMLElement;
  private toastsEl: HTMLElement;
  private pagerEl: HTMLElement;
  private pagerScreen: HTMLElement;
  private vignette: HTMLElement;
  private lastCash = NaN;
  private lastObjective = '';
  private lastOrder: string | null = '';
  private lastClock = '';
  private pagerTimer = 0;
  selectedSlot = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div id="hud-cash" class="hud-box"><small>CASH</small><span class="val">$0</span></div>
      <div id="hud-clock" class="hud-box">DAY 1 · 15:30</div>
      <div id="hud-heat" class="hud-box"><div class="label"><span>HEAT</span><span class="lvl">CALM</span></div><div class="bar"><div></div></div><div class="stamina"><div></div></div></div>
      <div id="hud-objective" class="hud-box"><div class="title">OBJECTIVE</div><div class="text"></div></div>
      <div id="hud-order" class="hud-box"><div class="title">CURRENT ORDER</div><div class="obody"></div></div>
      <div id="hud-item" class="hud-box"></div>
      <div id="crosshair"></div>
      <div id="prompt"></div>
      <div id="toasts"></div>
      <div id="pager-notify"><div class="screen"></div><div class="hint">[Y] ACCEPT · [X] DECLINE · [P] PAGER</div></div>
      <div id="vignette"></div>
      <div id="clickhint" style="display:none;position:absolute;left:50%;top:62%;transform:translateX(-50%);background:var(--panel);border:2px solid var(--cyan);padding:10px 18px;border-radius:6px;font-size:16px;letter-spacing:1px">CLICK TO CAPTURE THE MOUSE</div>`;
    parent.appendChild(this.root);
    this.cashEl = this.root.querySelector('#hud-cash .val')!;
    this.clockEl = this.root.querySelector('#hud-clock')!;
    this.heatBar = this.root.querySelector('#hud-heat .bar > div')!;
    this.heatLabel = this.root.querySelector('#hud-heat .lvl')!;
    this.staminaBar = this.root.querySelector('#hud-heat .stamina > div')!;
    this.staminaWrap = this.root.querySelector('#hud-heat .stamina')!;
    this.objectiveEl = this.root.querySelector('#hud-objective .text')!;
    this.orderEl = this.root.querySelector('#hud-order')!;
    this.orderBody = this.root.querySelector('#hud-order .obody')!;
    this.slotsEl = this.root.querySelector('#hud-item')!;
    this.promptEl = this.root.querySelector('#prompt')!;
    this.toastsEl = this.root.querySelector('#toasts')!;
    this.pagerEl = this.root.querySelector('#pager-notify')!;
    this.pagerScreen = this.root.querySelector('#pager-notify .screen')!;
    this.vignette = this.root.querySelector('#vignette')!;
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = `<span class="key">${i + 1}</span><span class="name"></span><span class="qty"></span>`;
      this.slotsEl.appendChild(s);
    }
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? 'block' : 'none';
  }

  hidden = false;
  toggleHidden(): void {
    this.hidden = !this.hidden;
    for (const c of Array.from(this.root.children) as HTMLElement[]) if (c.id !== 'clickhint') c.style.visibility = this.hidden ? 'hidden' : 'visible';
  }

  setClickHint(on: boolean): void {
    const el = this.root.querySelector('#clickhint') as HTMLElement;
    el.style.display = on ? 'block' : 'none';
  }

  speedText: string | null = null;

  update(state: GameState, clockText: string, day: number, objective: string, orderText: string | null, dt: number): void {
    if (state.cash !== this.lastCash) {
      this.cashEl.textContent = '$' + Math.floor(state.cash).toLocaleString();
      this.lastCash = state.cash;
    }
    const clockStr = `DAY ${day} · ${clockText}` + (this.speedText ? ` · ${this.speedText}` : '');
    if (clockStr !== this.lastClock) {
      this.clockEl.textContent = clockStr;
      this.lastClock = clockStr;
    }
    this.heatBar.style.width = state.heat.toFixed(0) + '%';
    this.heatLabel.textContent = heatLevel(state.heat).toUpperCase() + (state.suspicion > 30 ? ' · KNOWN' : '');
    this.vignette.className = this.arrestMode ? 'arrest' : this.hiddenMode ? 'hidden' : state.heat >= 60 ? 'hot' : '';
    this.staminaWrap.style.display = this.stamina < 0.999 ? 'block' : 'none';
    this.staminaBar.style.width = (this.stamina * 100).toFixed(0) + '%';
    this.staminaBar.style.background = this.stamina < 0.3 ? '#ff5c5c' : '#7fdcff';
    if (objective !== this.lastObjective) {
      this.objectiveEl.textContent = objective;
      this.lastObjective = objective;
    }
    if (orderText !== this.lastOrder) {
      this.lastOrder = orderText;
      if (orderText) {
        this.orderEl.style.display = 'block';
        this.orderBody.innerHTML = orderText;
      } else this.orderEl.style.display = 'none';
    }
    // hotbar
    const slots = this.slotsEl.children;
    for (let i = 0; i < 8; i++) {
      const el = slots[i] as HTMLElement;
      const st = state.inventory[i];
      const nameEl = el.querySelector('.name') as HTMLElement;
      const qtyEl = el.querySelector('.qty') as HTMLElement;
      el.className = 'slot' + (i === this.selectedSlot ? ' selected' : '');
      if (st) {
        const def = resolveItem(state, st.id);
        nameEl.textContent = def.name;
        qtyEl.textContent = 'x' + st.qty;
        el.classList.add(def.category);
      } else {
        nameEl.textContent = '';
        qtyEl.textContent = '';
      }
    }
    if (this.pagerTimer > 0) {
      this.pagerTimer -= dt;
      if (this.pagerTimer <= 0) this.pagerEl.classList.remove('on');
    }
  }

  setPrompt(text: string | null): void {
    if (!text) {
      this.promptEl.style.display = 'none';
      return;
    }
    this.promptEl.style.display = 'block';
    this.promptEl.innerHTML = text.replace(/^\[E\]/, '<b>[E]</b>');
  }

  toast(msg: string, kind: ToastKind = 'info', ms = 3800): void {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 5) this.toastsEl.removeChild(this.toastsEl.firstChild!);
    setTimeout(() => t.remove(), ms);
  }

  pagerNotify(text: string, hint = '[Y] ACCEPT · [X] DECLINE · [P] PAGER'): void {
    this.pagerScreen.textContent = text;
    (this.pagerEl.querySelector('.hint') as HTMLElement).textContent = hint;
    this.pagerEl.classList.remove('on');
    void this.pagerEl.offsetWidth; // restart animation
    this.pagerEl.classList.add('on');
    this.pagerTimer = 12;
  }

}
