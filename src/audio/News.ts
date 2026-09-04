import type { RadioContext } from './Radio';

/**
 * WSOL 880 bulletins. Pure text: what the news desk says about the city, given what the
 * radio is allowed to know. Every place named here exists in the city data.
 */
const FILLER = [
  'Bay Cinema is holding NEON TIDE II for a third week. The projector survived.',
  'The Flamingo Diner is still open all night, and still out of key lime pie.',
  'Marlin Fish Market opens at five. The line was there at four.',
  'Pager City says beeper sales are up forty percent this year. The future is small and it beeps.',
  'Coral Arms residents are complaining about the hum from Neptune Arcade. The arcade says it is the ocean.',
  'The Bus Depot repainted its benches. Orange. Nobody asked.',
  'Del Mar Records has tapes two for one until the weekend. Vinyl is full price. Vinyl is always full price.',
  'The lifeguard tower reports jellyfish on the beach again. Swim at your own risk, sting at your own expense.',
  'Golden Lotus now promises delivery in under thirty minutes. We are timing them.',
  'Sun Coast Bank reminds customers the lobby closes at four. The drive-through remembers you.',
  'Rojas Auto Repair has an eighty-eight sedan out front and, he says, a story for every dent.',
  'Video Palace is fining people who do not rewind. Be kind. Rewind.',
];

const EVENT_STORY: Record<string, string> = {
  crackdown: 'Top story: Sol Palma PD announced a crackdown this morning. Extra patrols, extra attitude, through tonight.',
  shortage: 'Top story: a supply disruption at the port has doubled prices on some imports. Traders down at the docks are not happy.',
  club_night: 'Tonight: club night at Club Mirage. Line around the block already. Police ask you to behave. We ask you to tip.',
  inspection: 'Top story: the port authority walked through several warehouses on the docks this morning. Some inventory was seized.',
  rival: 'Top story: police report a turf dispute between local outfits. No injuries reported, plenty of attitude.',
  curfew: 'Top story: District 3 has declared a curfew from eight until six. Extra patrols on every corner. Get home safe, Sol Palma.',
};

const CYCLE = ['heat', 'weather', 'filler', 'traffic', 'filler', 'business', 'weather', 'filler'] as const;

export interface NewsState {
  /** Bulletins read so far (drives the category cycle and the filler order). */
  n: number;
  /** Event id already reported, so a top story runs once per event. */
  reportedEvent: string | null;
}

export function composeBulletin(c: RadioContext | null, ns: NewsState): string {
  const crew = c?.crewName || 'a new outfit';
  if (c?.eventId && c.eventId !== 'none' && ns.reportedEvent !== c.eventId && EVENT_STORY[c.eventId]) {
    ns.reportedEvent = c.eventId;
    return EVENT_STORY[c.eventId];
  }
  const cat = CYCLE[ns.n % CYCLE.length];
  ns.n++;
  switch (cat) {
    case 'heat':
      if (!c || c.heat < 30) return c && c.arrests > 0 ? `Police blotter: a quiet shift in District 3. One noise complaint at Club Mirage, no new arrests. The department says its case against ${crew} is ongoing.` : 'Police blotter: a quiet shift in District 3. One noise complaint at Club Mirage, no arrests.';
      if (c.heat < 60) return 'Police blotter: District 3 says an investigation into street sales downtown is ongoing and patrols have been stepped up. Residents are asked to report anything unusual. Anything.';
      return 'Breaking: police are asking residents to report a suspect on foot. District 3 has every unit out, and a cruiser is circling downtown. Stay indoors if you can.';
    case 'weather':
      if (c?.raining) return 'Weather: showers over the bay right now, clearing within the hour. Roads are slick and the beach is empty.';
      return c?.night ? 'Weather: clear and warm overnight, low in the seventies, a breeze off the ocean. Sunrise a little after six.' : 'Weather: sunny, eighty-eight degrees, humidity you could swim in. Drink water, wear a hat, pay your parking.';
    case 'traffic':
      return c?.night ? 'Traffic: a District 3 cruiser is working the downtown loop tonight. Expect slow-downs on the north side. Sol Palma Transit is running from all three stops.' : 'Traffic: light on the strip, heavy around the docks. A District 3 cruiser is circling downtown, so mind the speed limit and everything else.';
    case 'business':
      if (c && c.sales >= 20) return `Business: police sources say an outfit calling itself ${crew} is moving product across the city. Investigators declined to comment. So did ${crew}.`;
      return 'Business: Lucky Laundromat has extended its hours. The owner says the machines never sleep and neither does he.';
    default:
      return FILLER[Math.floor(ns.n / 2) % FILLER.length];
  }
}
