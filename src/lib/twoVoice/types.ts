// ────────────────────────────────────────────────────────────────
// Two-Voice Bass Generator — Type Definitions
// ────────────────────────────────────────────────────────────────

export type BassLevel = 1 | 2 | 3 | 4;

export type TimeSignature = '2/4' | '3/4' | '4/4' | '2/2' | '6/8' | '9/8' | '12/8';

export type ScaleMode = 'major' | 'harmonic_minor';

/** Pattern ID string referencing a BassPatternDef */
export type BassDirectionPattern = string;

export interface TwoVoiceBassOptions {
  key: string;
  mode: ScaleMode;
  timeSig: TimeSignature;
  measures: 4 | 8 | 12 | 16;
  bassLevel: BassLevel;
  bassDirection?: BassDirectionPattern;
}

export interface BassNote {
  /** Scale degree index (0-based within the scale array) */
  noteNum: number;
  /** Duration in L:1/8 units */
  duration: number;
  /** Measure number (0-based) */
  measure: number;
  /** Beat position within measure (L:1/8 units, 0-based) */
  beatPosition: number;
}

export interface BassPatternDef {
  id: string;
  measures: 4 | 8 | 12 | 16;
  name: string;
  /** Per-measure contour direction. Length === measures */
  contour: ('asc' | 'desc' | 'hold')[];
  /** Which bass levels can use this pattern */
  applicableLevels: BassLevel[];
  description: string;
}

export interface ValidationResult {
  passed: boolean;
  violationCount: number;
  violations: Violation[];
}

export interface Violation {
  type: string;
  message: string;
  measure?: number;
  beatPosition?: number;
  severity: 'error' | 'warning';
}
