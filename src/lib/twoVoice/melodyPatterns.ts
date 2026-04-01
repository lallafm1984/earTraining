// ────────────────────────────────────────────────────────────────
// Melody Rhythm Patterns — Levels 1-9, all 7 time signatures
// Derived from temp/ear_training_melody_prompt_v4.md (박자별 리듬 패턴).
// Compact encoding (L:1/8 units):
//   positive = note duration, negative = rest duration
//   0.5 = sixteenth note, 1.5 = dotted eighth note
// ────────────────────────────────────────────────────────────────

import type { TimeSignature } from './types';

// ── Types ──

/** A single rhythm slot: positive = note, negative = rest (abs = duration in L:1/8) */
export type RhythmSlot = number;

/** A rhythm pattern with optional triplet and tie annotations */
export interface RhythmPattern {
  slots: RhythmSlot[];
  /** Triplet group within this pattern */
  triplet?: {
    startIndex: number;
    count: 3;
    span: number; // total duration the triplet occupies (L:1/8)
  };
  /** Indices of slots that should be tied to the next note */
  tieIndices?: number[];
}

/** Description of what each level introduces */
export interface LevelNewElement {
  level: number;
  description: string;
  newConcepts: string[];
}

// ── Helpers ──

/** Shorthand: create a plain pattern from slots */
function p(slots: RhythmSlot[]): RhythmPattern {
  return { slots };
}

/** Shorthand: create a pattern with tie indices */
function pTie(slots: RhythmSlot[], tieIndices: number[]): RhythmPattern {
  return { slots, tieIndices };
}

/** Shorthand: create a pattern with a triplet */
function pTriplet(
  slots: RhythmSlot[],
  startIndex: number,
  span: number,
): RhythmPattern {
  return { slots, triplet: { startIndex, count: 3, span } };
}

// ── Bar totals ──
const BAR_TOTAL: Record<TimeSignature, number> = {
  '2/4': 4,
  '3/4': 6,
  '4/4': 8,
  '2/2': 8,
  '6/8': 6,
  '9/8': 9,
  '12/8': 12,
};

// ────────────────────────────────────────────────────────────────
// Per-level NEW patterns (not cumulative — each level's additions)
// ────────────────────────────────────────────────────────────────

const L1: Record<TimeSignature, RhythmPattern[]> = {
  '4/4': [p([8]), p([4, 4])],
  '3/4': [p([6])],
  '2/4': [p([4])],
  '2/2': [p([8]), p([4, 4])],
  '6/8': [p([6])],
  '9/8': [p([9])],
  '12/8': [p([12]), p([6, 6])],
};

const L2: Record<TimeSignature, RhythmPattern[]> = {
  '4/4': [
    p([6, 2]), p([2, 6]), p([2, 2, 4]), p([4, 2, 2]),
    p([2, 2, 2, 2]), p([4, 2, -2]), p([6, -2]), p([-2, 6]),
  ],
  '3/4': [
    p([4, 2]), p([2, 4]), p([2, 2, 2]), p([4, -2]), p([2, 2, -2]),
  ],
  '2/4': [p([2, 2]), p([2, -2])],
  '2/2': [
    p([6, 2]), p([2, 6]), p([2, 2, 4]), p([4, 2, 2]),
    p([2, 2, 2, 2]), p([4, 2, -2]), p([6, -2]), p([-2, 6]),
  ],
  '6/8': [p([3, 3]), p([4, 2]), p([2, 4])],
  '9/8': [p([3, 3, 3]), p([6, 3]), p([3, 6]), p([6, -2, -1])],
  '12/8': [p([3, 3, 3, 3]), p([6, 3, 3]), p([3, 3, 6]), p([9, -2, -1])],
};

