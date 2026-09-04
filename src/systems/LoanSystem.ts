import { GameState, LoanState } from '../game/GameState';
import { addCash, spendCash } from './EconomySystem';

/** Marker sizes the pawn shop writes; bigger ones need a track record. */
export const LOAN_TIERS = [300, 800, 1500] as const;
export const LOAN_INTEREST = 0.25;
/** Days until the marker is due (due by the end of takenDay + LOAN_DAYS). */
export const LOAN_DAYS = 3;
/** Every overdue day the balance grows by this much and the collectors visit. */
export const LOAN_LATE_INTEREST = 0.2;
/** The balance never grows past this multiple of the principal: a debt spiral is a soft-lock. */
export const LOAN_CAP_MULT = 3;
export const LOAN_LATE_HEAT = 10;
/** Suspicion per overdue day: heat decays, a reputation for not paying does not. */
export const LOAN_LATE_SUSPICION = 6;
/** Collectors leave bus fare and baggie money so a broke player can still work. */
export const LOAN_KEEP_CASH = 30;

export type LoanRefusal = 'active' | 'locked' | 'unknown';

/** A $300 marker is always on offer; $800 needs $1,000 earned lifetime; $1,500 needs Warehouse 7. */
export function loanTierAvailable(state: GameState, amount: number): boolean {
  if (amount === 300) return true;
  if (amount === 800) return state.stats.earned >= 1000;
  if (amount === 1500) return state.properties.includes('warehouse');
  return false;
}

export function takeLoan(state: GameState, amount: number, day: number): { ok: boolean; reason?: LoanRefusal; owed?: number } {
  if (!(LOAN_TIERS as readonly number[]).includes(amount)) return { ok: false, reason: 'unknown' };
  if (state.loan) return { ok: false, reason: 'active' };
  if (!loanTierAvailable(state, amount)) return { ok: false, reason: 'locked' };
  const owed = Math.round(amount * (1 + LOAN_INTEREST));
  state.loan = { principal: amount, owed, takenDay: day, dueDay: day + LOAN_DAYS, lateDays: 0 };
  addCash(state, amount);
  state.stats.loansTaken = (state.stats.loansTaken ?? 0) + 1;
  return { ok: true, owed };
}

/** Pay down the marker with cash on hand. Returns the amount actually paid; clears the loan at zero. */
export function repayLoan(state: GameState, amount: number): number {
  const loan = state.loan;
  if (!loan) return 0;
  const pay = Math.max(0, Math.min(Math.floor(amount), loan.owed, Math.floor(state.cash)));
  if (pay <= 0) return 0;
  spendCash(state, pay);
  loan.owed -= pay;
  if (loan.owed <= 0) {
    state.loan = null;
    state.stats.loansRepaid = (state.stats.loansRepaid ?? 0) + 1;
  }
  return pay;
}

/** Days until the marker is due (0 = due today, negative = overdue). */
export function loanDaysLeft(loan: LoanState, day: number): number {
  return loan.dueDay - day;
}

export interface LoanDayResult {
  /** The marker is due today. */
  dueToday?: boolean;
  /** Late interest was added (new balance) and the street heard about it. */
  late?: { owed: number; heat: number };
  /** Cash the collectors took. */
  collected?: number;
  /** The collectors closed the marker. */
  cleared?: boolean;
}

/**
 * Runs once per calendar day. Overdue markers grow by LOAN_LATE_INTEREST (capped),
 * add heat and suspicion because the collectors ask around, and the collectors take
 * whatever cash is on hand above LOAN_KEEP_CASH, then whatever Vince is holding.
 */
export function tickLoanDay(state: GameState, day: number): LoanDayResult {
  const loan = state.loan;
  const out: LoanDayResult = {};
  if (!loan) return out;
  if (day === loan.dueDay) {
    out.dueToday = true;
    return out;
  }
  if (day <= loan.dueDay) return out;
  loan.lateDays += 1;
  loan.owed = Math.min(Math.round(loan.owed * (1 + LOAN_LATE_INTEREST)), loan.principal * LOAN_CAP_MULT);
  state.heat = Math.min(100, state.heat + LOAN_LATE_HEAT);
  state.suspicion = Math.min(100, state.suspicion + LOAN_LATE_SUSPICION);
  out.late = { owed: loan.owed, heat: LOAN_LATE_HEAT };
  // pocket first, then whatever Vince is holding: the collectors know where the corner is
  let take = Math.max(0, Math.min(Math.floor(state.cash) - LOAN_KEEP_CASH, loan.owed));
  if (take > 0) spendCash(state, take);
  if (state.dealer?.hired && loan.owed - take > 0 && state.dealer.cash > 0) {
    const fromVince = Math.min(Math.floor(state.dealer.cash), loan.owed - take);
    state.dealer.cash -= fromVince;
    take += fromVince;
  }
  if (take > 0) {
    loan.owed -= take;
    out.collected = take;
    if (loan.owed <= 0) {
      state.loan = null;
      out.cleared = true;
      state.stats.loansRepaid = (state.stats.loansRepaid ?? 0) + 1;
    }
  }
  return out;
}
