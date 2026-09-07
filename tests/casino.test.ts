import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { handValue, newDeck, startBlackjack, blackjackHit, blackjackStand, blackjackDouble, spinSlots, slotPayout, slotExpectedReturn, BlackjackHand, Card } from '../src/systems/CasinoSystem';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('blackjack', () => {
  it('counts aces high until that busts', () => {
    expect(handValue([{ rank: 1, suit: 0 }, { rank: 13, suit: 0 }])).toEqual({ total: 21, soft: true });
    expect(handValue([{ rank: 1, suit: 0 }, { rank: 9, suit: 0 }, { rank: 5, suit: 0 }])).toEqual({ total: 15, soft: false });
    expect(handValue([{ rank: 1, suit: 0 }, { rank: 1, suit: 1 }])).toEqual({ total: 12, soft: true });
  });

  it('shuffles a full deck', () => {
    const d = newDeck(seq([0.3, 0.7, 0.1, 0.9]));
    expect(d).toHaveLength(52);
    expect(new Set(d.map((c) => c.rank * 10 + c.suit)).size).toBe(52);
  });

  // cards are dealt from the end of the deck: both player cards, then both dealer cards, then draws in order
  const deal = (p1: number, p2: number, d1: number, d2: number, ...rest: number[]): Card[] => [...rest.map((r) => ({ rank: r, suit: 2 })).reverse(), { rank: d2, suit: 1 }, { rank: d1, suit: 1 }, { rank: p2, suit: 0 }, { rank: p1, suit: 0 }];

  it('takes the bet on the deal and pays a win 1:1, a push back, a natural 3:2', () => {
    const s = createNewState();
    s.cash = 500;
    const h = startBlackjack(s, 100, () => 0.5, deal(10, 9, 10, 7)) as BlackjackHand;
    expect('ok' in h).toBe(false);
    expect(s.cash).toBe(400);
    blackjackStand(s, h);
    expect(h.outcome).toBe('win');
    expect(s.cash).toBe(600);
    expect(h.net).toBe(100);
    const p = startBlackjack(s, 50, () => 0.5, deal(10, 8, 10, 8)) as BlackjackHand;
    blackjackStand(s, p);
    expect(p.outcome).toBe('push');
    expect(s.cash).toBe(600);
    const n = startBlackjack(s, 100, () => 0.5, deal(1, 13, 9, 8)) as BlackjackHand;
    expect(n.outcome).toBe('blackjack');
    expect(s.cash).toBe(600 - 100 + 250);
    expect(s.stats.casinoHands).toBe(3);
    expect(s.stats.casinoNet).toBe(100 + 0 + 150);
  });

  it('busting loses the bet and the dealer draws to 17', () => {
    const s = createNewState();
    s.cash = 200;
    const h = startBlackjack(s, 100, () => 0.5, deal(10, 6, 10, 7, 9)) as BlackjackHand;
    blackjackHit(s, h);
    expect(h.outcome).toBe('bust');
    expect(s.cash).toBe(100);
    const d = startBlackjack(s, 50, () => 0.5, deal(10, 9, 6, 5, 2, 10)) as BlackjackHand; // dealer 11 draws 2 then 10 → 23
    blackjackStand(s, d);
    expect(handValue(d.dealer).total).toBeGreaterThan(21);
    expect(d.outcome).toBe('win');
  });

  it('double down costs a second bet and ends the hand', () => {
    const s = createNewState();
    s.cash = 100;
    const h = startBlackjack(s, 50, () => 0.5, deal(5, 6, 10, 7, 10)) as BlackjackHand;
    const r = blackjackDouble(s, h);
    expect('ok' in r).toBe(false);
    expect(h.bet).toBe(100);
    expect(h.outcome).toBe('win');
    expect(s.cash).toBe(200);
    expect(blackjackDouble(s, h)).toEqual({ ok: false, reason: 'bad_bet' });
    s.cash = 10;
    const poor = startBlackjack(s, 10, () => 0.5, deal(5, 6, 10, 7)) as BlackjackHand;
    expect(blackjackDouble(s, poor)).toEqual({ ok: false, reason: 'no_cash' });
  });

  it('refuses bad bets and empty pockets', () => {
    const s = createNewState();
    s.cash = 10;
    expect(startBlackjack(s, 50)).toEqual({ ok: false, reason: 'no_cash' });
    expect(startBlackjack(s, 7.5)).toEqual({ ok: false, reason: 'bad_bet' });
    expect(startBlackjack(s, 999)).toEqual({ ok: false, reason: 'bad_bet' });
  });
});

describe('slot machine', () => {
  it('pays the table', () => {
    expect(slotPayout(['7', '7', '7'])).toBe(50);
    expect(slotPayout(['BAR', 'BAR', 'BAR'])).toBe(20);
    expect(slotPayout(['PALM', 'PALM', 'PALM'])).toBe(8);
    expect(slotPayout(['7', 'STAR', '7'])).toBe(4);
    expect(slotPayout(['CHERRY', 'SUN', 'CHERRY'])).toBe(2);
    expect(slotPayout(['SUN', 'STAR', 'PALM'])).toBe(0);
  });

  it('is a money sink with a real chance to win: 80–97% return', () => {
    const rtp = slotExpectedReturn();
    expect(rtp).toBeGreaterThan(0.8);
    expect(rtp).toBeLessThan(0.97);
  });

  it('spins take the bet and pay back the multiplier', () => {
    const s = createNewState();
    s.cash = 100;
    const r = spinSlots(s, 20, () => 0); // reel index 0 = '7' on every reel
    expect(r.ok).toBe(true);
    expect(r.reels).toEqual(['7', '7', '7']);
    expect(r.net).toBe(20 * 49);
    expect(s.cash).toBe(80 + 1000);
    expect(spinSlots(s, 13)).toEqual({ ok: false, reason: 'bad_bet' });
    s.cash = 3;
    expect(spinSlots(s, 5)).toEqual({ ok: false, reason: 'no_cash' });
  });
});
