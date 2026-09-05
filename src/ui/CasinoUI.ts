import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { t, tn } from '../i18n';
import { BLACKJACK_BETS, SLOT_BETS, BlackjackHand, SlotSymbol, handValue, cardLabel, slotPayout } from '../systems/CasinoSystem';

const money = (n: number): string => (n >= 0 ? '+$' : '-$') + Math.abs(n);
const SYMBOL: Record<SlotSymbol, string> = { '7': '7', BAR: 'BAR', CHERRY: '🍒', PALM: '🌴', STAR: '⭐', SUN: '☀' };

/** Neptune's back room: a blackjack table and the Sunset Sevens slot machine. */
export class CasinoUI extends Panel {
  tab: 'blackjack' | 'slots' = 'blackjack';
  private bet: number = BLACKJACK_BETS[0];
  private slotBet: number = SLOT_BETS[0];
  private hand: BlackjackHand | null = null;
  private reels: SlotSymbol[] = ['7', 'BAR', 'CHERRY'];
  private slotLine = '';
  private sessionNet = 0;
  private spinning = false;

  constructor(parent: HTMLElement, private api: GameAPI) {
    super('casino-panel', 'NEPTUNE BACK ROOM', parent);
  }

  open(): void {
    this.sessionNet = 0;
    this.hand = null;
    this.slotLine = '';
    super.open();
  }

  onKey(code: string): boolean {
    if (this.tab === 'blackjack' && this.hand && !this.hand.outcome) {
      if (code === 'KeyH') { this.hit(); return true; }
      if (code === 'KeyS') { this.stand(); return true; }
    }
    if (code === 'Space' && this.tab === 'slots' && !this.spinning) { this.spin(); return true; }
    return false;
  }

  private hit(): void {
    if (!this.hand) return;
    this.hand = this.api.blackjackHit(this.hand);
    this.afterHand();
  }

  private stand(): void {
    if (!this.hand) return;
    this.hand = this.api.blackjackStand(this.hand);
    this.afterHand();
  }

  private afterHand(): void {
    if (this.hand?.outcome) this.sessionNet += this.hand.net;
    this.render();
  }

  private spin(): void {
    const r = this.api.spinSlots(this.slotBet);
    if (!r.ok || !r.reels) {
      this.render();
      return;
    }
    this.spinning = true;
    this.slotLine = '';
    this.render();
    const final = r.reels;
    // the reels tumble for a moment before landing
    let ticks = 0;
    const tick = window.setInterval(() => {
      ticks++;
      const rnd = (): SlotSymbol => (['7', 'BAR', 'CHERRY', 'PALM', 'STAR', 'SUN'] as SlotSymbol[])[Math.floor(Math.random() * 6)];
      this.reels = [ticks > 4 ? final[0] : rnd(), ticks > 7 ? final[1] : rnd(), ticks > 10 ? final[2] : rnd()];
      this.api.sfx('tick');
      this.render();
      if (ticks > 10) {
        window.clearInterval(tick);
        this.spinning = false;
        this.reels = [...final];
        this.slotLine = `${tn(r.line ?? '')} (${money(r.net ?? 0)})`;
        this.sessionNet += r.net ?? 0;
        if ((r.mult ?? 0) > 0) this.api.sfx('collect');
        this.render();
      }
    }, 90);
  }

  render(): void {
    const st = this.api.state;
    const body = this.body;
    body.innerHTML = '';
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    for (const [id, label] of [['blackjack', 'BLACKJACK'], ['slots', 'SUNSET SEVENS (SLOTS)']] as const) {
      tabs.appendChild(this.button(t(label), () => { this.tab = id; this.render(); }, this.tab === id ? 'active' : ''));
    }
    body.appendChild(tabs);
    const top = document.createElement('div');
    top.className = 'row';
    top.innerHTML = `<span class="name">${t('Cash {cash}', { cash: `<b style="color:#7dff9a">$${Math.floor(st.cash)}</b>` })}</span><span class="price">${t('tonight: {net} · lifetime {total}', { net: `<b style="color:${this.sessionNet >= 0 ? '#7dff9a' : '#ff8fa3'}">${money(this.sessionNet)}</b>`, total: money(st.stats.casinoNet ?? 0) })}</span>`;
    body.appendChild(top);
    if (this.tab === 'blackjack') this.renderBlackjack(body);
    else this.renderSlots(body);
  }

  private cards(cards: { rank: number; suit: number }[], hideSecond: boolean): string {
    return cards.map((c, i) => `<span class="card${c.suit === 1 || c.suit === 2 ? ' red' : ''}${hideSecond && i === 1 ? ' back' : ''}">${hideSecond && i === 1 ? '?' : cardLabel(c)}</span>`).join('');
  }

