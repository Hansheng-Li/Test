import { describe, it, expect } from 'vitest';
import { composeBulletin, NewsState } from '../src/audio/News';
import type { RadioContext } from '../src/audio/Radio';

const ctx = (over: Partial<RadioContext> = {}): RadioContext => ({ heat: 0, night: false, crewName: 'PALM CREW', eventId: null, day: 3, trend: null, raining: false, foggy: false, sales: 0, arrests: 0, ...over });

describe('WSOL news bulletins', () => {
  it('runs the top story once per event, then moves on', () => {
    const ns: NewsState = { n: 0, reportedEvent: null };
    const a = composeBulletin(ctx({ eventId: 'curfew' }), ns);
    expect(a).toContain('curfew');
    const b = composeBulletin(ctx({ eventId: 'curfew' }), ns);
    expect(b).not.toContain('Top story');
    const c = composeBulletin(ctx({ eventId: 'crackdown' }), ns);
    expect(c).toContain('crackdown');
  });

  it('reads the weather and the heat off the city', () => {
    const ns: NewsState = { n: 0, reportedEvent: null };
    expect(composeBulletin(ctx({ heat: 80 }), ns)).toContain('every unit out');
    expect(composeBulletin(ctx({ raining: true }), ns)).toContain('showers');
    ns.n = 1;
    expect(composeBulletin(ctx({ foggy: true }), ns)).toContain('fog');
  });

  it('names the crew once the city has noticed it, and never returns an empty line', () => {
    const ns: NewsState = { n: 0, reportedEvent: null };
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const line = composeBulletin(ctx({ sales: 30, night: i % 2 === 0 }), ns);
      expect(line.length).toBeGreaterThan(20);
      seen.add(line);
    }
    expect([...seen].some((l) => l.includes('PALM CREW'))).toBe(true);
    expect(seen.size).toBeGreaterThan(10);
  });
});
