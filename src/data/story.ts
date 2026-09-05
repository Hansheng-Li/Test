/** Chapter one of Sol Palma: dialogue cards that play once per story step (see systems/StorySystem). */
export interface StoryCard {
  /** Speaker label (English key, translated by the UI). */
  speaker: string;
  /** Face key: the same id the NPC figure uses, so the card shows the same face. */
  face: string;
  /** Accent colour (the speaker's shirt). */
  color: string;
  /** One page per line (English keys). */
  lines: string[];
}

export const STORY_CARDS: Record<string, StoryCard[]> = {
  box: [
    {
      speaker: 'RICO · PAGER', face: 'rico', color: '#f39c12',
      lines: [
        'Kid. Welcome to Sol Palma. The box in your back room is on me: three Sunset Pulp, six baggies and an old bat.',
        'Prep the pulp at the PREP TABLE, bag it at PACKAGING. Keep the beeper on. Sal\'s crew owns the streets, so stay small and stay quiet.',
        'Need more pulp? Container Yard, docks. Take the bicycle outside your door. Ask for Rico. Bring cash.',
      ],
    },
  ],
  page: [
    {
      speaker: 'TASHA REYES · PAGER', face: 'tasha', color: '#ff4081',
      lines: [
        'Yo, is this the back-room cook? Rico gave me your number. Tasha.',
        'I need something SUNSET for tonight. Paging you the details now. Do not be late.',
      ],
    },
  ],
  restock: [
    {
      speaker: 'RICO · PAGER', face: 'rico', color: '#f39c12',
      lines: [
        'Heard Tasha paid you. First money always tastes the best.',
        'That starter pulp will not last. Come down to the Container Yard on the docks and I will sell you more. Then wait for the next page.',
      ],
    },
  ],
  second: [
    {
      speaker: 'RICO', face: 'rico', color: '#f39c12',
      lines: [
        'There you go. Nine bucks a pulp, no receipts.',
        'Quick Stop 24 sells baggies. If a cop sees a deal your heat goes up: break line of sight, or hide in a dumpster.',
        'Go home, cook, and answer that beeper. One more sale and you are in business.',
      ],
    },
  ],
  done: [
    {
      speaker: 'RICO · PAGER', face: 'rico', color: '#f39c12',
      lines: [
        'Two sales. The block is talking. You are in business now, kid.',
        'Keep customers happy and they introduce their friends. Sol Palma Pawn writes markers if you are short. Warehouse 7 is for sale when you are ready to grow.',
        'Mind the heat. Sal\'s crew and District 3 are both watching. — Rico',
      ],
    },
  ],
};
