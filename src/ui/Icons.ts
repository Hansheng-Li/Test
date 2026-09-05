import { FACES, faceIndexFor } from '../world/Faces';
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
