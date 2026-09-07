import { Panel } from './Panel';
import { GameAPI, esc } from './UIContext';
import { resolveItem, storageOf, storageCapacity, storageUsed } from '../systems/InventorySystem';
import { iconImg, effectTag } from './Icons';
import { t, tn } from '../i18n';
import { ITEMS } from '../data/items';
import { LANDMARKS } from '../data/city';
import { CUSTOMERS } from '../data/customers';
import { relationshipTier } from '../systems/CustomerSystem';

/** Inventory grid, product book, customer book. Doubles as the storage transfer screen. */
export class InventoryUI extends Panel {
  /** When set, the panel shows the storage of this property side by side. */
  storageProperty: string | null = null;

  constructor(parent: HTMLElement, private api: GameAPI) {
    super('inventory-panel', 'BACKPACK', parent);
  }

  render(): void {
    const st = this.api.state;
    const body = this.body;
    body.innerHTML = '';
    this.setTitle(this.storageProperty ? (this.storageProperty === 'trunk' ? 'BACKPACK ⇄ SEDAN TRUNK' : t('BACKPACK ⇄ {place} STORAGE', { place: tn(this.storageProperty).toUpperCase() })) : 'BACKPACK');
    this.el.classList.toggle('storage', !!this.storageProperty);
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = this.storageProperty ? '1fr 1fr' : '1fr';
    wrap.style.gap = '16px';
    body.appendChild(wrap);
    const discardButtons = (holder: HTMLElement, id: string, qty: number, name: string, valuable: boolean): void => {
      const ask = (n: number): boolean => !valuable || confirm(t('Throw away {n}x {item}? Products are worth money.', { n, item: name }));
      holder.appendChild(this.button(t('DISCARD 1'), () => { if (ask(1)) { this.api.discard(id, 1); this.render(); } }, 'warn'));
      if (qty > 1) holder.appendChild(this.button(t('DISCARD ALL'), () => { if (ask(qty)) { this.api.discard(id, qty); this.render(); } }, 'warn'));
    };
    // inventory
    const left = document.createElement('div');
    left.innerHTML = `<h3>${t('CARRYING ({n}/8 SLOTS)', { n: st.inventory.filter(Boolean).length })}</h3>`;
    if (this.storageProperty) {
      // transfer view: one row per stack, buttons in a line, nothing squeezed into a grid cell
      let any = false;
      st.inventory.forEach((s) => {
        if (!s) return;
        any = true;
        const def = resolveItem(st, s.id);
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `${iconImg(s.id, 'icon row-icon')}<span class="name"><b>${esc(tn(def.name))}</b> <span class="qty">×${s.qty}</span><span class="desc">${tn(def.desc)}</span></span>`;
        const btns = document.createElement('span');
        btns.className = 'btns';
        btns.appendChild(this.button(t('STORE 1'), () => { this.api.deposit(this.storageProperty!, s.id, 1); this.render(); }, 'primary'));
        if (s.qty > 1) btns.appendChild(this.button(t('STORE ALL'), () => { this.api.deposit(this.storageProperty!, s.id, s.qty); this.render(); }));
        discardButtons(btns, s.id, s.qty, tn(def.name), def.category === 'product' || def.category === 'packaged_product');
        row.appendChild(btns);
        left.appendChild(row);
      });
      if (!any) left.innerHTML += `<div class="meta" style="color:#999">${t('Your backpack is empty.')}</div>`;
    } else {
      const grid = document.createElement('div');
      grid.className = 'grid';
      st.inventory.forEach((s, i) => {
        const cell = document.createElement('div');
        cell.className = 'inv-slot';
        if (s) {
          const def = resolveItem(st, s.id);
          cell.innerHTML = `${iconImg(s.id)}<div class="txt"><b>${esc(tn(def.name))}</b> <span class="qty">×${s.qty}</span><span class="meta">${tn(def.category.replace('_', ' '))}${def.desc ? ' · ' + tn(def.desc) : ''}</span></div>`;
          const btns = document.createElement('div');
          btns.className = 'cell-btns';
          discardButtons(btns, s.id, s.qty, tn(def.name), def.category === 'product' || def.category === 'packaged_product');
          cell.appendChild(btns);
        } else cell.innerHTML = `<div class="txt"><span class="meta">${t('empty slot {n}', { n: i + 1 })}</span></div>`;
        grid.appendChild(cell);
      });
      left.appendChild(grid);
    }
    wrap.appendChild(left);
    if (this.storageProperty) {
      const right = document.createElement('div');
      const items = storageOf(st, this.storageProperty);
      right.innerHTML = `<h3>${t('STORAGE ({used}/{cap} UNITS)', { used: storageUsed(st, this.storageProperty), cap: storageCapacity(st, this.storageProperty) })}</h3>`;
      if (items.length === 0) right.innerHTML += `<div class="meta" style="color:#999">${t('Empty. Store packaged products here so your runner can deliver them.')}</div>`;
      for (const s of items) {
        const def = resolveItem(st, s.id);
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `${iconImg(s.id, 'icon row-icon')}<span class="name"><b>${esc(tn(def.name))}</b> <span class="qty">×${s.qty}</span><span class="desc">${tn(def.desc)}</span></span>`;
        const btns = document.createElement('span');
        btns.className = 'btns';
        btns.appendChild(this.button(t('TAKE 1'), () => { this.api.withdraw(this.storageProperty!, s.id, 1); this.render(); }, 'primary'));
        if (s.qty > 1) btns.appendChild(this.button(t('TAKE ALL'), () => { this.api.withdraw(this.storageProperty!, s.id, s.qty); this.render(); }));
        row.appendChild(btns);
        right.appendChild(row);
      }
      wrap.appendChild(right);
    }
    // product book
    const recipes = Object.values(st.recipes);
    if (recipes.length && !this.storageProperty) {
      const book = document.createElement('div');
      book.innerHTML = `<h3>${t('PRODUCT BOOK')}</h3>`;
      for (const r of recipes) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<span class="name"><b>${esc(r.customName ?? r.defaultName)}</b> <span class="tag">${r.base}</span>${r.effects.map((e) => effectTag(e)).join('')}<span class="desc">${r.mods.length ? t('mods: {list}', { list: r.mods.map((m) => tn(ITEMS[m]?.name ?? m)).join(' → ') }) : t('plain base')}</span></span><span class="price">$${r.value}/u</span>`;
        book.appendChild(row);
      }
      body.appendChild(book);
    }
    // customer book
    if (!this.storageProperty) {
      const cb = document.createElement('div');
      cb.innerHTML = `<h3>${t('CUSTOMER BOOK')}</h3>`;
      for (const c of CUSTOMERS) {
        const cs = st.customers[c.id];
        if (!cs?.unlocked) continue;
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<span class="name"><b>${c.name}</b> <span class="tag">${tn(c.personality).toUpperCase()}</span><span class="tag">${tn(relationshipTier(cs.relationship)).toUpperCase()} ${cs.relationship}</span><span class="desc">${t('likes {base} · {effects} · {deals} deals · hangs at {spots}', { base: c.prefBase, effects: c.prefEffects.map(tn).join(', '), deals: cs.deals, spots: c.spots.map((sp) => tn(LANDMARKS.find((l) => l.id === sp)?.name ?? sp)).join(' / ') })}</span></span>`;
        cb.appendChild(row);
      }
      body.appendChild(cb);
    }
  }
}
