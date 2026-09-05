import { Panel } from './Panel';
import { GameAPI, esc } from './UIContext';
import { t, tn } from '../i18n';
import { PLACES, CONTACTS } from '../data/directory';
import { LANDMARKS } from '../data/city';
import { CUSTOMERS, CUSTOMER_MAP } from '../data/customers';
import { STORY_STEP_LABELS } from '../data/story';
import { storyChecklist, prologueActive } from '../systems/StorySystem';
import { MILESTONES, milestoneDone } from '../systems/MilestoneSystem';
import { activeOrders, describeRequest } from '../systems/OrderSystem';
import { relationshipTier } from '../systems/CustomerSystem';
import { faceImg } from './Icons';
import { landmarkName } from './PagerUI';
import { GameClock } from '../core/Time';

type Tab = 'tasks' | 'places' | 'people' | 'controls';

const KEYS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look around'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump · stir and seal inside station panels · horn in the car'],
  ['E', 'Interact: talk, buy, use a station, sell, get in a car'],
  ['Left click', 'Swing the bat / fire the pistol (selected on the hotbar)'],
  ['1 – 8', 'Select a hotbar slot (what you hand over or hold)'],
  ['J', 'This journal'],
  ['P', 'Pager: accept, decline, haggle, send the runner'],
  ['Y / X', 'Accept / decline the newest page'],
  ['Tab', 'Backpack, product book, customer book'],
  ['M', 'Paper map (the radar in the corner is always on)'],
  ['N', 'Radio: next station / off'],
  ['F', 'Sedan trunk (stand beside the parked sedan)'],
  ['B', 'Place equipment inside your warehouse'],
  ['H', 'Hide the HUD'],
  ['Esc', 'Close a panel · pause menu (save, settings)'],
];

/** The journal: chapter checklist and goals, a directory of places and people, and the controls. */
export class JournalUI extends Panel {
  tab: Tab = 'tasks';

  constructor(parent: HTMLElement, private api: GameAPI) {
    super('journal-panel', 'JOURNAL', parent);
  }

  onKey(code: string): boolean {
    const order: Tab[] = ['tasks', 'places', 'people', 'controls'];
    if (code === 'KeyQ' || code === 'KeyE' || code === 'ArrowLeft' || code === 'ArrowRight') {
      const i = order.indexOf(this.tab);
      this.tab = order[(i + (code === 'KeyQ' || code === 'ArrowLeft' ? order.length - 1 : 1)) % order.length];
      this.render();
      return true;
    }
    return false;
  }

  private dist(x: number, z: number): string {
    const p = this.api.playerXZ();
    return t('{n} m', { n: Math.round(Math.hypot(x - p.x, z - p.z)) });
  }

  private guideButton(x: number, z: number, label: string): HTMLButtonElement {
    return this.button(t('GUIDE ME'), () => this.api.setWaypoint(x, z, label), 'cyan');
  }

  render(): void {
    const body = this.body;
    body.innerHTML = '';
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    const names: [Tab, string][] = [['tasks', 'TASKS'], ['places', 'PLACES'], ['people', 'PEOPLE'], ['controls', 'CONTROLS']];
    for (const [id, label] of names) {
      const b = this.button(t(label), () => { this.tab = id; this.render(); }, this.tab === id ? 'active' : '');
      tabs.appendChild(b);
    }
    body.appendChild(tabs);
    const hint = document.createElement('div');
    hint.className = 'meta';
    hint.style.margin = '-4px 0 10px';
    hint.textContent = t('Q / E switch tabs · GUIDE ME points the compass and the radar at a place');
    body.appendChild(hint);
    if (this.tab === 'tasks') this.renderTasks(body);
    else if (this.tab === 'places') this.renderPlaces(body);
    else if (this.tab === 'people') this.renderPeople(body);
    else this.renderControls(body);
  }

  private h3(parent: HTMLElement, text: string): void {
    const h = document.createElement('h3');
    h.textContent = text;
    parent.appendChild(h);
  }

  private renderTasks(body: HTMLElement): void {
    const st = this.api.state;
    this.h3(body, t('CHAPTER ONE'));
    if (prologueActive(st)) {
      for (const c of storyChecklist(st)) {
        const row = document.createElement('div');
        row.className = 'step ' + c.state;
        row.textContent = `${c.state === 'done' ? '✓' : c.state === 'now' ? '▶' : '○'}  ${t(STORY_STEP_LABELS[c.step])}`;
        body.appendChild(row);
      }
    } else {
      const row = document.createElement('div');
      row.className = 'step done';
      row.textContent = '✓  ' + t('Chapter one is done: the pager is open and the city is yours to take.');
      body.appendChild(row);
    }
    this.h3(body, t('RIGHT NOW'));
    const now = document.createElement('div');
    now.className = 'objective-now';
    now.textContent = this.api.objective();
    body.appendChild(now);
    const orders = activeOrders(st);
    if (orders.length) {
      this.h3(body, t('ACTIVE ORDERS'));
      for (const o of orders) {
        const c = CUSTOMER_MAP[o.customerId];
        const l = LANDMARKS.find((x) => x.id === o.locationId);
        const row = document.createElement('div');
        row.className = 'dir-row';
        row.innerHTML = `${faceImg(c.id, c.shirt)}<div class="txt"><span class="line1"><b>${c.name}</b> · ${o.qty}× ${esc(describeRequest(st, o))} · $${o.price}</span><span class="meta">${t('MEET: {place} · WINDOW {from}-{to}', { place: landmarkName(o.locationId), from: GameClock.formatMinutes(o.windowStart), to: GameClock.formatMinutes(o.windowEnd) })}${o.status === 'runner' ? ' · ' + t('RUNNER ON THE WAY') : ''}</span></div>`;
        if (l && o.status === 'accepted') row.appendChild(this.guideButton(l.x, l.z, `${c.name.split(' ')[0]} · ${landmarkName(o.locationId)}`));
        body.appendChild(row);
      }
    }
    const goals = MILESTONES.filter((m) => !milestoneDone(st, m.id)).slice(0, 5);
    if (goals.length) {
      this.h3(body, t('NEXT GOALS'));
      for (const m of goals) {
        const row = document.createElement('div');
        row.className = 'dir-row';
        row.innerHTML = `<span class="swatch" style="background:#ffd166"></span><div class="txt"><span class="line1"><b>${t(m.title)}</b></span><span class="meta">${t(m.hint)}</span></div><span class="price">+$${m.reward}</span>`;
        body.appendChild(row);
      }
    }
  }

