// The "scene" of the day card: sky colours by the time of day, the season, meal slots.

export type Sky = { top: string; mid: string; bottom: string; dark: boolean; stars: number };

/** Sky colours at given hours; the colour between two of them is blended. */
const KEYS: [number, string, string, string][] = [
  [0, '#0f1430', '#1d2140', '#2a2440'],
  [5, '#1b2350', '#3b3b6b', '#6b4a6b'],
  [7, '#6f9fd8', '#f3c6a5', '#f7d9b0'],
  [10, '#8cc6f0', '#cfe9f7', '#f4ecd8'],
  [14, '#7fbdeb', '#c4e3f6', '#eef3e0'],
  [17, '#6c87c9', '#b98aa0', '#f2b98a'],
  [19, '#30355e', '#7c4a6b', '#e5875a'],
  [21, '#1d2140', '#2a2b4f', '#4b2f35'],
  [24, '#0f1430', '#1d2140', '#2a2440'],
];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c: number[]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a);
  const y = rgb(b);
  return hex(x.map((v, i) => v + ((y[i] as number) - v) * t));
};
/** Relative brightness 0..1 (sRGB weights, good enough for picking a text colour). */
export const lightness = (c: string) => {
  const [r, g, b] = rgb(c) as [number, number, number];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

/** Sky for a time of day given in hours (0..24, fractions allowed). */
export function skyAt(hours: number): Sky {
  const h = ((hours % 24) + 24) % 24;
  const i = KEYS.findIndex(([k], n) => {
    const next = KEYS[n + 1];
    return next !== undefined && h >= k && h < next[0];
  });
  const [h0, t0, m0, b0] = KEYS[i] as (typeof KEYS)[number];
  const [h1, t1, m1, b1] = KEYS[i + 1] as (typeof KEYS)[number];
  const t = (h - h0) / (h1 - h0);
  const mid = mix(m0, m1, t);
  const dark = lightness(mid) < 0.55;
  // Stars are seen at night, fade out at dawn and in again after sunset.
  const stars = h < 5 ? 1 : h < 7 ? (7 - h) / 2 : h < 19 ? 0 : h < 21 ? (h - 19) / 2 : 1;
  return { top: mix(t0, t1, t), mid, bottom: mix(b0, b1, t), dark, stars };
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export const seasonOf = (month: number): Season =>
  month === 11 || month <= 1 ? 'winter' : month <= 4 ? 'spring' : month <= 7 ? 'summer' : 'autumn';

export type Greeting = 'morning' | 'day' | 'evening' | 'night';
export const greetingAt = (hours: number): Greeting =>
  hours >= 5 && hours < 11
    ? 'morning'
    : hours < 17 && hours >= 11
      ? 'day'
      : hours >= 17 && hours < 23
        ? 'evening'
        : 'night';

export type Slot = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
/** Where an empty slot sits on the day line (minutes since midnight). */
const SLOT_DEFAULT: Record<Slot, number> = {
  breakfast: 8 * 60,
  lunch: 13 * 60,
  snack: 17 * 60,
  dinner: 20 * 60,
};
const LABEL_SLOT: Record<string, Slot> = {
  Завтрак: 'breakfast',
  Обед: 'lunch',
  Перекус: 'snack',
  Ужин: 'dinner',
};

const minutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The meal an entry belongs to: its label when it names a meal, else its time. */
export function slotOf(e: { time: string; mealLabel?: string | undefined }): Slot {
  const byLabel = e.mealLabel ? LABEL_SLOT[e.mealLabel] : undefined;
  if (byLabel) return byLabel;
  const m = minutes(e.time);
  return m < 11 * 60 ? 'breakfast' : m < 16 * 60 ? 'lunch' : m < 19 * 60 ? 'snack' : 'dinner';
}

/** The day line runs from 06:00 to 24:00. */
const DAY_FROM = 6 * 60;
const DAY_LEN = 18 * 60;
export const linePos = (mins: number) => Math.min(1, Math.max(0, (mins - DAY_FROM) / DAY_LEN));

export type Pin = {
  slot: Slot;
  pos: number;
  count: number;
  time: string | null;
  firstId: string | null;
};

/** One pin per meal on the day line; pins never sit closer than `gap` to each other. */
export function dayPins(
  entries: readonly { id: string; time: string; mealLabel?: string | undefined }[],
  gap = 0.13,
): Pin[] {
  const pins = SLOTS.map((slot): Pin => {
    const own = entries
      .filter((e) => slotOf(e) === slot)
      .sort((a, b) => a.time.localeCompare(b.time));
    const first = own[0];
    return {
      slot,
      count: own.length,
      time: first ? first.time : null,
      firstId: first ? first.id : null,
      pos: linePos(first ? minutes(first.time) : SLOT_DEFAULT[slot]),
    };
  });
  for (let i = 1; i < pins.length; i++) {
    const p = pins[i] as Pin;
    p.pos = Math.max(p.pos, (pins[i - 1] as Pin).pos + gap);
  }
  // Pushed past the end: slide the whole set back so the last pin stays on the line.
  const over = (pins[pins.length - 1] as Pin).pos - 1;
  if (over > 0) for (const p of pins) p.pos = Math.max(0, p.pos - over);
  return pins;
}

/** Which meal "now" is, for the add button. */
export const slotNow = (hours: number): Slot =>
  hours < 11 ? 'breakfast' : hours < 16 ? 'lunch' : hours < 19 ? 'snack' : 'dinner';
