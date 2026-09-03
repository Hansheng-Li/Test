import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { rollWorldEvent, shopPriceMultiplier, orderPriceMultiplier, heatMultiplier } from '../src/systems/EventSystem';
import { buyFromShop, shopPrice } from '../src/systems/EconomySystem';

describe('world events', () => {
  it('are deterministic per day and start on day 2', () => {
    const a = createNewState();
    const b = createNewState();
    expect(rollWorldEvent(a, 1)).toBeNull();
    for (let d = 2; d < 12; d++) {
      rollWorldEvent(a, d);
      rollWorldEvent(b, d);
      expect(a.event).toEqual(b.event);
    }
  });

  it('shortage doubles the supplier price for that supply only', () => {
    const s = createNewState();
    s.cash = 100;
    s.event = { id: 'shortage', day: 3, param: 'pulp_sunset' };
    expect(shopPriceMultiplier(s, 'pulp_sunset')).toBe(2);
    expect(shopPrice(s, 'supplier', 'pulp_sunset')).toBe(18);
    expect(shopPrice(s, 'supplier', 'wax_velvet')).toBe(14);
    buyFromShop(s, 'supplier', 'pulp_sunset', 1);
    expect(s.cash).toBe(82);
  });

  it('club night and crackdown multipliers apply to the right zone/time', () => {
    const s = createNewState();
    s.event = { id: 'club_night', day: 3 };
    expect(orderPriceMultiplier(s, 'beach', true)).toBe(1.3);
    expect(orderPriceMultiplier(s, 'beach', false)).toBe(1);
    expect(orderPriceMultiplier(s, 'downtown', true)).toBe(1);
    s.event = { id: 'crackdown', day: 3, param: 'docks' };
    expect(heatMultiplier(s, 'docks')).toBe(1.6);
    expect(heatMultiplier(s, 'beach')).toBe(1);
  });
});
