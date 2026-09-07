import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { addItem } from '../src/systems/InventorySystem';
import { storyStep, ordersAllowed, claimStoryCard, markStorySeen, prologueActive, STORY_STEPS } from '../src/systems/StorySystem';
import { STORY_CARDS } from '../src/data/story';

describe('chapter one pacing', () => {
  it('walks box → prep → pack → page → deliver → restock → second → done from the state alone', () => {
    const s = createNewState();
    expect(storyStep(s)).toBe('box');
    expect(ordersAllowed(s)).toBe(false);
    s.flags.starterTaken = true;
    expect(storyStep(s)).toBe('prep');
    addItem(s, 'prod:SUNSET', 3);
    expect(storyStep(s)).toBe('pack');
    expect(ordersAllowed(s)).toBe(false);
    addItem(s, 'pkg:SUNSET', 3);
    expect(storyStep(s)).toBe('page');
    expect(ordersAllowed(s)).toBe(true);
    s.flags.firstOrderSent = true;
    expect(storyStep(s)).toBe('deliver');
    expect(ordersAllowed(s)).toBe(false);
    s.stats.sales = 1;
    expect(storyStep(s)).toBe('restock');
    expect(ordersAllowed(s)).toBe(false);
    s.flags.boughtFromRico = true;
    expect(storyStep(s)).toBe('second');
    expect(ordersAllowed(s)).toBe(true);
    s.stats.sales = 2;
    expect(storyStep(s)).toBe('done');
    expect(prologueActive(s)).toBe(false);
  });

  it('bagged product on a shelf counts as ready for the first page', () => {
    const s = createNewState();
    s.flags.starterTaken = true;
    s.storage.safehouse = [{ id: 'pkg:SUNSET', qty: 2 }];
    expect(storyStep(s)).toBe('page');
  });

  it('a street sale before any page still moves the story on', () => {
    const s = createNewState();
    s.flags.starterTaken = true;
    s.stats.sales = 1;
    expect(storyStep(s)).toBe('restock');
  });

  it('hands out each card once and never twice', () => {
    const s = createNewState();
    expect(claimStoryCard(s)).toBe('box');
    expect(claimStoryCard(s)).toBeNull();
    s.flags.starterTaken = true;
    expect(claimStoryCard(s)).toBe('prep');
    expect(claimStoryCard(s)).toBeNull();
  });

  it('markStorySeen silences every card, including chapter end', () => {
    const s = createNewState();
    markStorySeen(s);
    for (const step of STORY_STEPS) expect(s.flags['story_' + step]).toBe(true);
    expect(claimStoryCard(s)).toBeNull();
  });

  it('every card step is a real story step and every card has text', () => {
    for (const [step, cards] of Object.entries(STORY_CARDS)) {
      expect(STORY_STEPS).toContain(step);
      for (const c of cards) {
        expect(c.lines.length).toBeGreaterThan(0);
        expect(c.speaker.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('chapter-one checklist', () => {
  it('marks earlier steps done, the current one now, the rest next', async () => {
    const { storyChecklist } = await import('../src/systems/StorySystem');
    const { STORY_STEP_LABELS } = await import('../src/data/story');
    const s = createNewState();
    s.flags.starterTaken = true;
    addItem(s, 'prod:SUNSET', 2);
    const list = storyChecklist(s);
    expect(list.map((c) => c.step)).toEqual(['box', 'prep', 'pack', 'page', 'deliver', 'restock', 'second']);
    expect(list.map((c) => c.state)).toEqual(['done', 'done', 'now', 'next', 'next', 'next', 'next']);
    for (const c of list) expect(STORY_STEP_LABELS[c.step]).toBeTruthy();
    s.stats.sales = 5;
    s.flags.boughtFromRico = true;
    expect(storyChecklist(s).every((c) => c.state === 'done')).toBe(true);
  });
});
