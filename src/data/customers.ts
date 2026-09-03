import { BaseId, Effect } from './products';

export type Personality =
  | 'party kid'
  | 'bartender'
  | 'hotel worker'
  | 'tourist'
  | 'club promoter'
  | 'mechanic'
  | 'college student'
  | 'businessman'
  | 'street artist'
  | 'lifeguard'
  | 'dock worker'
  | 'night nurse';

export interface CustomerDef {
  id: string;
  name: string;
  personality: Personality;
  /** Landmark ids where this customer likes to meet. */
  spots: string[];
  homeZone: 'beach' | 'downtown' | 'docks';
  /** 0..1, higher = pays more relative to product value. */
  generosity: number;
  /** Preferred base and effects (used for order generation and reactions). */
  prefBase: BaseId;
  prefEffects: Effect[];
  /** 0..1 chance they show up on time / do not cancel. */
  reliability: number;
  /** Typical order size range. */
  orderSize: [number, number];
  /** 0..1, chance the meeting attracts attention. */
  risk: number;
  /** Relationship needed before this customer starts paging you. 0 = from the start. */
  unlockAt: number;
  /** Customer who introduces this one (friend chain). */
  introducedBy?: string;
  /** Preferred time of day: 'day' | 'night' | 'any'. */
  timePref: 'day' | 'night' | 'any';
  shirt: string;
  skin: string;
  lines: { greet: string; thanks: string; complaint: string };
}

