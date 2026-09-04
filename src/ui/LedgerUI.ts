import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { MILESTONES, milestoneDone } from '../systems/MilestoneSystem';
import { CUSTOMERS } from '../data/customers';
import { WAREHOUSE_PRICE } from '../data/items';

/** The fax machine / CRT ledger: business stats, goals, employees, street talk. */
export class LedgerUI extends Panel {
  constructor(parent: HTMLElement, private api: GameAPI) {
    super('ledger-panel', 'LEDGER · FAX & CRT TERMINAL', parent);
  }

  render(): void {
    const st = this.api.state;
    const body = this.body;
    const unlocked = Object.values(st.customers).filter((c) => c.unlocked).length;
    const done = MILESTONES.filter((m) => milestoneDone(st, m.id)).length;
    const stat = (k: string, v: string | number): string => `<div class="row"><span class="name">${k}</span><span class="price">${v}</span></div>`;
    body.innerHTML = `
      <div class="row"><span class="name"><b>CREW:</b> <span class="crew-name" style="color:#ff8fd8"></span></span><span class="crew-edit"></span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <h3>BUSINESS</h3>
          ${stat('Cash', '$' + Math.floor(st.cash))}
          ${stat('Lifetime earned', '$' + Math.floor(st.stats.earned))}
          ${stat('Sales', st.stats.sales)}
          ${stat('Units produced', st.stats.produced)}
          ${stat('Customers', `${unlocked} / ${CUSTOMERS.length}`)}
          ${stat('Arrests', st.stats.arrests)}
          ${stat('Suspicion', Math.floor(st.suspicion))}
          ${st.loan ? stat('Marker', `<span style="color:#ffb3c1">owe $${st.loan.owed} · due day ${st.loan.dueDay}</span>`) : ''}
          ${stat('Property', st.properties.length > 1 ? st.properties.map((p) => ({ safehouse: 'Back Room', warehouse: 'Warehouse 7', motel: 'Room 6', laundromat: 'Laundromat' })[p] ?? p).join(' + ') : `Back Room (Warehouse 7: $${WAREHOUSE_PRICE})`)}
          <h3>CREW</h3>
          ${stat('Dizzy (runner)', st.runner?.hired ? `${st.runner.deliveries} deliveries · kept $${Math.round(st.runner.earned)}` : 'not hired')}
          ${stat('Marisol (worker)', st.worker?.hired ? `${st.worker.produced} units made` : 'not hired')}
          ${stat('Vince (dealer)', st.dealer?.hired ? `${st.dealer.sales} sales · holding $${Math.round(st.dealer.cash)}` : 'not hired')}
          ${stat('Teddy (handler)', st.handler?.hired ? `${st.handler.trips} trips · ${st.handler.moved} units to Vince` : 'not hired')}
          ${st.trend ? `<h3>STREET TALK</h3><div class="pager-screen" style="background:#f4c542">${st.trend.effect} IS HOT TODAY · +25% ON SALES</div>` : ''}
        </div>
        <div>
          <h3>GOALS (${done}/${MILESTONES.length})</h3>
          ${MILESTONES.map((m) => {
            const ok = milestoneDone(st, m.id);
            return `<div class="row" style="opacity:${ok ? 0.55 : 1}"><span class="name">${ok ? '✓ ' : '○ '}<b>${m.title}</b><span class="desc">${m.hint}</span></span><span class="price">${ok ? 'PAID' : '+$' + m.reward}</span></div>`;
          }).join('')}
        </div>
      </div>`;
    (body.querySelector('.crew-name') as HTMLElement).textContent = st.crewName || '(unnamed — pick a name, it goes on your warehouse sign)';
    const slot = body.querySelector('.crew-edit') as HTMLElement;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 24;
    inp.placeholder = 'e.g. PALM PANIC CREW';
    inp.value = st.crewName;
    inp.style.width = '200px';
    const save = this.button('SET NAME', () => { if (inp.value.trim()) this.api.setCrewName(inp.value); this.render(); }, 'primary');
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') save.click(); });
    slot.append(inp, save);
  }
}
