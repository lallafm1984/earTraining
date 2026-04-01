// ────────────────────────────────────────────────────────────────
// Two-Voice Bass Generator — Scale Data & Constants
// ────────────────────────────────────────────────────────────────

import type { TimeSignature } from './types';

// ────────────────────────────────────────────────────────────────
// Scale definitions
// ────────────────────────────────────────────────────────────────

/**
 * Scale note names for all supported keys.
 * Each array has 8 entries (root through octave) using ABC-style note names.
 * Sharps use '#', flats use 'b'.
 */
export interface ScaleInfo {
  notes: string[];
  /** Index of the leading tone (7th degree) within the 7-note scale (0-based) */
  leadingToneIndex: number;
  /** For harmonic minor: index pair [6th, 7th] that forms the augmented 2nd */
  augmentedSecondIndices?: [number, number];
}

// ── Major scales (12 keys) ──────────────────────────────────────

export const MAJOR_SCALES: Record<string, ScaleInfo> = {
  'C':  { notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'],       leadingToneIndex: 6 },
  'G':  { notes: ['G', 'A', 'B', 'C', 'D', 'E', 'F#', 'G'],      leadingToneIndex: 6 },
  'D':  { notes: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#', 'D'],     leadingToneIndex: 6 },
  'A':  { notes: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#', 'A'],    leadingToneIndex: 6 },
  'E':  { notes: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#', 'E'],   leadingToneIndex: 6 },
  'B':  { notes: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#', 'B'],  leadingToneIndex: 6 },
  'F':  { notes: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E', 'F'],      leadingToneIndex: 6 },
  'Bb': { notes: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A', 'Bb'],    leadingToneIndex: 6 },
  'Eb': { notes: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D', 'Eb'],   leadingToneIndex: 6 },
  'Ab': { notes: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G', 'Ab'],  leadingToneIndex: 6 },
  'Db': { notes: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C', 'Db'], leadingToneIndex: 6 },
  'Gb': { notes: ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F', 'Gb'], leadingToneIndex: 6 },
  'F#': { notes: ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#', 'F#'], leadingToneIndex: 6 },
  'C#': { notes: ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#', 'C#'], leadingToneIndex: 6 },
};

// ── Harmonic minor scales (11 keys) ────────────────────────────

export const HARMONIC_MINOR_SCALES: Record<string, ScaleInfo> = {
  'Am':  { notes: ['A', 'B', 'C', 'D', 'E', 'F', 'G#', 'A'],       leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'Em':  { notes: ['E', 'F#', 'G', 'A', 'B', 'C', 'D#', 'E'],      leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'Bm':  { notes: ['B', 'C#', 'D', 'E', 'F#', 'G', 'A#', 'B'],     leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'Dm':  { notes: ['D', 'E', 'F', 'G', 'A', 'Bb', 'C#', 'D'],      leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'Gm':  { notes: ['G', 'A', 'Bb', 'C', 'D', 'Eb', 'F#', 'G'],     leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'Cm':  { notes: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'B', 'C'],      leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'Fm':  { notes: ['F', 'G', 'Ab', 'Bb', 'C', 'Db', 'E', 'F'],     leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'F#m': { notes: ['F#', 'G#', 'A', 'B', 'C#', 'D', 'E#', 'F#'],   leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'C#m': { notes: ['C#', 'D#', 'E', 'F#', 'G#', 'A', 'B#', 'C#'],  leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'Bbm': { notes: ['Bb', 'C', 'Db', 'Eb', 'F', 'Gb', 'A', 'Bb'],   leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'Ebm': { notes: ['Eb', 'F', 'Gb', 'Ab', 'Bb', 'Cb', 'D', 'Eb'],  leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'G#m': { notes: ['G#', 'A#', 'B', 'C#', 'D#', 'E', 'F##', 'G#'], leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'D#m': { notes: ['D#', 'E#', 'F#', 'G#', 'A#', 'B', 'C##', 'D#'], leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'A#m': { notes: ['A#', 'B#', 'C#', 'D#', 'E#', 'F#', 'G##', 'A#'], leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
  'Abm': { notes: ['Ab', 'Bb', 'Cb', 'Db', 'Eb', 'Fb', 'G', 'Ab'],  leadingToneIndex: 6, augmentedSecondIndices: [5, 6] },
};

/**
 * Look up scale info by key string and mode.
 * Key format: 'C', 'G', 'Am', 'Dm', etc.
 */
export function getScaleInfo(key: string, mode: 'major' | 'harmonic_minor'): ScaleInfo {
  if (mode === 'major') {
    const info = MAJOR_SCALES[key];
    if (!info) throw new Error(`Unknown major key: ${key}`);
    return info;
  }
  // For harmonic minor, key might come as 'Am', 'A', etc.
  const minorKey = key.endsWith('m') ? key : key + 'm';
  const info = HARMONIC_MINOR_SCALES[minorKey];
  if (!info) throw new Error(`Unknown harmonic minor key: ${minorKey}`);
  return info;
}

// ────────────────────────────────────────────────────────────────
// Strong beat position map (L:1/8 units, 1-based) — v4 문서 강박표와 동일
// (temp/ear_training_bass_prompt_v4.md §강박 위치표)
// 런타임 변환은 meter.ts (0-based eighths / sixteenths).
// ────────────────────────────────────────────────────────────────

export const STRONG_BEAT_MAP: Record<TimeSignature, {
  strong: number[];
  mid: number[];
  weak: number[];
}> = {
  '2/4':  { strong: [1],    mid: [3],       weak: [2, 4] },
  '3/4':  { strong: [1],    mid: [],        weak: [3, 5] },
  '4/4':  { strong: [1],    mid: [5],       weak: [3, 7] },
  '2/2':  { strong: [1],    mid: [5],       weak: [3, 7] },
  '6/8':  { strong: [1],    mid: [4],       weak: [2, 3, 5, 6] },
  '9/8':  { strong: [1],    mid: [4, 7],    weak: [2, 3, 5, 6, 8, 9] },
  '12/8': { strong: [1],    mid: [4, 7, 10], weak: [2, 3, 5, 6, 8, 9, 11, 12] },
};

// ────────────────────────────────────────────────────────────────
// Bass duration map per time signature (L:1/8 units)
// ────────────────────────────────────────────────────────────────

export interface BassDurationInfo {
  /** Level 1: single note fills the entire measure */
  level1: number;
  /** Level 2/3: primary note duration per beat group */
  level2: number;
  /** Number of notes per bar at each level */
  notesPerBar: { level2: number; level3: number };
}

export const BASS_DURATION_MAP: Record<TimeSignature, BassDurationInfo> = {
  '2/4':  { level1: 4,  level2: 2, notesPerBar: { level2: 2, level3: 2 } },
  '3/4':  { level1: 6,  level2: 2, notesPerBar: { level2: 3, level3: 3 } },
  '4/4':  { level1: 8,  level2: 4, notesPerBar: { level2: 2, level3: 2 } },
  '2/2':  { level1: 8,  level2: 4, notesPerBar: { level2: 2, level3: 2 } },
  '6/8':  { level1: 6,  level2: 3, notesPerBar: { level2: 2, level3: 2 } },
  '9/8':  { level1: 9,  level2: 3, notesPerBar: { level2: 3, level3: 3 } },
  '12/8': { level1: 12, level2: 3, notesPerBar: { level2: 4, level3: 4 } },
};

// ────────────────────────────────────────────────────────────────
// Measure total duration (L:1/8 units)
// ────────────────────────────────────────────────────────────────

export const MEASURE_TOTAL: Record<TimeSignature, number> = {
  '2/4':  4,
  '3/4':  6,
  '4/4':  8,
  '2/2':  8,
  '6/8':  6,
  '9/8':  9,
  '12/8': 12,
};

// ────────────────────────────────────────────────────────────────
// Bass register ranges (MIDI note numbers)
// ────────────────────────────────────────────────────────────────

/**
 * Bass register ranges per level.
 * Level 1: E, ~ C  => MIDI 40..48
 * Level 2: E, ~ G  => MIDI 40..55
 * Level 3: E, ~ G  => MIDI 40..55
 */
export const BASS_RANGE: Record<1 | 2 | 3 | 4, { low: number; high: number }> = {
  1: { low: 40, high: 55 },
  2: { low: 40, high: 55 },
  3: { low: 43, high: 55 },  // G2 이상 (E,,/F,, 극저음 제거)
  4: { low: 43, high: 55 },  // G2 이상 (E,,/F,, 극저음 제거)
};
