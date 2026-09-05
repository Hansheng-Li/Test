import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { MILESTONES, milestoneDone } from '../systems/MilestoneSystem';
import { CUSTOMERS } from '../data/customers';
import { WAREHOUSE_PRICE } from '../data/items';
import { t, tn } from '../i18n';

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
    const stat = (k: string, v: string | number): string => `<div class="row"><span class="name">${t(k)}</span><span class="price">${v}</span></div>`;
    body.innerHTML = `
      <div class="row"><span class="name"><b>${t('CREW:')}</b> <span class="crew-name" style="color:#ff8fd8"></span></span><span class="crew-edit"></span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <h3>${t('BUSINESS')}</h3>
          ${stat('Cash', '$' + Math.floor(st.cash))}
          ${stat('Lifetime earned', '$' + Math.floor(st.stats.earned))}
          ${stat('Sales', st.stats.sales)}
          ${stat('Units produced', st.stats.produced)}
          ${stat('Customers', `${unlocked} / ${CUSTOMERS.length}`)}
          ${stat('Arrests', st.stats.arrests)}
          ${stat('Suspicion', Math.floor(st.suspicion))}
          ${st.loan ? stat('Marker', `<span style="color:#ffb3c1">${t('owe ${n} · due day {day}', { n: st.loan.owed, day: st.loan.dueDay })}</span>`) : ''}
          ${stat('Property', st.properties.length > 1 ? st.properties.map((p) => tn({ safehouse: 'Back Room', warehouse: 'Warehouse 7', motel: 'Room 6', laundromat: 'Laundromat' }[p] ?? p)).join(' + ') : t('Back Room (Warehouse 7: ${n})', { n: WAREHOUSE_PRICE }))}
          <h3>${t('CREW')}</h3>
          ${stat('Dizzy (runner)', st.runner?.hired ? t('{n} deliveries · kept ${m}', { n: st.runner.deliveries, m: Math.round(st.runner.earned) }) : t('not hired'))}
          ${stat('Marisol (worker)', st.worker?.hired ? t('{n} units made', { n: st.worker.produced }) : t('not hired'))}
          ${stat('Vince (dealer)', st.dealer?.hired ? t('{n} sales · holding ${m}', { n: st.dealer.sales, m: Math.round(st.dealer.cash) }) : t('not hired'))}
          ${stat('Teddy (handler)', st.handler?.hired ? t('{n} trips · {m} units to Vince', { n: st.handler.trips, m: st.handler.moved }) : t('not hired'))}
          ${st.trend ? `<h3>${t('STREET TALK')}</h3><div class="pager-screen" style="background:#f4c542">${t('{effect} IS HOT TODAY · +25% ON SALES', { effect: tn(st.trend.effect) })}</div>` : ''}
        </div>
        <div>
          <h3>${t('GOALS ({done}/{total})', { done, total: MILESTONES.length })}</h3>
          ${MILESTONES.map((m) => {
            const ok = milestoneDone(st, m.id);
            return `<div class="row" style="opacity:${ok ? 0.55 : 1}"><span class="name">${ok ? '✓ ' : '○ '}<b>${tn(m.title)}</b><span class="desc">${tn(m.hint)}</span></span><span class="price">${ok ? t('PAID') : '+$' + m.reward}</span></div>`;
          }).join('')}
        </div>
      </div>`;
    (body.querySelector('.crew-name') as HTMLElement).textContent = st.crewName || t('(unnamed — pick a name, it goes on your warehouse sign)');
    const slot = body.querySelector('.crew-edit') as HTMLElement;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 24;
    inp.placeholder = t('e.g. PALM PANIC CREW');
    inp.value = st.crewName;
    inp.style.width = '200px';
    const save = this.button(t('SET NAME'), () => { if (inp.value.trim()) this.api.setCrewName(inp.value); this.render(); }, 'primary');
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') save.click(); });
    slot.append(inp, save);
  }
}
