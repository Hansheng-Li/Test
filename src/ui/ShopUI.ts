import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { SHOPS, ITEMS } from '../data/items';
import { countItem } from '../systems/InventorySystem';

/** Generic vendor screen for the store, the supplier and the pawn shop. */
export class ShopUI extends Panel {
  shopId = 'store';

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
    body.innerHTML = `<div style="display:flex;justify-content:space-between"><span>CASH: <b style="color:#7dff9a">$${Math.floor(st.cash)}</b></span><span class="desc" style="color:#999">Items go straight into your backpack (8 slots).</span></div>`;
    for (const e of shop.entries) {
      if (e.requires && !st.properties.includes(e.requires) && !st.upgrades.includes(e.requires)) continue;
      const def = ITEMS[e.itemId];
      const owned = def.category === 'equipment' && !e.itemId.endsWith('_kit') && st.upgrades.includes(e.itemId);
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="name"><b>${def.name}</b>${def.category !== 'equipment' ? ` <span class="tag">have ${countItem(st, e.itemId)}</span>` : ''}<span class="desc">${def.desc}</span></span><span class="price">$${e.price}</span>`;
      const buy = (qty: number): void => {
        const r = this.api.buy(this.shopId, e.itemId, qty);
        if (!r.ok) {
          this.api.sfx('error');
          this.api.toast(r.reason === 'no_cash' ? 'Not enough cash.' : r.reason === 'no_space' ? 'Backpack is full.' : r.reason === 'owned' ? 'Already own that.' : 'Cannot buy that.', 'warn');
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
        if (e.itemId === 'baggies') row.appendChild(this.button('BUY 20', () => buy(20)));
      }
      body.appendChild(row);
    }
  }
}
