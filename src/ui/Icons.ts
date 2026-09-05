import { FACES, faceIndexFor } from '../world/Faces';
import { tn } from '../i18n';
/**
 * Item icons: Kenney Generic Items (CC0), renamed per item id under public/assets/icons/items.
 * Packaged product, loose product and station kits share one icon each. A missing file simply
 * leaves the slot text-only (the <img> hides itself on error).
 */
const ICONS = new Set(['pulp_sunset', 'wax_velvet', 'gel_neon', 'mod_flux', 'mod_velvet_drops', 'mod_solar', 'mod_static', 'mod_sparks', 'mod_glow', 'baggies', 'eq_mixer', 'eq_sealer', 'eq_backpack', 'eq_brickphone', 'eq_scanner', 'bat', 'pistol', 'rounds']);

export function iconFor(itemId: string): string {
  const key = itemId.startsWith('pkg:') ? 'pkg' : itemId.startsWith('prod:') ? 'prod' : itemId.endsWith('_kit') ? 'kit' : ICONS.has(itemId) ? itemId : 'kit';
  return `/assets/icons/items/${key}.png`;
}

/** An <img> tag for an item, self-hiding if the file is missing. */
export function iconImg(itemId: string, cls = 'icon'): string {
  return `<img class="${cls}" src="${iconFor(itemId)}" alt="" draggable="false" onerror="this.style.display='none'">`;
}

/** A face avatar (Kenney Blocky Characters, the same face the NPC wears) on a coloured tile. */
export function faceImg(key: string, color: string, cls = 'avatar'): string {
  const face = FACES[faceIndexFor(key)];
  return `<span class="${cls}" style="background:${color}"><img src="/assets/textures/faces/${face.file}.png" alt="" onerror="this.style.display='none'"/></span>`;
}

/** Effect colours: the same hue everywhere an effect is named, so a tag reads at a glance. */
export const EFFECT_COLORS: Record<string, string> = {
  ENERGY: '#ff9a3c',
  CHILL: '#b388ff',
  SOCIAL: '#ff6fb0',
  FOCUS: '#4ff2e8',
  DREAMY: '#c9a7ff',
  CONFIDENT: '#ffd166',
  CHAOTIC: '#ff5c5c',
  GLOW: '#7dff9a',
};

/** A bold, coloured effect tag. */
export function effectTag(effect: string, cls = 'tag effect'): string {
  const c = EFFECT_COLORS[effect] ?? '#4ff2e8';
  return `<span class="${cls}" style="border-color:${c};color:${c}">${tn(effect)}</span>`;
}
