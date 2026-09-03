import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { SHOPS, ITEMS } from '../data/items';
import { countItem } from '../systems/InventorySystem';
import { shopPrice, DELIVERY_FEE } from '../systems/EconomySystem';

/** Generic vendor screen for the store, the supplier and the pawn shop. */
export class ShopUI extends Panel {
  shopId = 'store';
  deliver = false;

  constructor(parent: HTMLElement, private api: GameAPI) {
    super('shop-panel', 'SHOP', parent);
  }

  /** Select which vendor to show; the game then opens the panel through its panel manager. */
  setShop(id: string): void {
    this.shopId = id;
    this.el.querySelector('h2')!.childNodes[0].textContent = SHOPS[id].name.toUpperCase();
  }

  render(): void {
    const st = this.api.state;
    const shop = SHOPS[this.shopId];
    const body = this.body;
    body.innerHTML = `<div style="display:flex;justify-content:space-between"><span>CASH: <b style="color:#7dff9a">$${Math.floor(st.cash)}</b></span><span class="desc" style="color:#999">${this.deliver ? 'Delivered to WAREHOUSE storage (+20% fee).' : 'Items go straight into your backpack (8 slots).'}</span></div>`;
    if (this.shopId === 'supplier' && st.properties.includes('warehouse')) {
      const row = document.createElement('div');
      row.className = 'pager-btns';
      row.appendChild(this.button(this.deliver ? '✓ DELIVER TO WAREHOUSE (+20%)' : 'DELIVER TO WAREHOUSE (+20%)', () => { this.deliver = !this.deliver; this.render(); }, this.deliver ? 'primary' : 'cyan'));
      row.appendChild(this.button(!this.deliver ? '✓ CARRY MYSELF' : 'CARRY MYSELF', () => { this.deliver = false; this.render(); }, !this.deliver ? 'primary' : 'cyan'));
      body.appendChild(row);
    }
    for (const e of shop.entries) {
      if (e.requires && !st.properties.includes(e.requires) && !st.upgrades.includes(e.requires)) continue;
      const def = ITEMS[e.itemId];
      const owned = def.category === 'equipment' && !e.itemId.endsWith('_kit') && st.upgrades.includes(e.itemId);
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="name"><b>${def.name}</b>${def.category !== 'equipment' ? ` <span class="tag">have ${countItem(st, e.itemId)}</span>` : ''}<span class="desc">${def.desc}</span></span><span class="price">$${this.deliver && def.category !== 'equipment' ? Math.round(shopPrice(st, this.shopId, e.itemId) * (1 + DELIVERY_FEE)) : shopPrice(st, this.shopId, e.itemId)}${shopPrice(st, this.shopId, e.itemId) !== e.price ? ' <span class="tag" style="background:#5a1a1a;color:#ffb3c1">SHORTAGE</span>' : ''}</span>`;
      const buy = (qty: number): void => {
        const r = this.deliver && def.category !== 'equipment' ? this.api.buyDelivered(this.shopId, e.itemId, qty) : this.api.buy(this.shopId, e.itemId, qty);
        if (!r.ok) {
          this.api.sfx('error');
          this.api.toast(r.reason === 'no_cash' ? 'Not enough cash.' : r.reason === 'no_space' ? (this.deliver ? 'Warehouse storage is full.' : 'Backpack is full.') : r.reason === 'owned' ? 'Already own that.' : 'Cannot buy that.', 'warn');
        } else this.api.sfx('cash');
        this.render();
      };
      if (owned) {
        const b = this.button('OWNED', () => {});
        b.disabled = true;
        row.appendChild(b);
      } else if (def.category === 'equipment') {
        row.appendChild(this.button('BUY', () => buy(1), 'primary'));
      } else {
        row.appendChild(this.button('BUY 1', () => buy(1), 'primary'));
        row.appendChild(this.button('BUY 5', () => buy(5)));
        if (this.deliver) row.appendChild(this.button('BUY 20', () => buy(20)));
        if (e.itemId === 'baggies') row.appendChild(this.button('BUY 20', () => buy(20)));
      }
      body.appendChild(row);
    }
  }
}
