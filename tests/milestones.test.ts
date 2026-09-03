import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { checkMilestones, MILESTONES } from '../src/systems/MilestoneSystem';
import { computeRecipe } from '../src/data/products';

describe('milestones', () => {
  it('awards each milestone once with its cash reward', () => {
    const s = createNewState();
    expect(checkMilestones(s)).toHaveLength(0);
    s.stats.sales = 1;
    const cash = s.cash;
    const done = checkMilestones(s);
    expect(done.map((m) => m.id)).toEqual(['first_sale']);
    expect(s.cash).toBe(cash + 25);
    expect(checkMilestones(s)).toHaveLength(0);
    s.recipes['SUNSET+mod_velvet_drops+mod_solar'] = { ...computeRecipe('SUNSET', ['mod_velvet_drops', 'mod_solar']), customName: 'BEACH BOMB' };
    const ids = checkMilestones(s).map((m) => m.id).sort();
    expect(ids).toEqual(['combo', 'mixed', 'named']);
    expect(MILESTONES.every((m) => m.reward > 0)).toBe(true);
  });
});
