import { describe, it, expect } from 'vitest';
import { createNewState, serialize, deserialize } from '../src/systems/SaveSystem';
import { takeLoan, repayLoan, tickLoanDay, loanTierAvailable, LOAN_CAP_MULT, LOAN_KEEP_CASH } from '../src/systems/LoanSystem';
import { checkMilestones } from '../src/systems/MilestoneSystem';
import { hireDealer } from '../src/systems/DealerSystem';

describe('pawn shop marker', () => {
  it('lends cash at 25% and only one marker at a time', () => {
    const s = createNewState();
    s.cash = 10;
    const r = takeLoan(s, 300, 1);
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(310);
    expect(s.loan).toEqual({ principal: 300, owed: 375, takenDay: 1, dueDay: 4, lateDays: 0 });
    expect(takeLoan(s, 300, 1).reason).toBe('active');
    expect(takeLoan(s, 250, 1).reason).toBe('unknown');
  });

  it('bigger markers need a track record', () => {
    const s = createNewState();
    expect(loanTierAvailable(s, 800)).toBe(false);
    expect(takeLoan(s, 800, 1).reason).toBe('locked');
    s.stats.earned = 1000;
    expect(loanTierAvailable(s, 800)).toBe(true);
    expect(loanTierAvailable(s, 1500)).toBe(false);
    s.properties.push('warehouse');
    expect(loanTierAvailable(s, 1500)).toBe(true);
  });

  it('repays in parts, never more than cash on hand, and pays a milestone', () => {
    const s = createNewState();
    s.cash = 0;
    takeLoan(s, 300, 1);
    expect(repayLoan(s, 100)).toBe(100);
    expect(s.loan!.owed).toBe(275);
    s.cash = 50;
    expect(repayLoan(s, 999)).toBe(50);
    expect(s.loan!.owed).toBe(225);
    expect(repayLoan(s, -5)).toBe(0);
    s.cash = 1000;
    expect(repayLoan(s, 225)).toBe(225);
    expect(s.loan).toBeNull();
    expect(s.cash).toBe(775);
    expect(checkMilestones(s).map((m) => m.id)).toContain('marker');
  });

  it('is quiet before the due day and warns on it', () => {
    const s = createNewState();
    takeLoan(s, 300, 1);
    expect(tickLoanDay(s, 2)).toEqual({});
    expect(tickLoanDay(s, 3)).toEqual({});
    expect(tickLoanDay(s, 4).dueToday).toBe(true);
    expect(s.loan!.owed).toBe(375);
    expect(s.heat).toBe(0);
  });

  it('overdue: late interest, heat, collectors take cash but leave bus fare', () => {
    const s = createNewState();
    s.cash = 0;
    takeLoan(s, 300, 1);
    s.cash = 200;
    const r = tickLoanDay(s, 5);
    expect(r.late?.owed).toBe(450);
    expect(s.heat).toBe(10);
    expect(s.suspicion).toBe(6);
    expect(r.collected).toBe(200 - LOAN_KEEP_CASH);
    expect(s.cash).toBe(LOAN_KEEP_CASH);
    expect(s.loan!.owed).toBe(450 - 170);
    expect(s.loan!.lateDays).toBe(1);
    // flush with cash the next day: the collectors close the marker
    s.cash = 5000;
    const r2 = tickLoanDay(s, 6);
    expect(r2.cleared).toBe(true);
    expect(r2.collected).toBe(Math.round(280 * 1.2));
    expect(s.loan).toBeNull();
  });

  it('a broke player is never buried: the balance caps at 3x principal and cash never goes below the floor', () => {
    const s = createNewState();
    s.cash = 0;
    takeLoan(s, 300, 1);
    s.cash = 20;
    for (let day = 5; day < 40; day++) tickLoanDay(s, day);
    expect(s.loan!.owed).toBe(300 * LOAN_CAP_MULT);
    expect(s.cash).toBe(20);
    expect(s.heat).toBe(100);
  });

  it('survives a save round trip and repairs junk', () => {
    const s = createNewState();
    takeLoan(s, 300, 1); // the fresh clock is day 1: a marker taken today is due on day 4
    const loaded = deserialize(serialize(s))!;
    expect(loaded.loan).toEqual(s.loan);
    const junk = deserialize(JSON.stringify({ cash: 1, inventory: [], loan: { principal: 'x', owed: 50 } }))!;
    expect(junk.loan).toBeNull();
    const partial = deserialize(JSON.stringify({ cash: 1, inventory: [], loan: { principal: 300, owed: 200, dueDay: 7 } }))!;
    // a due day past three days from now is pulled in; a fractional balance rounds up instead of becoming a $0 zombie
    expect(partial.loan).toEqual({ principal: 300, owed: 200, takenDay: 1, dueDay: 4, lateDays: 0 });
    const frac = deserialize(JSON.stringify({ cash: 1, inventory: [], loan: { principal: 300, owed: 0.5, dueDay: 2 } }))!;
    expect(frac.loan!.owed).toBe(1);
    const huge = deserialize(JSON.stringify({ cash: 1, inventory: [], loan: { principal: 1e308, owed: 1e308, dueDay: 1 } }))!;
    expect(huge.loan).toEqual({ principal: 1500, owed: 4500, takenDay: -2, dueDay: 1, lateDays: 0 });
    const paid = deserialize(JSON.stringify({ cash: 1, inventory: [], loan: { principal: 300, owed: 0, dueDay: 7 } }))!;
    expect(paid.loan).toBeNull();
  });
});

describe('marker collectors and the corner', () => {
  it('take what Vince is holding when your pockets are empty', () => {
    const s = createNewState();
    s.cash = 2000;
    hireDealer(s, 1000);
    takeLoan(s, 300, 1);
    s.cash = 10;
    s.dealer!.cash = 500;
    const r = tickLoanDay(s, 5);
    expect(r.collected).toBe(450);
    expect(r.cleared).toBe(true);
    expect(s.dealer!.cash).toBe(50);
    expect(s.cash).toBe(10);
  });

  it('a save cannot park Teddy or Vince in the future', () => {
    const s = deserialize(JSON.stringify({ cash: 1, inventory: [], clockMinutes: 5000, handler: { hired: true, lastTickMinute: 1e12 }, dealer: { hired: true, lastTickMinute: 1e12 } }))!;
    expect(s.handler!.lastTickMinute).toBe(5000);
    expect(s.dealer!.lastTickMinute).toBe(5000);
  });
});
