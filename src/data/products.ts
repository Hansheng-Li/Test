/**
 * Fictional product chemistry. Everything here is abstract game logic:
 * base + ordered modifiers -> effect tags + value multiplier. No real-world meaning.
 */
export type Effect = 'ENERGY' | 'CHILL' | 'SOCIAL' | 'FOCUS' | 'DREAMY' | 'CONFIDENT' | 'CHAOTIC' | 'GLOW';
export const ALL_EFFECTS: Effect[] = ['ENERGY', 'CHILL', 'SOCIAL', 'FOCUS', 'DREAMY', 'CONFIDENT', 'CHAOTIC', 'GLOW'];
export type BaseId = 'SUNSET' | 'VELVET' | 'NEON';

export interface BaseProduct {
  id: BaseId;
  name: string;
  supplyItem: string;
  effects: Effect[];
  baseValue: number;
  color: string;
}

export interface Modifier {
  id: string;
  name: string;
  adds: Effect;
  transforms: Partial<Record<Effect, Effect>>;
  valueMult: number;
}

export const BASES: Record<BaseId, BaseProduct> = {
  SUNSET: { id: 'SUNSET', name: 'SUNSET', supplyItem: 'pulp_sunset', effects: ['ENERGY'], baseValue: 24, color: '#ff9a3c' },
  VELVET: { id: 'VELVET', name: 'VELVET', supplyItem: 'wax_velvet', effects: ['CHILL'], baseValue: 34, color: '#b388ff' },
  NEON: { id: 'NEON', name: 'NEON', supplyItem: 'gel_neon', effects: ['GLOW'], baseValue: 46, color: '#4ff2e8' },
};

export const MODIFIERS: Record<string, Modifier> = {
  mod_flux: { id: 'mod_flux', name: 'Flux Chips', adds: 'ENERGY', transforms: { CHILL: 'FOCUS', DREAMY: 'CHAOTIC' }, valueMult: 1.25 },
  mod_velvet_drops: { id: 'mod_velvet_drops', name: 'Velvet Drops', adds: 'CHILL', transforms: { ENERGY: 'SOCIAL', CHAOTIC: 'DREAMY' }, valueMult: 1.3 },
  mod_solar: { id: 'mod_solar', name: 'Solar Tabs', adds: 'CONFIDENT', transforms: { CHILL: 'SOCIAL', GLOW: 'ENERGY' }, valueMult: 1.35 },
  mod_static: { id: 'mod_static', name: 'Static Dust', adds: 'CHAOTIC', transforms: { CHILL: 'DREAMY', FOCUS: 'ENERGY' }, valueMult: 1.4 },
  mod_sparks: { id: 'mod_sparks', name: 'Blue Sparks', adds: 'FOCUS', transforms: { CHAOTIC: 'FOCUS', DREAMY: 'GLOW' }, valueMult: 1.45 },
  mod_glow: { id: 'mod_glow', name: 'Glow Powder', adds: 'GLOW', transforms: { ENERGY: 'DREAMY', SOCIAL: 'GLOW' }, valueMult: 1.5 },
};

/** Named combos: matching effect sets earn a bonus and a default street name. */
export const COMBOS: { name: string; effects: Effect[]; bonus: number }[] = [
  { name: 'Beach Party', effects: ['SOCIAL', 'CONFIDENT'], bonus: 0.25 },
  { name: 'Night Shift', effects: ['ENERGY', 'FOCUS'], bonus: 0.2 },
  { name: 'Lava Lamp', effects: ['DREAMY', 'GLOW'], bonus: 0.3 },
  { name: 'Hurricane', effects: ['ENERGY', 'CHAOTIC'], bonus: 0.2 },
  { name: 'Lounge Act', effects: ['CHILL', 'SOCIAL'], bonus: 0.2 },
  { name: 'Wall Street', effects: ['FOCUS', 'CONFIDENT'], bonus: 0.35 },
  { name: 'Disco Ghost', effects: ['GLOW', 'SOCIAL', 'CHAOTIC'], bonus: 0.5 },
  { name: 'Glass Ocean', effects: ['CHILL', 'GLOW', 'FOCUS'], bonus: 0.45 },
];

export const MAX_EFFECTS = 4;
export const MAX_MODIFIERS = 3;

export interface Recipe {
  /** Stable key: BASE+mod1+mod2... in application order. */
  key: string;
  base: BaseId;
  mods: string[];
  effects: Effect[];
  /** Per-unit street value. */
  value: number;
  /** Auto name (combo or base). Player may override with a custom name in state. */
  defaultName: string;
  comboName?: string;
}

export function recipeKey(base: BaseId, mods: string[]): string {
  return [base, ...mods].join('+');
}

/** Deterministic transformation: modifier order matters because transforms apply to the current tag set. */
export function computeRecipe(base: BaseId, mods: string[]): Recipe {
  const b = BASES[base];
  let effects: Effect[] = [...b.effects];
  let mult = 1;
  for (const mId of mods.slice(0, MAX_MODIFIERS)) {
    const m = MODIFIERS[mId];
    if (!m) continue;
    effects = effects.map((e) => m.transforms[e] ?? e);
    if (!effects.includes(m.adds)) effects.push(m.adds);
    effects = Array.from(new Set(effects)).slice(0, MAX_EFFECTS);
    mult *= m.valueMult;
  }
  let bonus = 0;
  let comboName: string | undefined;
  for (const c of COMBOS) {
    if (c.effects.every((e) => effects.includes(e)) && c.bonus > bonus) {
      bonus = c.bonus;
      comboName = c.name;
    }
  }
  const value = Math.round(b.baseValue * mult * (1 + 0.08 * (effects.length - 1)) * (1 + bonus));
  return {
    key: recipeKey(base, mods.slice(0, MAX_MODIFIERS)),
    base,
    mods: mods.slice(0, MAX_MODIFIERS),
    effects,
    value,
    defaultName: comboName ? `${b.name} ${comboName.toUpperCase()}` : b.name,
    comboName,
  };
}

export function parseRecipeKey(key: string): { base: BaseId; mods: string[] } | null {
  const parts = key.split('+');
  const base = parts[0] as BaseId;
  if (!BASES[base]) return null;
  return { base, mods: parts.slice(1) };
}

export function isProductItem(id: string): boolean {
  return id.startsWith('prod:');
}
export function isPackagedItem(id: string): boolean {
  return id.startsWith('pkg:');
}
export function productItemId(key: string): string {
  return 'prod:' + key;
}
export function packagedItemId(key: string): string {
  return 'pkg:' + key;
}
export function recipeKeyFromItem(id: string): string | null {
  if (id.startsWith('prod:')) return id.slice(5);
  if (id.startsWith('pkg:')) return id.slice(4);
  return null;
}

/**
 * The shortest modifier sequence (up to MAX_MODIFIERS) that gives a base every requested effect,
 * or null when no combination can. Used for "add X to get Y" hints on pagers and objectives.
 */
export function suggestMods(base: BaseId, effects: Effect[]): string[] | null {
  const satisfies = (mods: string[]): boolean => {
    const r = computeRecipe(base, mods);
    return effects.every((e) => r.effects.includes(e));
  };
  if (satisfies([])) return [];
  const ids = Object.keys(MODIFIERS);
  let frontier: string[][] = [[]];
  for (let depth = 1; depth <= MAX_MODIFIERS; depth++) {
    const next: string[][] = [];
    for (const seq of frontier) {
      for (const id of ids) {
        if (seq.includes(id)) continue;
        const cand = [...seq, id];
        if (satisfies(cand)) return cand;
        next.push(cand);
      }
    }
    frontier = next;
  }
  return null;
}
