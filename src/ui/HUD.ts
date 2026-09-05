import { GameState } from '../game/GameState';
import { resolveItem } from '../systems/InventorySystem';
import { iconFor } from './Icons';
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
  private shownCash = NaN;
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
      <div id="compass"><span class="arrow"></span><span class="label"></span></div>
      <div id="flash"></div>
      <div id="radio"><div class="st"></div><div class="tr"></div><div class="dj"></div></div>
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
      s.innerHTML = `<span class="key">${i + 1}</span><img class="icon" alt="" draggable="false" style="display:none"><span class="name"></span><span class="qty"></span>`;
      (s.querySelector('img') as HTMLImageElement).addEventListener('error', () => { (s.querySelector('img') as HTMLImageElement).style.display = 'none'; });
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
    // the counter rolls toward the real value so payouts read as a satisfying tick-up
    if (Number.isNaN(this.shownCash) || Math.abs(state.cash - this.shownCash) > 5000) this.shownCash = state.cash;
    else this.shownCash += (state.cash - this.shownCash) * Math.min(1, dt * 6);
    if (Math.abs(state.cash - this.shownCash) < 0.6) this.shownCash = state.cash;
    if (this.shownCash !== this.lastCash) {
      this.cashEl.textContent = '$' + Math.floor(this.shownCash).toLocaleString();
      this.lastCash = this.shownCash;
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
      const img = el.querySelector('img') as HTMLImageElement;
      el.className = 'slot' + (i === this.selectedSlot ? ' selected' : '');
      if (st) {
        const def = resolveItem(state, st.id);
        nameEl.textContent = def.name;
        qtyEl.textContent = 'x' + st.qty;
        el.classList.add(def.category);
        const src = iconFor(st.id);
        if (!img.getAttribute('src')?.endsWith(src)) {
          img.style.display = '';
          img.src = src;
        }
      } else {
        nameEl.textContent = '';
        qtyEl.textContent = '';
        img.style.display = 'none';
        img.removeAttribute('src');
      }
    }
    if (this.pagerTimer > 0) {
      this.pagerTimer -= dt;
      if (this.pagerTimer <= 0) this.pagerEl.classList.remove('on');
    }
    if (this.radioTimer > 0) {
      this.radioTimer -= dt;
      if (this.radioTimer <= 0) (this.root.querySelector('#radio .dj') as HTMLElement).classList.remove('show');
    }
  }

  /** Direction + distance to the current target; angle is relative to the view (0 = straight ahead). */
  setCompass(label: string | null, angleRad: number, meters: number): void {
    const el = this.root.querySelector('#compass') as HTMLElement;
    if (!label) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'flex';
    (el.querySelector('.arrow') as HTMLElement).style.transform = `rotate(${(angleRad * 180) / Math.PI}deg)`;
    (el.querySelector('.label') as HTMLElement).innerHTML = `${label} <b>${Math.round(meters)} m</b>`;
  }

  private radioTimer = 0;

  /** Radio readout: station + track stay while it is on, the DJ line fades after a few seconds. */
  setRadio(station: { name: string; freq: string; dj: string; color: string } | null, track: string, line: string | null): void {
    const el = this.root.querySelector('#radio') as HTMLElement;
    if (!station) {
      el.classList.remove('on');
      return;
    }
    el.classList.add('on');
    el.style.borderColor = station.color;
    (el.querySelector('.st') as HTMLElement).textContent = `${station.name} ${station.freq}`;
    (el.querySelector('.st') as HTMLElement).style.color = station.color;
    (el.querySelector('.tr') as HTMLElement).textContent = '♪ ' + track;
    const dj = el.querySelector('.dj') as HTMLElement;
    if (line) {
      dj.textContent = line;
      dj.classList.add('show');
      this.radioTimer = 9;
    }
  }

  /** Big centre-screen text for viewer-readable moments: SOLD +$68, BUSTED, NEW PROPERTY. */
  flash(text: string, color = '#7dff9a', scale = 1): void {
    const el = this.root.querySelector('#flash') as HTMLElement;
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = `${Math.round(56 * scale)}px`;
    el.style.textShadow = `0 0 18px color-mix(in srgb, ${color} 60%, transparent), 0 3px 0 #000`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  setPrompt(text: string | null): void {
    if (!text) {
      this.promptEl.style.display = 'none';
      return;
    }
    this.promptEl.style.display = 'block';
    this.promptEl.innerHTML = text.replace(/^\[E\]/, '<b>[E]</b>');
  }

  toast(msg: string, kind: ToastKind = 'info', ms = 3200): void {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.removeChild(this.toastsEl.firstChild!);
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
