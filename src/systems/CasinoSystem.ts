import { GameState } from '../game/GameState';
import { addCash, spendCash } from './EconomySystem';

/** The back room behind Neptune Arcade: a blackjack table and one slot machine. */
export const BLACKJACK_BETS = [20, 50, 100, 200] as const;
export const BLACKJACK_MAX_BET = 200;
export const SLOT_BETS = [5, 20] as const;
/** Every hand or pull draws a little attention, like the dice outside. */
export const CASINO_HEAT = 1;

export interface Card {
  /** 1 = ace … 11 jack, 12 queen, 13 king. */
  rank: number;
  /** 0 spades, 1 hearts, 2 diamonds, 3 clubs. */
  suit: number;
}

export function cardLabel(c: Card): string {
  const r = c.rank === 1 ? 'A' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : String(c.rank);
  return r + '♠♥♦♣'[c.suit];
}

export function newDeck(rng: () => number = Math.random): Card[] {
  const deck: Card[] = [];
  for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Best blackjack total: aces count 11 while that does not bust. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 1) {
      aces++;
      total += 11;
    } else total += Math.min(10, c.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export type BlackjackOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface BlackjackHand {
  bet: number;
  deck: Card[];
  player: Card[];
  dealer: Card[];
  /** Set once the hand is settled; the dealer's hole card shows from then on. */
  outcome: BlackjackOutcome | null;
  /** Net cash change once settled. */
  net: number;
  doubled: boolean;
}

export interface BlackjackFail {
  ok: false;
  reason: 'no_cash' | 'bad_bet';
}

/** Deal a new hand: the bet leaves your pocket now; a natural pays 3:2 on the spot. */
export function startBlackjack(state: GameState, bet: number, rng: () => number = Math.random, deck: Card[] = newDeck(rng)): BlackjackHand | BlackjackFail {
  if (!Number.isFinite(bet) || bet < 1 || bet > BLACKJACK_MAX_BET || Math.floor(bet) !== bet) return { ok: false, reason: 'bad_bet' };
  if (!spendCash(state, bet)) return { ok: false, reason: 'no_cash' };
  const hand: BlackjackHand = { bet, deck, player: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!], outcome: null, net: -bet, doubled: false };
  if (handValue(hand.player).total === 21) settle(state, hand);
  return hand;
}

export function blackjackHit(state: GameState, hand: BlackjackHand): BlackjackHand {
  if (hand.outcome) return hand;
  hand.player.push(hand.deck.pop()!);
  if (handValue(hand.player).total > 21) settle(state, hand);
  return hand;
}

/** Double down on the first two cards: one more card, twice the bet, then stand. */
export function blackjackDouble(state: GameState, hand: BlackjackHand): BlackjackHand | BlackjackFail {
  if (hand.outcome || hand.player.length !== 2 || hand.doubled) return { ok: false, reason: 'bad_bet' };
  if (!spendCash(state, hand.bet)) return { ok: false, reason: 'no_cash' };
  hand.net -= hand.bet;
  hand.bet *= 2;
  hand.doubled = true;
  hand.player.push(hand.deck.pop()!);
  if (handValue(hand.player).total > 21) settle(state, hand);
  else blackjackStand(state, hand);
  return hand;
}

/** The dealer draws to 17 (standing on soft 17), then the hand is paid. */
export function blackjackStand(state: GameState, hand: BlackjackHand): BlackjackHand {
  if (hand.outcome) return hand;
  while (handValue(hand.dealer).total < 17) hand.dealer.push(hand.deck.pop()!);
  settle(state, hand);
  return hand;
}

function settle(state: GameState, hand: BlackjackHand): void {
  const p = handValue(hand.player).total;
  const d = handValue(hand.dealer).total;
  const natural = hand.player.length === 2 && p === 21 && !hand.doubled;
  let outcome: BlackjackOutcome;
  let back = 0;
  if (p > 21) outcome = 'bust';
  else if (natural && !(hand.dealer.length === 2 && d === 21)) {
    outcome = 'blackjack';
    back = Math.round(hand.bet * 2.5);
  } else if (d > 21 || p > d) {
    outcome = 'win';
    back = hand.bet * 2;
  } else if (p === d) {
    outcome = 'push';
    back = hand.bet;
  } else outcome = 'lose';
  if (back > 0) addCash(state, back);
  hand.net += back;
  hand.outcome = outcome;
  state.stats.casinoNet = (state.stats.casinoNet ?? 0) + hand.net;
  state.stats.casinoHands = (state.stats.casinoHands ?? 0) + 1;
  state.heat = Math.min(100, state.heat + CASINO_HEAT);
}

// ------------------------------------------------------------------ slots

export type SlotSymbol = '7' | 'BAR' | 'CHERRY' | 'PALM' | 'STAR' | 'SUN';
/** Reel strip: the weights are how often each symbol shows on one reel. */
export const SLOT_REEL: SlotSymbol[] = ['7', 'BAR', 'BAR', 'CHERRY', 'CHERRY', 'CHERRY', 'PALM', 'PALM', 'PALM', 'STAR', 'STAR', 'STAR', 'SUN', 'SUN', 'SUN', 'SUN'];

export interface SlotResult {
  ok: boolean;
  reason?: 'no_cash' | 'bad_bet';
  reels?: [SlotSymbol, SlotSymbol, SlotSymbol];
  /** Multiplier of the bet paid back (0 = lost). */
  mult?: number;
  net?: number;
  line?: string;
}

/** Payout in bets for a line: three sevens 50, three bars 20, any other triple 8, two sevens 4, cherries 1 each. */
export function slotPayout(reels: SlotSymbol[]): number {
  const [a, b, c] = reels;
  if (a === '7' && b === '7' && c === '7') return 50;
  if (a === 'BAR' && b === 'BAR' && c === 'BAR') return 20;
  if (a === b && b === c) return 8;
  const sevens = reels.filter((s) => s === '7').length;
  if (sevens === 2) return 4;
  return reels.filter((s) => s === 'CHERRY').length;
}

export function spinSlots(state: GameState, bet: number, rng: () => number = Math.random): SlotResult {
  if (!SLOT_BETS.includes(bet as (typeof SLOT_BETS)[number])) return { ok: false, reason: 'bad_bet' };
  if (!spendCash(state, bet)) return { ok: false, reason: 'no_cash' };
  const pick = (): SlotSymbol => SLOT_REEL[Math.floor(rng() * SLOT_REEL.length)];
  const reels: [SlotSymbol, SlotSymbol, SlotSymbol] = [pick(), pick(), pick()];
  const mult = slotPayout(reels);
  const back = bet * mult;
  if (back > 0) addCash(state, back);
  const net = back - bet;
  state.stats.casinoNet = (state.stats.casinoNet ?? 0) + net;
  state.stats.slotSpins = (state.stats.slotSpins ?? 0) + 1;
  state.heat = Math.min(100, state.heat + CASINO_HEAT);
  const line = mult >= 50 ? 'SUNSET SEVENS! JACKPOT!' : mult >= 20 ? 'Triple bar!' : mult >= 8 ? 'Three of a kind.' : mult === 4 ? 'Two sevens.' : mult > 0 ? 'Cherries.' : 'Nothing.';
  return { ok: true, reels, mult, net, line };
}

/** Expected return per bet of the slot machine (enumerated), for balance tests. */
export function slotExpectedReturn(): number {
  let total = 0;
  const n = SLOT_REEL.length;
  for (const a of SLOT_REEL) for (const b of SLOT_REEL) for (const c of SLOT_REEL) total += slotPayout([a, b, c]);
  return total / (n * n * n);
}
