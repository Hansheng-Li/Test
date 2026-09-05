import { describe, it, expect } from 'vitest';
import { createNewState, serialize, saveToSlot, loadFromSlot, listSlots, clearSlot, hasAnySave, latestSlot, firstEmptySlot, migrateLegacySave, slotKey, SAVE_KEY, ACTIVE_SLOT_KEY, SLOT_COUNT, Storage } from '../src/systems/SaveSystem';

function memStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
}

describe('save slots', () => {
  it('round-trips a state through a slot and remembers the write time', () => {
    const st = memStorage();
    const s = createNewState();
    s.cash = 1234;
    expect(saveToSlot(s, st, 2, 5000)).toBe(true);
    expect(loadFromSlot(st, 2)?.cash).toBe(1234);
    expect(loadFromSlot(st, 1)).toBeNull();
    const slots = listSlots(st);
    expect(slots).toHaveLength(SLOT_COUNT);
    expect(slots[1].savedAt).toBe(5000);
    expect(slots[0].state).toBeNull();
    expect(st.getItem(ACTIVE_SLOT_KEY)).toBe('2');
  });

  it('rejects slots outside 1..3', () => {
    const st = memStorage();
    expect(saveToSlot(createNewState(), st, 0)).toBe(false);
    expect(saveToSlot(createNewState(), st, 4)).toBe(false);
    expect(saveToSlot(createNewState(), st, 1.5)).toBe(false);
    expect(loadFromSlot(st, 9)).toBeNull();
    expect(hasAnySave(st)).toBe(false);
  });

  it('latest slot prefers the newest write, first empty slot skips filled ones', () => {
    const st = memStorage();
    expect(latestSlot(st)).toBeNull();
    expect(firstEmptySlot(st)).toBe(1);
    saveToSlot(createNewState(), st, 1, 1000);
    saveToSlot(createNewState(), st, 3, 3000);
    expect(latestSlot(st)).toBe(3);
    expect(firstEmptySlot(st)).toBe(2);
    saveToSlot(createNewState(), st, 1, 4000);
    expect(latestSlot(st)).toBe(1);
    saveToSlot(createNewState(), st, 2, 500);
    expect(firstEmptySlot(st)).toBeNull();
    // the active slot wins a tie against an equally fresh slot
    saveToSlot(createNewState(), st, 3, 4000);
    expect(latestSlot(st)).toBe(3);
  });

  it('clearing a slot forgets it as the active slot', () => {
    const st = memStorage();
    saveToSlot(createNewState(), st, 2, 10);
    clearSlot(st, 2);
    expect(loadFromSlot(st, 2)).toBeNull();
    expect(st.getItem(ACTIVE_SLOT_KEY)).toBeNull();
    expect(hasAnySave(st)).toBe(false);
    clearSlot(st, 7); // no throw
  });

  it('treats corrupt slot data as empty', () => {
    const st = memStorage();
    st.setItem(slotKey(1), '{not json');
    st.setItem(slotKey(2), JSON.stringify({ savedAt: 1, state: { version: -1 } }));
    st.setItem(slotKey(3), JSON.stringify({ savedAt: 'soon', state: createNewState() }));
    const slots = listSlots(st);
    expect(slots[0].state).toBeNull();
    expect(slots[1].state).toBeNull();
    expect(slots[2].state).not.toBeNull();
    expect(slots[2].savedAt).toBe(0);
  });

  it('migrates the old single save into slot 1 once', () => {
    const st = memStorage();
    const s = createNewState();
    s.cash = 777;
    st.setItem(SAVE_KEY, serialize(s));
    expect(migrateLegacySave(st, 42)).toBe(true);
    expect(st.getItem(SAVE_KEY)).toBeNull();
    expect(loadFromSlot(st, 1)?.cash).toBe(777);
    expect(listSlots(st)[0].savedAt).toBe(42);
    expect(latestSlot(st)).toBe(1);
    expect(migrateLegacySave(st)).toBe(false);
  });

  it('never overwrites an existing slot 1 with the legacy save', () => {
    const st = memStorage();
    const keep = createNewState();
    keep.cash = 1;
    saveToSlot(keep, st, 1, 100);
    const old = createNewState();
    old.cash = 999;
    st.setItem(SAVE_KEY, serialize(old));
    migrateLegacySave(st, 200);
    expect(loadFromSlot(st, 1)?.cash).toBe(1);
    expect(st.getItem(SAVE_KEY)).toBeNull();
  });

  it('drops a legacy save that does not parse', () => {
    const st = memStorage();
    st.setItem(SAVE_KEY, 'garbage');
    expect(migrateLegacySave(st)).toBe(true);
    expect(st.getItem(SAVE_KEY)).toBeNull();
    expect(hasAnySave(st)).toBe(false);
  });
});
