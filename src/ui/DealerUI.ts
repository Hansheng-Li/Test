import { Panel } from './Panel';
import { GameAPI, esc } from './UIContext';
import { resolveItem, packagedInInventory } from '../systems/InventorySystem';
import { dealerStockCount } from '../systems/DealerSystem';
import { CUSTOMERS } from '../data/customers';
import { DEALER_MAX_CUSTOMERS, DEALER_MAX_STOCK } from '../data/items';
import { relationshipTier } from '../systems/CustomerSystem';

/** Dealer management: stock, assigned customers, cash pickup. */
export class DealerUI extends Panel {
  constructor(parent: HTMLElement, private api: GameAPI) {
    super('dealer-panel', "VINCE'S CORNER · DEALER", parent);
  }

  render(): void {
    const st = this.api.state;
    const d = st.dealer;
    const body = this.body;
    body.innerHTML = '';
    if (!d?.hired) {
      body.textContent = 'No dealer hired.';
      return;
    }
    const top = document.createElement('div');
    top.className = 'row';
    top.innerHTML = `<span class="name"><b>CASH HELD: <span style="color:#7dff9a">$${Math.round(d.cash)}</span></b><span class="desc">${d.sales} sales · $${Math.round(d.earnedTotal)} lifetime · Vince sells at 65% of street price and keeps nothing (you pay him up front).</span></span>`;
    const collect = this.button(`COLLECT $${Math.round(d.cash)}`, () => { this.api.dealerCollect(); this.render(); }, 'primary');
    collect.disabled = d.cash < 1;
    top.appendChild(collect);
    body.appendChild(top);

    const stockSec = document.createElement('div');
    stockSec.innerHTML = `<h3>STOCK (${dealerStockCount(st)}/${DEALER_MAX_STOCK} UNITS)</h3>`;
    if (d.stock.length === 0) stockSec.innerHTML += '<div style="color:#ffb3c1">Empty. Vince cannot sell air. Hand him packaged product below.</div>';
    for (const s of d.stock) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="name"><b>${esc(resolveItem(st, s.id).name)}</b> x${s.qty}</span>`;
      row.appendChild(this.button('TAKE BACK 1', () => { this.api.dealerTake(s.id, 1); this.render(); }));
      row.appendChild(this.button('TAKE ALL', () => { this.api.dealerTake(s.id, s.qty); this.render(); }));
      stockSec.appendChild(row);
    }
    const packs = packagedInInventory(st);
    if (packs.length) {
      stockSec.innerHTML += '<h3>HAND OVER FROM BACKPACK</h3>';
      for (const p of packs) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<span class="name"><b>${esc(resolveItem(st, p.id).name)}</b> x${p.qty}</span>`;
        row.appendChild(this.button('GIVE 1', () => { this.api.dealerGive(p.id, 1); this.render(); }, 'cyan'));
        row.appendChild(this.button('GIVE ALL', () => { this.api.dealerGive(p.id, p.qty); this.render(); }, 'cyan'));
        stockSec.appendChild(row);
      }
    }
    body.appendChild(stockSec);

    const custSec = document.createElement('div');
    custSec.innerHTML = `<h3>CUSTOMERS HANDLED BY VINCE (${d.customers.length}/${DEALER_MAX_CUSTOMERS})</h3><div class="desc" style="color:#999">Assigned customers stop paging you; Vince sells to them on his own about every hour and a half if he has stock.</div>`;
    for (const c of CUSTOMERS) {
      const cs = st.customers[c.id];
      if (!cs?.unlocked) continue;
      const on = d.customers.includes(c.id);
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="name"><b>${c.name}</b> <span class="tag">${c.personality.toUpperCase()}</span><span class="tag">${relationshipTier(cs.relationship).toUpperCase()}</span><span class="desc">likes ${c.prefBase} · ${c.homeZone}</span></span>`;
      const b = this.button(on ? 'REMOVE' : 'ASSIGN', () => { this.api.dealerAssign(c.id, !on); this.render(); }, on ? '' : 'primary');
      if (!on && d.customers.length >= DEALER_MAX_CUSTOMERS) b.disabled = true;
      row.appendChild(b);
      custSec.appendChild(row);
    }
    body.appendChild(custSec);
  }
}
