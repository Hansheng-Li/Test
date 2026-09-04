import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { DICE_BETS, DicePick } from '../systems/DiceSystem';

const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const money = (n: number): string => `${n < 0 ? '-' : '+'}$${Math.abs(n)}`;

/** Street dice: pick a bet and HIGH or LOW; the last throw and the session's net stay on screen. */
export class DiceUI extends Panel {
  private bet: number = DICE_BETS[0];
  private last: { dice: [number, number]; sum: number; net: number; line: string } | null = null;
  private sessionNet = 0;

  constructor(parent: HTMLElement, private api: GameAPI) {
    super('dice-panel', 'STREET DICE · BEHIND NEPTUNE ARCADE', parent);
  }

  open(): void {
    this.sessionNet = 0;
    this.last = null;
    super.open();
  }

  render(): void {
    const st = this.api.state;
    const body = this.body;
    body.innerHTML = `<div class="desc" style="margin-bottom:8px">HIGH wins on 8 or more, LOW on 6 or less, 7 is the house. Even money; snake eyes on LOW pays triple. Every throw draws a little heat.</div>
      <div class="row"><span class="name">Cash <b style="color:#7dff9a">$${Math.floor(st.cash)}</b></span><span class="price">tonight: <b style="color:${this.sessionNet >= 0 ? '#7dff9a' : '#ff8fa3'}">${money(this.sessionNet)}</b> · lifetime ${money(st.stats.diceNet ?? 0)}</span></div>
      <div class="pager-screen" style="font-size:40px;text-align:center;letter-spacing:8px;background:#0b3d1c;color:#f5f5f5;padding:10px 0">${this.last ? FACES[this.last.dice[0]] + FACES[this.last.dice[1]] : '⚅⚀'}</div>
      <div style="text-align:center;margin:6px 0 10px;color:#ffe9a8;min-height:18px">${this.last ? `${this.last.sum} · ${this.last.line} (${money(this.last.net)})` : 'Pick a bet, call it.'}</div>`;
    const bets = document.createElement('div');
    bets.className = 'pager-btns';
    for (const b of DICE_BETS) {
      const btn = document.createElement('button');
      btn.className = this.bet === b ? 'primary' : '';
      btn.textContent = `BET $${b}`;
      btn.addEventListener('click', () => { this.bet = b; this.api.sfx('chips'); this.render(); });
      bets.appendChild(btn);
    }
    body.appendChild(bets);
    const calls = document.createElement('div');
    calls.className = 'pager-btns';
    for (const pick of ['high', 'low'] as DicePick[]) {
      const btn = document.createElement('button');
      btn.className = 'cyan';
      btn.textContent = pick === 'high' ? 'CALL HIGH (8+)' : 'CALL LOW (6-)';
      btn.addEventListener('click', () => {
        const r = this.api.playDice(this.bet, pick);
        if (r.ok && r.dice) {
          this.last = { dice: r.dice, sum: r.sum!, net: r.net!, line: r.line! };
          this.sessionNet += r.net!;
        }
        this.render();
      });
      calls.appendChild(btn);
    }
    body.appendChild(calls);
  }
}
