import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { resolveItem, storageOf, storageCapacity, storageUsed } from '../systems/InventorySystem';
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
    const title = this.el.querySelector('h2')!;
    title.childNodes[0].textContent = this.storageProperty ? `BACKPACK ⇄ ${this.storageProperty.toUpperCase()} STORAGE` : 'BACKPACK';
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = this.storageProperty ? '1fr 1fr' : '1fr';
    wrap.style.gap = '16px';
    body.appendChild(wrap);
    // inventory
    const left = document.createElement('div');
    left.innerHTML = `<h3>CARRYING (${st.inventory.filter(Boolean).length}/8 SLOTS)</h3>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    st.inventory.forEach((s, i) => {
      const cell = document.createElement('div');
      cell.className = 'inv-slot';
      if (s) {
        const def = resolveItem(st, s.id);
        cell.innerHTML = `<span class="qty">x${s.qty}</span><b>${def.name}</b><span class="meta">${def.category.replace('_', ' ')}${def.desc ? ' · ' + def.desc : ''}</span>`;
        if (this.storageProperty) {
          const b = this.button('STORE', () => { this.api.deposit(this.storageProperty!, s.id, s.qty); this.render(); });
          b.style.marginTop = '4px';
          cell.appendChild(b);
        }
      } else cell.innerHTML = `<span class="meta">empty slot ${i + 1}</span>`;
      grid.appendChild(cell);
    });
    left.appendChild(grid);
    wrap.appendChild(left);
    if (this.storageProperty) {
      const right = document.createElement('div');
      const items = storageOf(st, this.storageProperty);
      right.innerHTML = `<h3>STORAGE (${storageUsed(st, this.storageProperty)}/${storageCapacity(st, this.storageProperty)} UNITS)</h3>`;
      if (items.length === 0) right.innerHTML += `<div class="meta" style="color:#999">Empty. Store packaged products here so your runner can deliver them.</div>`;
      for (const s of items) {
        const def = resolveItem(st, s.id);
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<span class="name"><b>${def.name}</b> x${s.qty}<span class="desc">${def.desc}</span></span>`;
        const b1 = this.button('TAKE 1', () => { this.api.withdraw(this.storageProperty!, s.id, 1); this.render(); });
        const b2 = this.button('TAKE ALL', () => { this.api.withdraw(this.storageProperty!, s.id, s.qty); this.render(); });
        row.appendChild(b1);
        row.appendChild(b2);
        right.appendChild(row);
      }
      wrap.appendChild(right);
    }
    // product book
    const recipes = Object.values(st.recipes);
    if (recipes.length && !this.storageProperty) {
      const book = document.createElement('div');
      book.innerHTML = '<h3>PRODUCT BOOK</h3>';
      for (const r of recipes) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<span class="name"><b>${r.customName ?? r.defaultName}</b> <span class="tag">${r.base}</span>${r.effects.map((e) => `<span class="tag effect">${e}</span>`).join('')}<span class="desc">${r.mods.length ? 'mods: ' + r.mods.map((m) => m.replace('mod_', '').replace('_', ' ')).join(' → ') : 'plain base'}</span></span><span class="price">$${r.value}/u</span>`;
        const rename = this.button('RENAME', () => {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.maxLength = 24;
          inp.value = r.customName ?? r.defaultName;
          inp.style.width = '180px';
          const save = this.button('SAVE', () => { if (inp.value.trim()) this.api.nameRecipe(r.key, inp.value); this.render(); }, 'primary');
          inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') save.click(); if (e.key === 'Escape') this.render(); });
          rename.replaceWith(inp, save);
          inp.focus();
          inp.select();
        });
        row.appendChild(rename);
        book.appendChild(row);
      }
      body.appendChild(book);
    }
    // customer book
    if (!this.storageProperty) {
      const cb = document.createElement('div');
      cb.innerHTML = '<h3>CUSTOMER BOOK</h3>';
      for (const c of CUSTOMERS) {
        const cs = st.customers[c.id];
        if (!cs?.unlocked) continue;
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<span class="name"><b>${c.name}</b> <span class="tag">${c.personality.toUpperCase()}</span><span class="tag">${relationshipTier(cs.relationship).toUpperCase()} ${cs.relationship}</span><span class="desc">likes ${c.prefBase} · ${c.prefEffects.join(', ')} · ${cs.deals} deals · hangs at ${c.spots.join(' / ')}</span></span>`;
        cb.appendChild(row);
      }
      body.appendChild(cb);
    }
  }
}
