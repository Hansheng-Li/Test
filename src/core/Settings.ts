export interface Settings {
  sensitivity: number;
  masterVolume: number;
  radioVolume: number;
}

const KEY = 'sunset_syndicate_settings';
const DEFAULTS: Settings = { sensitivity: 1, masterVolume: 0.5, radioVolume: 0.35 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      sensitivity: clampNum(p.sensitivity, 0.2, 3, DEFAULTS.sensitivity),
      masterVolume: clampNum(p.masterVolume, 0, 1, DEFAULTS.masterVolume),
      radioVolume: clampNum(p.radioVolume, 0, 1, DEFAULTS.radioVolume),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function clampNum(v: unknown, lo: number, hi: number, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
}