  private renderBlackjack(body: HTMLElement): void {
    const h = this.hand;
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.style.marginBottom = '8px';
    desc.textContent = t('Beat the dealer without going over 21. Dealer draws to 17. Blackjack pays 3 to 2, double down on your first two cards. H hits, S stands. The house keeps an eye on you.');
    body.appendChild(desc);
    const table = document.createElement('div');
    table.className = 'felt';
    const hidden = !!h && !h.outcome;
    const dealerTotal = h ? (hidden ? handValue([h.dealer[0]]).total : handValue(h.dealer).total) : 0;
    table.innerHTML = h
      ? `<div class="seat"><span class="who">${t('DEALER')} · ${dealerTotal}${hidden ? '+' : ''}</span><div class="hand">${this.cards(h.dealer, hidden)}</div></div>
         <div class="seat"><span class="who">${t('YOU')} · ${handValue(h.player).total}${handValue(h.player).soft ? ` (${t('soft')})` : ''}</span><div class="hand">${this.cards(h.player, false)}</div></div>
         <div class="result">${h.outcome ? `${t(OUTCOME[h.outcome])} (${money(h.net)})` : ''}</div>`
      : `<div class="result">${t('Place a bet and deal.')}</div>`;
    body.appendChild(table);
    const bets = document.createElement('div');
    bets.className = 'pager-btns';
    for (const b of BLACKJACK_BETS) {
      const btn = this.button(t('BET ${n}', { n: b }), () => { this.bet = b; this.api.sfx('chips'); this.render(); }, this.bet === b ? 'primary' : '');
      btn.disabled = !!h && !h.outcome;
      bets.appendChild(btn);
    }
    body.appendChild(bets);
    const actions = document.createElement('div');
    actions.className = 'pager-btns';
    if (!h || h.outcome) {
      actions.appendChild(this.button(t('DEAL'), () => { const r = this.api.blackjackDeal(this.bet); if (r) { this.hand = r; if (r.outcome) this.sessionNet += r.net; } this.render(); }, 'primary'));
    } else {
      actions.appendChild(this.button(t('HIT (H)'), () => this.hit(), 'cyan'));
      actions.appendChild(this.button(t('STAND (S)'), () => this.stand(), 'cyan'));
      if (h.player.length === 2 && !h.doubled) actions.appendChild(this.button(t('DOUBLE DOWN'), () => { const r = this.api.blackjackDouble(h); if (r) this.hand = r; this.afterHand(); }));
    }
    body.appendChild(actions);
  }

  private renderSlots(body: HTMLElement): void {
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.style.marginBottom = '8px';
    desc.textContent = t('Three reels. 7-7-7 pays 50x, three bars 20x, any other three of a kind 8x, two sevens 4x, each cherry 1x. Space pulls the arm.');
    body.appendChild(desc);
    const machine = document.createElement('div');
    machine.className = 'slots';
    machine.innerHTML = this.reels.map((s) => `<span class="reel${s === '7' ? ' seven' : ''}">${SYMBOL[s]}</span>`).join('') + `<div class="result">${this.slotLine || (this.spinning ? '…' : t('Pick a bet, pull the arm.'))}</div>`;
    body.appendChild(machine);
    const bets = document.createElement('div');
    bets.className = 'pager-btns';
    for (const b of SLOT_BETS) {
      const btn = this.button(t('BET ${n}', { n: b }), () => { this.slotBet = b; this.api.sfx('chips'); this.render(); }, this.slotBet === b ? 'primary' : '');
      btn.disabled = this.spinning;
      bets.appendChild(btn);
    }
    const spin = this.button(t('SPIN (SPACE)'), () => this.spin(), 'cyan');
    spin.disabled = this.spinning;
    bets.appendChild(spin);
    body.appendChild(bets);
    const pay = document.createElement('div');
    pay.className = 'meta';
    pay.style.marginTop = '8px';
    pay.innerHTML = [['7', '7', '7'], ['BAR', 'BAR', 'BAR'], ['PALM', 'PALM', 'PALM'], ['7', '7', 'STAR'], ['CHERRY', 'SUN', 'STAR']].map((r) => `${r.map((s) => SYMBOL[s as SlotSymbol]).join(' ')} → ×${slotPayout(r as SlotSymbol[])}`).join(' · ');
    body.appendChild(pay);
  }
}

const OUTCOME: Record<string, string> = { blackjack: 'BLACKJACK! Pays 3 to 2.', win: 'You win.', push: 'Push. Bet back.', lose: 'Dealer wins.', bust: 'Bust.' };
