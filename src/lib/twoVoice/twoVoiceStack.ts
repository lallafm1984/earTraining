// ────────────────────────────────────────────────────────────────
// Two-voice stack: bass (engine) → ScoreNote + melody (v4 modules)
// ────────────────────────────────────────────────────────────────
// Orchestrates ear_training_bass_prompt_v4 + melody_prompt_v4 pipeline
// before scoreGenerator cadence & global post-process.
// ────────────────────────────────────────────────────────────────

import type { BassLevel, TimeSignature, TwoVoiceBassOptions } from './types';
import type { ScoreNote } from '../scoreUtils';
import { getScaleDegrees, getBassBaseOctave } from '../scoreUtils';
import { generateBassWithRetry } from './bassWithRetry';
import { bassLineToScoreNotes } from './bassToScore';
import { generateMelody, type MelodyGeneratorOptions } from './melodyGenerator';

export interface TwoVoiceStackInput {
  keySignature: string;
  mode: 'major' | 'harmonic_minor';
  timeSig: TimeSignature;
  /** Total measures including final cadence bar */
  measures: number;
  /** Engine measures (4 | 8 | 12 | 16), must be >= measures - 1 */
  tvMeasures: 4 | 8 | 12 | 16;
  bassLevel: BassLevel;
  melodyLevel: number;
  progression: number[];
  trebleBaseOctave: number;
  /** Align with scoreGenerator treble nn floor/ceiling (grand staff). */
  melodyNnMin?: number;
  melodyNnMax?: number;
}

export interface TwoVoiceStackResult {
  bassScoreNotes: ScoreNote[];
  trebleScoreNotes: ScoreNote[];
}

/**
 * Generate bass as BassNote[], convert to score notes (body only, no cadence),
 * then generate treble with the dedicated melody engine.
 */
export function generateTwoVoiceStack(input: TwoVoiceStackInput): TwoVoiceStackResult {
  const {
    keySignature,
    mode,
    timeSig,
    measures,
    tvMeasures,
    bassLevel,
    melodyLevel,
    progression,
    trebleBaseOctave,
    melodyNnMin,
    melodyNnMax,
  } = input;

  const bassOpts: TwoVoiceBassOptions = {
    key: keySignature,
    mode,
    timeSig,
    measures: tvMeasures,
    bassLevel,
  };

  const bassLine = generateBassWithRetry(bassOpts).filter(
    bn => bn.measure < measures - 1,
  );

  const scale = getScaleDegrees(keySignature);
  const bassBase = getBassBaseOctave(scale);
  const bassScoreNotes = bassLineToScoreNotes(bassLine, scale, bassBase, keySignature);

  const melodyOpts: MelodyGeneratorOptions = {
    key: keySignature,
    mode,
    timeSig,
    measures,
    melodyLevel,
    progression,
    bassNotes: bassScoreNotes,
    trebleBaseOctave,
    melodyNnMin,
    melodyNnMax,
  };

  const trebleScoreNotes = generateMelody(melodyOpts);

  return { bassScoreNotes, trebleScoreNotes };
}
