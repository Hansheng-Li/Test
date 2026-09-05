import { GameState } from '../game/GameState';
import { addCash } from './EconomySystem';

export interface Milestone {
  id: string;
  title: string;
  hint: string;
  reward: number;
  done: (s: GameState) => boolean;
}

/** Short, readable goals that teach the progression loop and pay a little seed money. */
export const MILESTONES: Milestone[] = [
  { id: 'first_sale', title: 'First Sale', hint: 'Complete a pager order.', reward: 25, done: (s) => s.stats.sales >= 1 },
  { id: 'named', title: 'Brand Name', hint: 'Give a product a street name.', reward: 20, done: (s) => Object.values(s.recipes).some((r) => !!r.customName) },
  { id: 'mixed', title: 'Chemist', hint: 'Prep a product with two modifiers.', reward: 60, done: (s) => Object.values(s.recipes).some((r) => r.mods.length >= 2) },
  { id: 'combo', title: 'Signature Blend', hint: 'Discover a named combo (e.g. Beach Party).', reward: 100, done: (s) => Object.values(s.recipes).some((r) => !!r.comboName) },
  { id: 'five_customers', title: 'People Person', hint: 'Have 6 unlocked customers.', reward: 80, done: (s) => Object.values(s.customers).filter((c) => c.unlocked).length >= 6 },
  { id: 'regular', title: 'Regular', hint: 'Reach relationship 15 with any customer.', reward: 60, done: (s) => Object.values(s.customers).some((c) => c.relationship >= 15) },
  { id: 'street', title: 'Corner Hustle', hint: 'Make a street deal with a walking customer.', reward: 30, done: (s) => s.orders.some((o) => o.locationId === 'street' && o.status === 'completed') },
  { id: 'equipment', title: 'Better Tools', hint: 'Buy any equipment at the pawn shop.', reward: 50, done: (s) => s.upgrades.length >= 1 },
  { id: 'runner', title: 'Delegation', hint: 'Hire Dizzy and let him deliver.', reward: 150, done: (s) => !!s.runner?.hired && s.runner.deliveries >= 1 },
  { id: 'warehouse', title: 'Real Estate', hint: 'Buy Warehouse 7.', reward: 200, done: (s) => s.properties.includes('warehouse') },
  { id: 'worker', title: 'Production Line', hint: 'Marisol produces 5 units for you.', reward: 200, done: (s) => (s.worker?.produced ?? 0) >= 5 },
  { id: 'dealer', title: 'Network', hint: 'Vince makes 5 sales on his corner.', reward: 250, done: (s) => (s.dealer?.sales ?? 0) >= 5 },
  { id: 'handler', title: 'Supply Chain', hint: 'Teddy carries 20 units to Vince for you.', reward: 300, done: (s) => (s.handler?.moved ?? 0) >= 20 },
  { id: 'outrun', title: 'Burnt Rubber', hint: 'Lose a cruiser that is chasing the sedan.', reward: 60, done: (s) => !!s.flags.lostCruiser },
  { id: 'escape', title: 'Clean Getaway', hint: 'Get searched by police while carrying nothing.', reward: 40, done: (s) => !!s.flags.cleanSearch },
  { id: 'dumpster', title: 'Trash Panda', hint: 'Hide in a dumpster.', reward: 20, done: (s) => !!s.flags.hidDumpster },
  { id: 'dice', title: 'Hot Hand', hint: 'Be $200 up at street dice, lifetime.', reward: 50, done: (s) => (s.stats.diceNet ?? 0) >= 200 },
  { id: 'bus', title: 'Commuter', hint: 'Ride the Sol Palma Transit bus.', reward: 20, done: (s) => (s.stats.busRides ?? 0) >= 1 },
  { id: 'marker', title: 'Good for It', hint: 'Pay off a pawn shop marker.', reward: 60, done: (s) => (s.stats.loansRepaid ?? 0) >= 1 },
  { id: 'respray', title: 'New Coat', hint: 'Get the sedan resprayed at Rojas.', reward: 30, done: (s) => (s.stats.resprays ?? 0) >= 1 },
  { id: 'ten_k', title: 'Sunset Syndicate', hint: 'Earn $10,000 lifetime.', reward: 500, done: (s) => s.stats.earned >= 10000 },
];

/** Award newly completed milestones; returns them. Idempotent thanks to state.flags. */
export function checkMilestones(state: GameState): Milestone[] {
  const out: Milestone[] = [];
  for (const m of MILESTONES) {
    const key = 'ms_' + m.id;
    if (state.flags[key]) continue;
    if (m.done(state)) {
      state.flags[key] = true;
      addCash(state, m.reward);
      out.push(m);
    }
  }
  return out;
}

export function milestoneDone(state: GameState, id: string): boolean {
  return !!state.flags['ms_' + id];
}
