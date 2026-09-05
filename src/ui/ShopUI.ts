import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { SHOPS, ITEMS } from '../data/items';
import { countItem } from '../systems/InventorySystem';
import { shopPrice, DELIVERY_FEE } from '../systems/EconomySystem';
import { iconImg } from './Icons';
import { t, tn } from '../i18n';
import { LOAN_TIERS, LOAN_INTEREST, LOAN_DAYS, LOAN_LATE_INTEREST, loanTierAvailable, loanDaysLeft } from '../systems/LoanSystem';

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
    this.deliver = false; // delivery is opt-in per visit
    this.setTitle(SHOPS[id].name.toUpperCase());
  }

  render(): void {
    const st = this.api.state;
    const shop = SHOPS[this.shopId];
    const body = this.body;
    body.innerHTML = `<div style="display:flex;justify-content:space-between"><span>${t('CASH: {cash}', { cash: `<b style="color:#7dff9a">$${Math.floor(st.cash)}</b>` })}</span><span class="desc" style="color:#999">${t(this.deliver ? 'Delivered to WAREHOUSE storage (+20% fee).' : 'Items go straight into your backpack (8 slots).')}</span></div>`;
    if ((this.shopId === 'supplier' || this.shopId === 'store') && st.properties.includes('warehouse')) {
      const row = document.createElement('div');
      row.className = 'pager-btns';
      row.appendChild(this.button(t(this.deliver ? '✓ DELIVER TO WAREHOUSE (+20%)' : 'DELIVER TO WAREHOUSE (+20%)'), () => { this.deliver = !this.deliver; this.render(); }, this.deliver ? 'primary' : 'cyan'));
      row.appendChild(this.button(t(!this.deliver ? '✓ CARRY MYSELF' : 'CARRY MYSELF'), () => { this.deliver = false; this.render(); }, !this.deliver ? 'primary' : 'cyan'));
      body.appendChild(row);
    }
    if (this.shopId === 'pawn') body.appendChild(this.markerBox());
    for (const e of shop.entries) {
      if (e.requires && !st.properties.includes(e.requires) && !st.upgrades.includes(e.requires)) continue;
      const def = ITEMS[e.itemId];
      const owned = def.category === 'equipment' && !e.itemId.endsWith('_kit') && st.upgrades.includes(e.itemId);
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `${iconImg(e.itemId, 'icon row-icon')}<span class="name"><b>${tn(def.name)}</b>${def.category !== 'equipment' ? ` <span class="tag">${t('have {n}', { n: countItem(st, e.itemId) })}</span>` : ''}<span class="desc">${tn(def.desc)}</span></span><span class="price">$${this.deliver && def.category !== 'equipment' ? Math.round(shopPrice(st, this.shopId, e.itemId) * (1 + DELIVERY_FEE)) : shopPrice(st, this.shopId, e.itemId)}${shopPrice(st, this.shopId, e.itemId) !== e.price ? ` <span class="tag" style="background:#5a1a1a;color:#ffb3c1">${t('SHORTAGE')}</span>` : ''}</span>`;
      const buy = (qty: number): void => {
        const r = this.deliver && def.category !== 'equipment' ? this.api.buyDelivered(this.shopId, e.itemId, qty) : this.api.buy(this.shopId, e.itemId, qty);
        if (!r.ok) {
          this.api.sfx('error');
          this.api.toast(t(r.reason === 'no_cash' ? 'Not enough cash.' : r.reason === 'no_space' ? (this.deliver ? 'Warehouse storage is full.' : 'Backpack is full.') : r.reason === 'owned' ? 'Already own that.' : 'Cannot buy that.'), 'warn');
        } else this.api.sfx('cash');
        this.render();
      };
      if (owned) {
        const b = this.button(t('OWNED'), () => {});
        b.disabled = true;
        row.appendChild(b);
      } else if (def.category === 'equipment') {
        row.appendChild(this.button(t('BUY'), () => buy(1), 'primary'));
      } else {
        row.appendChild(this.button(t('BUY 1'), () => buy(1), 'primary'));
        row.appendChild(this.button(t('BUY 5'), () => buy(5)));
        if (this.deliver || e.itemId === 'baggies') row.appendChild(this.button(t('BUY 20'), () => buy(20)));
      }
      body.appendChild(row);
    }
  }

  /** The marker: a loan-shark advance with a due day, shown above the pawn shop's shelves. */
  private markerBox(): HTMLElement {
    const st = this.api.state;
    const box = document.createElement('div');
    box.className = 'pager-screen';
    box.style.margin = '6px 0 10px';
    const row = document.createElement('div');
    row.className = 'pager-btns';
    const loan = st.loan;
    if (!loan) {
      box.innerHTML = t('MARKER · cash now, pay back +{interest}% within {days} days. Late: +{late}% a day, the collectors take your cash (and Vince\'s) and the port hears about it.', { interest: Math.round(LOAN_INTEREST * 100), days: LOAN_DAYS, late: Math.round(LOAN_LATE_INTEREST * 100) });
      for (const tier of LOAN_TIERS) {
        const ok = loanTierAvailable(st, tier);
        const b = this.button(t('BORROW ${n}', { n: tier }), () => { this.api.takeLoan(tier); this.render(); }, ok ? 'cyan' : '');
        if (!ok) {
          b.disabled = true;
          b.title = t(tier === 800 ? 'Needs $1,000 earned lifetime' : 'Needs Warehouse 7');
        }
        row.appendChild(b);
      }
    } else {
      const left = loanDaysLeft(loan, Math.floor(this.api.now() / (24 * 60)));
      const when = left > 1 ? t('due in {n} days', { n: left }) : left === 1 ? t('due TOMORROW') : left === 0 ? t('due TODAY') : `<span style="color:#ff5c5c">${t('OVERDUE {n} day(s)', { n: -left })}</span>`;
      box.innerHTML = t('MARKER · you owe <b>${owed}</b> on a ${principal} advance · {when} (end of day {day}).', { owed: loan.owed, principal: loan.principal, when, day: loan.dueDay });
      for (const amt of [100, 500]) if (loan.owed > amt) row.appendChild(this.button(t('REPAY ${n}', { n: amt }), () => { this.api.repayLoan(amt); this.render(); }, 'cyan'));
      row.appendChild(this.button(t('REPAY ALL (${n})', { n: loan.owed }), () => { this.api.repayLoan(loan.owed); this.render(); }, 'primary'));
    }
    box.appendChild(row);
    return box;
  }
}