const L3: Record<TimeSignature, RhythmPattern[]> = {
  '4/4': [
    p([1, 1, 2, 4]), p([4, 1, 1, 2]), p([2, 1, 1, 2, 2]),
    p([1, 1, 1, 1, 4]), p([-1, 1, 2, 4]),
  ],
  '3/4': [
    p([1, 1, 2, 2]), p([2, 1, 1, 2]), p([2, 2, 1, 1]), p([1, 1, 4]),
  ],
  '2/4': [p([1, 1, 2]), p([2, 1, 1]), p([-1, 1, 2])],
  '2/2': [
    p([1, 1, 2, 4]), p([4, 1, 1, 2]), p([2, 1, 1, 2, 2]),
    p([1, 1, 1, 1, 4]), p([-1, 1, 2, 4]),
  ],
  '6/8': [
    p([1, 1, 1, 3]), p([3, 1, 1, 1]), p([1, 1, 1, 1, 1, 1]),
    p([-1, 1, 1, 3]),
  ],
  '9/8': [
    p([1, 1, 1, 3, 3]), p([3, 1, 1, 1, 3]), p([3, 3, 1, 1, 1]),
    p([1, 1, 1, 1, 1, 1, 3]), p([1, 1, 1, 1, 1, 1, 1, 1, 1]),
  ],
  '12/8': [
    p([1, 1, 1, 3, 3, 3]), p([3, 1, 1, 1, 3, 3]),
    p([3, 3, 1, 1, 1, 3]), p([3, 3, 3, 1, 1, 1]),
    p([1, 1, 1, 1, 1, 1, 6]),
  ],
};

const L4: Record<TimeSignature, RhythmPattern[]> = {
  '4/4': [p([3, 1, 4]), p([4, 3, 1]), p([3, 1, 2, 2]), p([3, 1, 3, 1])],
  '3/4': [p([3, 1, 2]), p([2, 3, 1])],
  '2/4': [p([3, 1])],
  '2/2': [p([3, 1, 4]), p([4, 3, 1]), p([3, 1, 2, 2]), p([3, 1, 3, 1])],
  '6/8': [], // dotted quarter patterns already covered in L2/L3
  '9/8': [], // dotted quarter patterns already covered in L2/L3
  '12/8': [p([3, 6, 3])], // [6,3,3] and [3,3,3,1,1,1] already in L2/L3
};

const L5: Record<TimeSignature, RhythmPattern[]> = {
  '4/4': [
    pTie([2, 2, 2, 2], [1]),  // tie on 2nd note (syncopation)
    p([1, 2, 1, 4]),          // syncopation pattern
  ],
  '3/4': [
    pTie([2, 2, 2], [1]),     // tie on 2nd note
    p([1, 2, 1, 2]),
  ],
  '2/4': [],
  '2/2': [
    pTie([2, 2, 2, 2], [1]),
    p([1, 2, 1, 4]),
  ],
  '6/8': [p([1, 2, 1, 2])],
  '9/8': [p([1, 2, 3, 3]), p([3, 1, 2, 3])],
  '12/8': [
    p([1, 2, 3, 3, 3]),
    p([3, 1, 2, 3, 3]),
    p([3, 3, 1, 2, 3]),
  ],
};

const L6: Record<TimeSignature, RhythmPattern[]> = {
  '4/4': [
    p([0.5, 0.5, 0.5, 0.5, 2, 4]),
    p([4, 0.5, 0.5, 0.5, 0.5, 2]),
    p([1, 0.5, 0.5, 2, 4]),
  ],
  '3/4': [
    p([0.5, 0.5, 0.5, 0.5, 2, 2]),
    p([2, 0.5, 0.5, 0.5, 0.5, 2]),
  ],
  '2/4': [],
  '2/2': [
    p([0.5, 0.5, 0.5, 0.5, 2, 4]),
    p([4, 0.5, 0.5, 0.5, 0.5, 2]),
    p([1, 0.5, 0.5, 2, 4]),
  ],
  '6/8': [
    p([0.5, 0.5, 1, 1, 1, 3]),
    p([3, 0.5, 0.5, 1, 1, 1]),
  ],
  '9/8': [
    p([3, 0.5, 0.5, 1, 1, 3]),
    p([0.5, 0.5, 1, 1, 3, 3]),
  ],
  '12/8': [
    p([3, 0.5, 0.5, 1, 1, 3, 3]),
    p([3, 3, 3, 0.5, 0.5, 1, 1]),
  ],
};

