import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { pendingOrders, activeOrders, describeRequest, findFulfillingItem } from '../systems/OrderSystem';
import { storageItemForOrder, runnerBusy } from '../systems/RunnerSystem';
import { CUSTOMER_MAP, PAGER_NOTES } from '../data/customers';
import { LANDMARKS } from '../data/city';
import { GameClock } from '../core/Time';
import { relationshipTier } from '../systems/CustomerSystem';
import { Order } from '../game/GameState';
import { activeEvent, describeEvent } from '../systems/EventSystem';

export function landmarkName(id: string): string {
  if (id === 'street') return 'on the street';
  return LANDMARKS.find((l) => l.id === id)?.name ?? id;
}

export function pagerLine(order: Order, request: string): string {
  const c = CUSTOMER_MAP[order.customerId];
  const phone = '555-0' + (100 + (order.customerId.charCodeAt(0) * 7 + order.customerId.length * 13) % 900);
  const notes = PAGER_NOTES[order.customerId] ?? [];
  const note = notes.length ? notes[order.id % notes.length] : '';
  return `${phone}${order.vip ? '  *** VIP RUSH ***' : ''}${order.bored ? '  SOMETHING NEW PLS' : ''}\n${order.qty}x ${request}\n$${order.price}\n${landmarkName(order.locationId).toUpperCase()}\nBY ${GameClock.formatMinutes(order.windowEnd)}  -${c.name.split(' ')[0].toUpperCase()}${note ? '\n' + note : ''}`;
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
    const h = (t: string): void => {
      const e = document.createElement('h3');
      e.textContent = t;
      device.appendChild(e);
    };
    if (st.upgrades.includes('eq_brickphone')) {
      const row = document.createElement('div');
      row.className = 'pager-btns';
      row.appendChild(this.button('BRICK PHONE · CALL AROUND FOR WORK', () => { this.api.callAround(); this.render(); }, 'cyan'));
      device.appendChild(row);
    }
    const evText = describeEvent(activeEvent(st));
    if (evText) {
      const e = document.createElement('div');
      e.className = 'pager-screen';
      e.style.background = '#ff8a80';
      e.textContent = 'NEWS: ' + evText;
      device.appendChild(e);
    }
    if (st.trend) {
      const t = document.createElement('div');
      t.className = 'pager-screen';
      t.style.background = '#f4c542';
      t.textContent = `STREET TALK: ${st.trend.effect} IS HOT TODAY (+25% ON SALES)`;
      device.appendChild(t);
    }
    h(`NEW MESSAGES (${pending.length})`);
    if (pending.length === 0) {
      const e = document.createElement('div');
      e.className = 'pager-screen';
      e.textContent = 'NO NEW PAGES.\nCUSTOMERS PAGE YOU WHEN THEY NEED SOMETHING.';
      device.appendChild(e);
    }
    for (const o of pending) {
      const card = document.createElement('div');
      card.className = 'order-card';
      const c = CUSTOMER_MAP[o.customerId];
      const cs = st.customers[o.customerId];
      const screen = document.createElement('div');
      screen.className = 'pager-screen';
      screen.textContent = pagerLine(o, describeRequest(st, o));
      card.appendChild(screen);
      const info = document.createElement('div');
      info.innerHTML = (o.vip ? '<span class="tag" style="background:#5a3a00;color:#ffd166">VIP · BIG MONEY · TIGHT WINDOW</span>' : '') + (o.bored ? '<span class="tag" style="background:#1a3a5a;color:#9ecbff">BORED OF THE USUAL · WANTS ' + o.effects.join('+') + '</span>' : '') + `<span class="tag">${c.personality.toUpperCase()}</span><span class="tag">${relationshipTier(cs.relationship).toUpperCase()}</span><span class="tag">REL ${cs.relationship}</span>` +
        (o.effects.length ? o.effects.map((e) => `<span class="tag effect">${e}</span>`).join('') : '');
      card.appendChild(info);
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.appendChild(this.button('ACCEPT', () => { this.api.acceptOrder(o.id); this.render(); }, 'primary'));
      if (!o.haggled) {
        for (const m of [0.1, 0.2, 0.35]) actions.appendChild(this.button(`ASK +${Math.round(m * 100)}% ($${Math.round(o.price * (1 + m))})`, () => { this.api.haggle(o.id, m); this.render(); }, 'cyan'));
      }
      actions.appendChild(this.button('DECLINE', () => { this.api.declineOrder(o.id); this.render(); }));
      card.appendChild(actions);
      device.appendChild(card);
    }
    h(`ACTIVE ORDERS (${active.length})`);
    for (const o of active) {
      const card = document.createElement('div');
      card.className = 'order-card active';
      const c = CUSTOMER_MAP[o.customerId];
      const have = findFulfillingItem(st, o);
      const stock = storageItemForOrder(st, o);
      const request = describeRequest(st, o);
      card.innerHTML = `<b>${c.name}</b> · ${o.qty}x ${request} · $${o.price}<br/>` +
        `MEET: ${landmarkName(o.locationId)} · WINDOW ${GameClock.formatMinutes(o.windowStart)}-${GameClock.formatMinutes(o.windowEnd)}<br/>` +
        (o.status === 'runner'
          ? (st.runner?.activeOrderId === o.id ? `<span style="color:#7fffd4">RUNNER ON THE WAY · ${Math.round((o.runnerProgress ?? 0) * 100)}%</span>` : `<span style="color:#7fffd4">QUEUED FOR RUNNER</span>`)
          : have ? `<span style="color:#7dff9a">YOU ARE CARRYING THE GOODS</span>` : `<span style="color:#ffb3c1">YOU DO NOT HAVE ${o.qty}x ${request} YET</span>`);
      const actions = document.createElement('div');
      actions.className = 'actions';
      if (o.status === 'accepted' && st.runner?.hired) {
        const btn = this.button(stock ? (runnerBusy(st) ? `QUEUE FOR RUNNER (from ${stock.property})` : `SEND RUNNER (from ${stock.property})`) : 'SEND RUNNER (no stock in storage)', () => { this.api.sendRunner(o.id); this.render(); }, 'cyan');
        btn.disabled = !stock;
        actions.appendChild(btn);
      }
      card.appendChild(actions);
      device.appendChild(card);
    }
    const done = st.orders.filter((o) => o.status === 'completed').slice(-5).reverse();
    if (done.length) {
      h('RECENT DEALS');
      for (const o of done) {
        const e = document.createElement('div');
        e.className = 'order-card';
        e.style.opacity = '0.7';
        e.textContent = `${CUSTOMER_MAP[o.customerId].name}: ${o.qty}x ${describeRequest(st, o)} · $${o.price}`;
        device.appendChild(e);
      }
    }
  }
}
