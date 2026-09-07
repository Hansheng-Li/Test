import { describe, it, expect } from 'vitest';
import { fogLevel, foggyDay, sightMultiplier, FOG_CHANCE } from '../src/systems/WeatherSystem';

describe('fog mornings', () => {
  it('happen on about a third of mornings and differ between seeds', () => {
    let foggy = 0;
    for (let day = 1; day <= 300; day++) if (foggyDay(7, day)) foggy++;
    expect(foggy / 300).toBeGreaterThan(FOG_CHANCE / 100 - 0.1);
    expect(foggy / 300).toBeLessThan(FOG_CHANCE / 100 + 0.1);
    const a = Array.from({ length: 30 }, (_, d) => foggyDay(1, d + 1));
    const b = Array.from({ length: 30 }, (_, d) => foggyDay(2, d + 1));
    expect(a).not.toEqual(b);
  });

  it('ramps in at five, holds, and burns off by half past eight', () => {
    let day = 1;
    while (!foggyDay(3, day)) day++;
    expect(fogLevel(3, day, 4.9)).toBe(0);
    expect(fogLevel(3, day, 5.25)).toBeCloseTo(0.5);
    expect(fogLevel(3, day, 6.5)).toBe(1);
    expect(fogLevel(3, day, 8)).toBeCloseTo(0.5);
    expect(fogLevel(3, day, 8.5)).toBe(0);
    expect(fogLevel(3, day, 12)).toBe(0);
    let clear = 1;
    while (foggyDay(3, clear)) clear++;
    expect(fogLevel(3, clear, 6.5)).toBe(0);
  });

  it('cuts sight ranges by up to 45%', () => {
    expect(sightMultiplier(0)).toBe(1);
    expect(sightMultiplier(1)).toBeCloseTo(0.55);
    expect(sightMultiplier(0.5)).toBeCloseTo(0.775);
    expect(sightMultiplier(3)).toBeCloseTo(0.55);
  });
});