const L7: Record<TimeSignature, RhythmPattern[]> = {
  '4/4': [
    p([1.5, 0.5, 2, 4]),
    p([4, 1.5, 0.5, 2]),
    p([1.5, 0.5, 1.5, 0.5, 4]),
  ],
  '3/4': [
    p([1.5, 0.5, 2, 2]),
    p([2, 1.5, 0.5, 2]),
  ],
  '2/4': [],
  '2/2': [
    p([1.5, 0.5, 2, 4]),
    p([4, 1.5, 0.5, 2]),
    p([1.5, 0.5, 1.5, 0.5, 4]),
  ],
  '6/8': [
    p([1.5, 0.5, 1, 3]),
    p([3, 1.5, 0.5, 1]),
  ],
  '9/8': [
    p([1.5, 0.5, 1, 3, 3]),
    p([3, 1.5, 0.5, 1, 3]),
  ],
  '12/8': [
    p([1.5, 0.5, 1, 3, 3, 3]),
    p([3, 3, 1.5, 0.5, 1, 3]),
  ],
};

// Level 8: No new rhythm patterns (accidentals are pitch-level only)
const L8: Record<TimeSignature, RhythmPattern[]> = {
  '4/4': [], '3/4': [], '2/4': [], '2/2': [],
  '6/8': [], '9/8': [], '12/8': [],
};

const L9: Record<TimeSignature, RhythmPattern[]> = {
  '4/4': [
    // 8th triplet at start + quarter + half
    pTriplet([2, 2, 4], 0, 2),
    // half + 8th triplet + quarter
    pTriplet([4, 2, 2], 1, 2),
    // quarter + 8th triplet + quarter + quarter
    pTriplet([2, 2, 2, 2], 1, 2),
    // quarter triplet + half
    pTriplet([4, 4], 0, 4),
  ],
  '3/4': [
    // 8th triplet at start + quarter + quarter
    pTriplet([2, 2, 2], 0, 2),
    // quarter + 8th triplet + quarter
    pTriplet([2, 2, 2], 1, 2),
  ],
  '2/4': [],
  '2/2': [
    pTriplet([2, 2, 4], 0, 2),
    pTriplet([4, 2, 2], 1, 2),
    pTriplet([2, 2, 2, 2], 1, 2),
    pTriplet([4, 4], 0, 4),
  ],
  '6/8': [
    // triplet spanning whole bar
    pTriplet([6], 0, 6),
    // dotted quarter + triplet within second beat group
    pTriplet([3, 2, 1], 1, 2),
  ],
  '9/8': [
    // triplet spanning first 6 units + dotted quarter
    pTriplet([6, 3], 0, 6),
    // dotted quarter + triplet spanning last 6 units
    pTriplet([3, 6], 1, 6),
  ],
  '12/8': [
    // dotted quarter + triplet spanning 6 units + dotted quarter
    pTriplet([3, 6, 3], 1, 6),
    // triplet spanning first 6 units + two dotted quarters
    pTriplet([6, 3, 3], 0, 6),
  ],
};

// ────────────────────────────────────────────────────────────────
// Collected new-pattern arrays per level
// ────────────────────────────────────────────────────────────────

const LEVEL_PATTERN_ADDITIONS: Record<TimeSignature, RhythmPattern[]>[] = [
  /* index 0 unused */ {} as Record<TimeSignature, RhythmPattern[]>,
  L1, L2, L3, L4, L5, L6, L7, L8, L9,
];

// ────────────────────────────────────────────────────────────────
// Cumulative pattern table: MELODY_PATTERNS[level][timeSig]
// ────────────────────────────────────────────────────────────────

