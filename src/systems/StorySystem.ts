import { GameState } from '../game/GameState';
import { packagedInInventory, looseProductsInInventory } from './InventorySystem';

/**
 * Chapter one pacing. The step is derived from the state, never stored, so old saves and
 * street sales fall into the right place; "seen" flags only track which cards have played.
 *
 * box → prep → pack → page → deliver → restock → second → done
 */
export const STORY_STEPS = ['box', 'prep', 'pack', 'page', 'deliver', 'restock', 'second', 'done'] as const;
export type StoryStep = (typeof STORY_STEPS)[number];

const packagedInStorage = (s: GameState): boolean => Object.values(s.storage).some((items) => items.some((i) => i.id.startsWith('pkg:')));

export function storyStep(s: GameState): StoryStep {
  if (!s.flags.starterTaken) return 'box';
  if (s.stats.sales === 0) {
    if (s.flags.firstOrderSent) return 'deliver';
    if (packagedInInventory(s).length > 0 || packagedInStorage(s)) return 'page';
    if (looseProductsInInventory(s).length > 0) return 'pack';
    return 'prep';
  }
  if (!s.flags.boughtFromRico) return 'restock';
  if (s.stats.sales < 2) return 'second';
  return 'done';
}

export function prologueActive(s: GameState): boolean {
  return storyStep(s) !== 'done';
}

/** Whether the pager may hand out a new order right now. Chapter one paces pages by hand. */
export function ordersAllowed(s: GameState): boolean {
  const step = storyStep(s);
  return step === 'page' || step === 'second' || step === 'done';
}

export const storyFlag = (step: StoryStep): string => 'story_' + step;

/** Claims the card for the current step: returns it the first time the step is reached, then null. */
export function claimStoryCard(s: GameState): StoryStep | null {
  const step = storyStep(s);
  const key = storyFlag(step);
  if (s.flags[key]) return null;
  s.flags[key] = true;
  return step;
}

/** Mark every card as played (for saves that are already past chapter one). */
export function markStorySeen(s: GameState): void {
  for (const step of STORY_STEPS) s.flags[storyFlag(step)] = true;
}