  private renderPlaces(body: HTMLElement): void {
    const st = this.api.state;
    this.h3(body, t('KEY PLACES'));
    for (const p of PLACES) {
      const row = document.createElement('div');
      row.className = 'dir-row';
      const owned = st.properties.includes(p.id);
      row.innerHTML = `<span class="swatch" style="background:${p.color}"></span><div class="txt"><span class="line1"><b>${tn(p.name)}</b>${owned ? ` <span class="tag">${t('YOURS')}</span>` : ''}</span><span class="meta">${t(p.what, p.vars)}</span></div><span class="price">${this.dist(p.x, p.z)}</span>`;
      row.appendChild(this.guideButton(p.x, p.z, tn(p.name)));
      body.appendChild(row);
    }
    this.h3(body, t('CUSTOMER HANGOUTS'));
    for (const l of LANDMARKS) {
      const regulars = CUSTOMERS.filter((c) => c.spots.includes(l.id) && st.customers[c.id]?.unlocked).map((c) => c.name.split(' ')[0]);
      const row = document.createElement('div');
      row.className = 'dir-row';
      row.innerHTML = `<span class="swatch" style="background:#7a5a3a"></span><div class="txt"><span class="line1"><b>${tn(l.name)}</b> <span class="tag">${t(l.zone.toUpperCase())}</span></span><span class="meta">${regulars.length ? t('Regulars: {names}', { names: regulars.join(', ') }) : t('Nobody you know yet.')}</span></div><span class="price">${this.dist(l.x, l.z)}</span>`;
      row.appendChild(this.guideButton(l.x, l.z, tn(l.name)));
      body.appendChild(row);
    }
  }

  private renderPeople(body: HTMLElement): void {
    const st = this.api.state;
    this.h3(body, t('CONTACTS'));
    for (const c of CONTACTS) {
      const hired = c.hired(st);
      const row = document.createElement('div');
      row.className = 'dir-row';
      row.innerHTML = `${faceImg(c.id, c.color)}<div class="txt"><span class="line1"><b>${c.name}</b> · ${t(c.role)}${hired === null ? '' : ` <span class="tag" style="${hired ? 'background:#1b5e20;color:#a5ffb0' : ''}">${hired ? t('HIRED') : t('FOR HIRE')}</span>`}</span><span class="meta">${t(c.what, c.vars)}</span><span class="meta">${tn(c.where)} · ${this.dist(c.x, c.z)}</span></div>`;
      row.appendChild(this.guideButton(c.x, c.z, c.name));
      body.appendChild(row);
    }
    this.h3(body, t('CUSTOMERS'));
    let any = false;
    for (const c of CUSTOMERS) {
      const cs = st.customers[c.id];
      if (!cs?.unlocked) continue;
      any = true;
      const row = document.createElement('div');
      row.className = 'dir-row';
      const spots = c.spots.map((sp) => tn(LANDMARKS.find((l) => l.id === sp)?.name ?? sp)).join(' / ');
      row.innerHTML = `${faceImg(c.id, c.shirt)}<div class="txt"><span class="line1"><b>${c.name}</b> <span class="tag">${tn(c.personality).toUpperCase()}</span><span class="tag">${tn(relationshipTier(cs.relationship)).toUpperCase()} ${cs.relationship}</span></span><span class="meta">${t('likes {base} · {effects} · {deals} deals · hangs at {spots}', { base: c.prefBase, effects: c.prefEffects.map(tn).join(', '), deals: cs.deals, spots })}</span></div>`;
      const first = LANDMARKS.find((l) => l.id === c.spots[0]);
      if (first) row.appendChild(this.guideButton(first.x, first.z, `${c.name.split(' ')[0]} · ${tn(first.name)}`));
      body.appendChild(row);
    }
    if (!any) {
      const e = document.createElement('div');
      e.className = 'meta';
      e.textContent = t('Nobody yet. Customers introduce their friends once they trust you.');
      body.appendChild(e);
    }
  }

  private renderControls(body: HTMLElement): void {
    this.h3(body, t('KEYS'));
    const table = document.createElement('div');
    table.className = 'keys';
    for (const [k, what] of KEYS) {
      const row = document.createElement('div');
      row.className = 'key-row';
      row.innerHTML = `<kbd>${k}</kbd><span>${t(what)}</span>`;
      table.appendChild(row);
    }
    body.appendChild(table);
  }
}