function buildCumulativePatterns(): Record<number, Record<TimeSignature, RhythmPattern[]>> {
  const result: Record<number, Record<TimeSignature, RhythmPattern[]>> = {};
  const TIME_SIGS: TimeSignature[] = ['2/4', '3/4', '4/4', '2/2', '6/8', '9/8', '12/8'];

  for (let level = 1; level <= 9; level++) {
    result[level] = {} as Record<TimeSignature, RhythmPattern[]>;
    for (const ts of TIME_SIGS) {
      const prev = level > 1 ? result[level - 1][ts] : [];
      const additions = LEVEL_PATTERN_ADDITIONS[level][ts] ?? [];
      result[level][ts] = [...prev, ...additions];
    }
  }

  return result;
}

/** All rhythm patterns available at each level (cumulative), keyed by level then time signature */
export const MELODY_PATTERNS: Record<number, Record<TimeSignature, RhythmPattern[]>> =
  buildCumulativePatterns();

// ────────────────────────────────────────────────────────────────
// Level descriptions
// ────────────────────────────────────────────────────────────────

export const LEVEL_NEW_ELEMENTS: LevelNewElement[] = [
  {
    level: 1,
    description: 'Whole and half notes only',
    newConcepts: ['whole note', 'half note'],
  },
  {
    level: 2,
    description: 'Dotted half notes, quarter notes, quarter rests',
    newConcepts: ['dotted half note', 'quarter note', 'quarter rest'],
  },
  {
    level: 3,
    description: 'Eighth notes and eighth rests',
    newConcepts: ['eighth note', 'eighth rest'],
  },
  {
    level: 4,
    description: 'Dotted quarter notes',
    newConcepts: ['dotted quarter note'],
  },
  {
    level: 5,
    description: 'Ties and syncopation',
    newConcepts: ['tie', 'syncopation'],
  },
  {
    level: 6,
    description: 'Sixteenth notes',
    newConcepts: ['sixteenth note'],
  },
  {
    level: 7,
    description: 'Dotted eighth notes (dotted eighth + sixteenth)',
    newConcepts: ['dotted eighth note'],
  },
  {
    level: 8,
    description: 'Accidentals (no new rhythm patterns)',
    newConcepts: ['accidentals (pitch-level)'],
  },
  {
    level: 9,
    description: 'Triplets',
    newConcepts: ['eighth-note triplet', 'quarter-note triplet'],
  },
];

// ────────────────────────────────────────────────────────────────
// Public helpers
// ────────────────────────────────────────────────────────────────

/**
 * Get all rhythm patterns available at a given level (cumulative).
 * Levels 1-9 are supported.
 */
export function getPatternsForLevel(
  level: number,
  timeSig: TimeSignature,
): RhythmPattern[] {
  const clamped = Math.max(1, Math.min(9, level));
  return MELODY_PATTERNS[clamped][timeSig] ?? [];
}

/**
 * Select a melody rhythm pattern for the given level and time signature.
 * Biases 30-50% toward patterns newly introduced at the current level
 * so that students encounter new material while still reviewing old.
 */
export function selectMelodyPattern(
  level: number,
  timeSig: TimeSignature,
): RhythmPattern {
  const clamped = Math.max(1, Math.min(9, level));
  const allPatterns = getPatternsForLevel(clamped, timeSig);

  if (allPatterns.length === 0) {
    // Fallback: single whole-bar note
    return p([BAR_TOTAL[timeSig]]);
  }

  // Determine which patterns are "new" at this level
  const newPatterns = LEVEL_PATTERN_ADDITIONS[clamped][timeSig] ?? [];
  const oldPatterns = clamped > 1
    ? (MELODY_PATTERNS[clamped - 1]?.[timeSig] ?? [])
    : [];

  // If no new patterns at this level (e.g., L8), pick from all
  if (newPatterns.length === 0 || oldPatterns.length === 0) {
    return allPatterns[Math.floor(Math.random() * allPatterns.length)];
  }

  // 30-50% chance of picking a new pattern
  const newBias = 0.3 + Math.random() * 0.2;
  if (Math.random() < newBias) {
    return newPatterns[Math.floor(Math.random() * newPatterns.length)];
  }
  return oldPatterns[Math.floor(Math.random() * oldPatterns.length)];
}
