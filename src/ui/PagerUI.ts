import { Panel } from './Panel';
import { GameAPI, esc } from './UIContext';
import { pendingOrders, activeOrders, describeRequest, findFulfillingItem } from '../systems/OrderSystem';
import { storageItemForOrder, runnerBusy } from '../systems/RunnerSystem';
import { CUSTOMER_MAP, PAGER_NOTES } from '../data/customers';
import { LANDMARKS } from '../data/city';
import { GameClock } from '../core/Time';
import { relationshipTier } from '../systems/CustomerSystem';
import { Order } from '../game/GameState';
import { activeEvent, describeEvent } from '../systems/EventSystem';
import { t, tn } from '../i18n';
import { faceImg } from './Icons';

export function landmarkName(id: string): string {
  if (id === 'street') return t('on the street');
  return tn(LANDMARKS.find((l) => l.id === id)?.name ?? id);
}

/** Two short lines for the HUD beeper: who wants what for how much, where and by when. */
export function pagerLine(order: Order, request: string): string {
  const c = CUSTOMER_MAP[order.customerId];
  return `${c.name.split(' ')[0]} · ${order.qty}× ${request} · $${order.price}${order.vip ? ` · ${t('VIP RUSH')}` : ''}\n${landmarkName(order.locationId)} · ${t('by {time}', { time: GameClock.formatMinutes(order.windowEnd) })}`;
}

/** The labelled body of an order card: wants / pays / where / by, plus the customer's note. */
function orderGrid(order: Order, request: string): string {
  const notes = PAGER_NOTES[order.customerId] ?? [];
  const note = notes.length ? notes[order.id % notes.length] : '';
  return `<div class="order-grid"><span class="k">${t('WANTS')}</span><span class="v">${order.qty}× ${esc(request)}</span><span class="k">${t('PAYS')}</span><span class="v money">$${order.price}</span><span class="k">${t('WHERE')}</span><span class="v">${landmarkName(order.locationId)}</span><span class="k">${t('BY')}</span><span class="v">${GameClock.formatMinutes(order.windowStart)} – ${GameClock.formatMinutes(order.windowEnd)}</span></div>${note ? `<div class="note">“${tn(note)}”</div>` : ''}`;
}

/** The pager: incoming orders, accepted orders, runner dispatch. */
export class PagerUI extends Panel {
  constructor(parent: HTMLElement, private api: GameAPI) {
    super('pager-panel', 'PAGER · MOTOROLA-STYLE BEEPER', parent);
  }

