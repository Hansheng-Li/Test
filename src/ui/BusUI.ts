import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { BUS_STOPS, BUS_FARE, BUS_MINUTES } from '../data/city';
import { t, tn } from '../i18n';

/** Sol Palma Transit: pick another district's stop; the ride is a fade and a few clock minutes. */
export class BusUI extends Panel {
  /** Stop the player is standing at. */
  here = '';

  constructor(parent: HTMLElement, private api: GameAPI) {
    super('bus-panel', 'SOL PALMA TRANSIT', parent);
  }

  render(): void {
    const body = this.body;
    body.innerHTML = `<div class="desc" style="margin-bottom:10px">${t('Fare ${fare} · about {min} minutes · no questions asked. Cash: {cash}', { fare: BUS_FARE, min: BUS_MINUTES, cash: `<b style="color:#7dff9a">$${Math.floor(this.api.state.cash)}</b>` })}</div>`;
    for (const stop of BUS_STOPS) {
      if (stop.id === this.here) continue;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="name"><b>${tn(stop.name)}</b><span class="desc">${tn(stop.zone)}</span></span>`;
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = t('RIDE · ${n}', { n: BUS_FARE });
      b.addEventListener('click', () => { this.api.rideBus(stop.id); });
      row.appendChild(b);
      body.appendChild(row);
    }
  }
}
