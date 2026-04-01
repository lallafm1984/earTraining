// ────────────────────────────────────────────────────────────────
// BassNote[] → ScoreNote[] (grand staff bass staff)
// ────────────────────────────────────────────────────────────────

import type { BassNote } from './types';
import type { PitchName, NoteDuration, ScoreNote } from '../scoreUtils';
import { noteNumToNote, makeNote, SIXTEENTHS_TO_DUR } from '../scoreUtils';

/**
 * Convert engine bass output to score notes (L:1/8 duration → ABC duration).
 */
export function bassLineToScoreNotes(
  bassLine: BassNote[],
  scale: PitchName[],
  bassBase: number,
  _keySignature: string,
): ScoreNote[] {
  const result: ScoreNote[] = [];
  for (const bn of bassLine) {
    const sixteenths = bn.duration * 2;
    const durLabel = SIXTEENTHS_TO_DUR[sixteenths] || '4';
    const { pitch, octave } = noteNumToNote(bn.noteNum, scale, bassBase);
    const oct = Math.max(2, Math.min(4, octave));
    result.push(makeNote(pitch, oct, durLabel as NoteDuration));
  }
  return result;
}