  render(): void {
    const st = this.api.state;
    const body = this.body;
    body.innerHTML = '';
    const device = document.createElement('div');
    device.className = 'pager-device';
    body.appendChild(device);
    const pending = pendingOrders(st);
    const active = activeOrders(st);
    const h = (title: string): void => {
      const e = document.createElement('h3');
      e.textContent = title;
      device.appendChild(e);
    };
    if (st.upgrades.includes('eq_brickphone')) {
      const row = document.createElement('div');
      row.className = 'pager-btns';
      row.appendChild(this.button(t('BRICK PHONE · CALL AROUND FOR WORK'), () => { this.api.callAround(); this.render(); }, 'cyan'));
      device.appendChild(row);
    }
    const evText = describeEvent(activeEvent(st));
    if (evText) {
      const e = document.createElement('div');
      e.className = 'pager-screen';
      e.style.background = '#ff8a80';
      e.textContent = t('NEWS: {text}', { text: evText });
      device.appendChild(e);
    }
    if (st.trend) {
      const tr = document.createElement('div');
      tr.className = 'pager-screen';
      tr.style.background = '#f4c542';
      tr.textContent = t('STREET TALK: {effect} IS HOT TODAY (+25% ON SALES)', { effect: tn(st.trend.effect) });
      device.appendChild(tr);
    }
    h(t('NEW MESSAGES ({n})', { n: pending.length }));
    if (pending.length === 0) {
      const e = document.createElement('div');
      e.className = 'pager-screen';
      e.textContent = t('NO NEW PAGES.\nCUSTOMERS PAGE YOU WHEN THEY NEED SOMETHING.');
      device.appendChild(e);
    }
    for (const o of pending) {
      const card = document.createElement('div');
      card.className = 'order-card';
      const c = CUSTOMER_MAP[o.customerId];
      const cs = st.customers[o.customerId];
      const head = document.createElement('div');
      head.className = 'order-head';
      head.innerHTML = faceImg(c.id, c.shirt, 'avatar big') + `<div class="order-info"><div class="line1"><b>${c.name}</b>` +
        (o.vip ? ` <span class="tag" style="background:#5a3a00;color:#ffd166">${t('VIP · BIG MONEY · TIGHT WINDOW')}</span>` : '') +
        (o.bored ? ` <span class="tag" style="background:#1a3a5a;color:#9ecbff">${t('BORED OF THE USUAL · WANTS {effects}', { effects: o.effects.map(tn).join('+') })}</span>` : '') +
        `<span class="tag">${tn(c.personality).toUpperCase()}</span><span class="tag">${tn(relationshipTier(cs.relationship)).toUpperCase()} ${cs.relationship}</span>` +
        (o.effects.length ? o.effects.map((e) => `<span class="tag effect">${tn(e)}</span>`).join('') : '') +
        `</div>${orderGrid(o, describeRequest(st, o))}</div>`;
      card.appendChild(head);
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.appendChild(this.button(t('ACCEPT'), () => { this.api.acceptOrder(o.id); this.render(); }, 'primary'));
      if (!o.haggled && st.stats.sales >= 2) {
        for (const m of [0.1, 0.2, 0.35]) actions.appendChild(this.button(t('ASK +{pct}% (${price})', { pct: Math.round(m * 100), price: Math.round(o.price * (1 + m)) }), () => { this.api.haggle(o.id, m); this.render(); }, 'cyan'));
      } else if (!o.haggled) {
        const hint = document.createElement('span');
        hint.className = 'desc';
        hint.textContent = t('haggling unlocks after 2 sales');
        actions.appendChild(hint);
      }
      actions.appendChild(this.button(t('DECLINE'), () => { this.api.declineOrder(o.id); this.render(); }));
      card.appendChild(actions);
      device.appendChild(card);
    }
    h(t('ACTIVE ORDERS ({n})', { n: active.length }));
    for (const o of active) {
      const card = document.createElement('div');
      card.className = 'order-card active';
      const c = CUSTOMER_MAP[o.customerId];
      const have = findFulfillingItem(st, o);
      const stock = storageItemForOrder(st, o);
      const request = describeRequest(st, o);
      const status = o.status === 'runner'
        ? `<span style="color:#7fffd4">${st.runner?.activeOrderId === o.id ? t('RUNNER ON THE WAY · {pct}%', { pct: Math.round((o.runnerProgress ?? 0) * 100) }) : t('QUEUED FOR RUNNER')}</span>`
        : have ? `<span style="color:#7dff9a">${t('YOU ARE CARRYING THE GOODS')}</span>` : `<span style="color:#ffb3c1">${t('YOU DO NOT HAVE {n}x {what} YET', { n: o.qty, what: esc(request) })}</span>`;
      card.innerHTML = `<div class="order-head">${faceImg(c.id, c.shirt)}<div class="order-info"><div class="line1"><b>${c.name}</b> ${status}</div>${orderGrid(o, request)}</div></div>`;
      const actions = document.createElement('div');
      actions.className = 'actions';
      if (o.status === 'accepted' && st.runner?.hired) {
        const btn = this.button(stock ? t(runnerBusy(st) ? 'QUEUE FOR RUNNER (from {place})' : 'SEND RUNNER (from {place})', { place: tn(stock.property) }) : t('SEND RUNNER (no stock in storage)'), () => { this.api.sendRunner(o.id); this.render(); }, 'cyan');
        btn.disabled = !stock;
        actions.appendChild(btn);
      }
      if (actions.children.length) card.appendChild(actions);
      device.appendChild(card);
    }
    const done = st.orders.filter((o) => o.status === 'completed').slice(-5).reverse();
    if (done.length) {
      h(t('RECENT DEALS'));
      for (const o of done) {
        const e = document.createElement('div');
        e.className = 'order-card';
        e.style.opacity = '0.7';
        e.textContent = `${CUSTOMER_MAP[o.customerId].name} · ${o.qty}× ${describeRequest(st, o)} · $${o.price}`;
        device.appendChild(e);
      }
    }
  }
}