export const CUSTOMERS: CustomerDef[] = [
  { id: 'tasha', name: 'Tasha Reyes', personality: 'party kid', spots: ['cinema', 'records'], homeZone: 'downtown', generosity: 0.55, prefBase: 'SUNSET', prefEffects: ['ENERGY', 'SOCIAL'], reliability: 0.9, orderSize: [1, 3], risk: 0.3, unlockAt: 0, timePref: 'any', shirt: '#ff4081', skin: '#c68642', lines: { greet: 'Yo! Finally. You got the stuff?', thanks: 'This is gonna be a NIGHT.', complaint: 'That price is criminal. Literally.' } },
  { id: 'moe', name: 'Moe Delgado', personality: 'mechanic', spots: ['boatyard', 'fishmarket'], homeZone: 'docks', generosity: 0.45, prefBase: 'SUNSET', prefEffects: ['ENERGY', 'FOCUS'], reliability: 0.95, orderSize: [2, 4], risk: 0.15, unlockAt: 0, timePref: 'day', shirt: '#3d5a80', skin: '#8d5524', lines: { greet: 'Keep it quick, I got a transmission on the lift.', thanks: 'Appreciate it. Back to work.', complaint: 'You trying to rob a working man?' } },
  { id: 'brandy', name: 'Brandy Kowalski', personality: 'bartender', spots: ['diner', 'canal'], homeZone: 'downtown', generosity: 0.6, prefBase: 'VELVET', prefEffects: ['CHILL', 'SOCIAL'], reliability: 0.9, orderSize: [2, 5], risk: 0.25, unlockAt: 0, timePref: 'night', shirt: '#212121', skin: '#f1c27d', lines: { greet: 'Shift starts in twenty. Make this fast.', thanks: 'You are my favorite regular.', complaint: 'I pour drinks for a living, I know a rip-off.' } },
  { id: 'kenji', name: 'Kenji Okafor', personality: 'college student', spots: ['coralarms', 'garage'], homeZone: 'downtown', generosity: 0.4, prefBase: 'SUNSET', prefEffects: ['FOCUS'], reliability: 0.8, orderSize: [1, 2], risk: 0.2, unlockAt: 0, timePref: 'any', shirt: '#43a047', skin: '#8d5524', lines: { greet: 'Finals week. Please tell me you have FOCUS.', thanks: 'Organic chemistry, here I come.', complaint: 'My student loan cannot handle this.' } },
  { id: 'gloria', name: 'Gloria Pham', personality: 'hotel worker', spots: ['azure', 'motel_front'], homeZone: 'beach', generosity: 0.5, prefBase: 'VELVET', prefEffects: ['CHILL'], reliability: 0.95, orderSize: [2, 4], risk: 0.2, unlockAt: 8, introducedBy: 'brandy', timePref: 'day', shirt: '#7e57c2', skin: '#e0ac69', lines: { greet: 'Housekeeping, but make it fun.', thanks: 'Twelve rooms to go. Thanks, hon.', complaint: 'Guests tip better than this.' } },
  { id: 'dexter', name: 'Dexter Vale', personality: 'club promoter', spots: ['club_back', 'arcade'], homeZone: 'beach', generosity: 0.75, prefBase: 'NEON', prefEffects: ['GLOW', 'SOCIAL'], reliability: 0.7, orderSize: [3, 6], risk: 0.45, unlockAt: 10, introducedBy: 'tasha', timePref: 'night', shirt: '#ffffff', skin: '#c68642', lines: { greet: 'Baby! Mirage is packed tonight. Hook me up.', thanks: 'VIP list. You. Tonight.', complaint: 'For that price I want the bottle service too.' } },
  { id: 'sunny', name: 'Sunny Marchetti', personality: 'tourist', spots: ['pier', 'icecream'], homeZone: 'beach', generosity: 0.85, prefBase: 'SUNSET', prefEffects: ['ENERGY', 'CONFIDENT'], reliability: 0.6, orderSize: [1, 2], risk: 0.4, unlockAt: 0, timePref: 'day', shirt: '#ffeb3b', skin: '#f1c27d', lines: { greet: 'Is this the beach guy? I was told to find the beach guy.', thanks: 'Best vacation EVER. Wait till Ohio hears.', complaint: 'The brochure said Florida was cheap!' } },
  { id: 'ray', name: 'Ray "Pager" Dominguez', personality: 'businessman', spots: ['busdepot', 'coralarms'], homeZone: 'downtown', generosity: 0.7, prefBase: 'VELVET', prefEffects: ['FOCUS', 'CONFIDENT'], reliability: 0.9, orderSize: [3, 6], risk: 0.35, unlockAt: 12, introducedBy: 'kenji', timePref: 'day', shirt: '#546e7a', skin: '#e0ac69', lines: { greet: 'I have a meeting at two. Let us be efficient.', thanks: 'Pleasure. My people will page your people.', complaint: 'I will take my business elsewhere.' } },
  { id: 'luz', name: 'Luz Ferreira', personality: 'street artist', spots: ['canal', 'cinema'], homeZone: 'docks', generosity: 0.45, prefBase: 'NEON', prefEffects: ['DREAMY', 'GLOW'], reliability: 0.75, orderSize: [1, 3], risk: 0.3, unlockAt: 6, introducedBy: 'tasha', timePref: 'night', shirt: '#ff7043', skin: '#c68642', lines: { greet: 'The mural needs colors that do not exist yet.', thanks: 'This is going on the wall. Metaphorically.', complaint: 'Art does not pay, you know.' } },
  { id: 'chip', name: 'Chip Delacroix', personality: 'lifeguard', spots: ['pier', 'icecream'], homeZone: 'beach', generosity: 0.55, prefBase: 'SUNSET', prefEffects: ['ENERGY'], reliability: 0.85, orderSize: [2, 3], risk: 0.3, unlockAt: 8, introducedBy: 'sunny', timePref: 'day', shirt: '#f44336', skin: '#f1c27d', lines: { greet: 'Sun is brutal today. Need a boost.', thanks: 'Nobody drowns on my watch. NOBODY.', complaint: 'Bro. Lifeguard salary. Come on.' } },
  { id: 'hector', name: 'Hector Baptiste', personality: 'dock worker', spots: ['containers', 'fishmarket'], homeZone: 'docks', generosity: 0.5, prefBase: 'VELVET', prefEffects: ['CHILL', 'DREAMY'], reliability: 0.9, orderSize: [3, 6], risk: 0.2, unlockAt: 10, introducedBy: 'moe', timePref: 'any', shirt: '#ff9800', skin: '#8d5524', lines: { greet: 'Double shift. My back is a war zone.', thanks: 'You are a saint. A crooked saint.', complaint: 'Union rates, my friend. Union rates.' } },
  { id: 'nadia', name: 'Nadia Volkov', personality: 'night nurse', spots: ['diner', 'azure'], homeZone: 'downtown', generosity: 0.65, prefBase: 'NEON', prefEffects: ['FOCUS', 'GLOW'], reliability: 0.95, orderSize: [2, 4], risk: 0.15, unlockAt: 14, introducedBy: 'brandy', timePref: 'night', shirt: '#80cbc4', skin: '#f1c27d', lines: { greet: 'Twelve hour shift. Do not make me wait.', thanks: 'Now I can survive till dawn.', complaint: 'I save lives and you charge me THAT?' } },
];

export const CUSTOMER_MAP: Record<string, CustomerDef> = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c]));
