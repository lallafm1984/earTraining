// ────────────────────────────────────────────────────────────────
// BassNote[] → ScoreNote[] (grand staff bass staff)
// ────────────────────────────────────────────────────────────────

import type { BassNote } from './types';
import type { PitchName, NoteDuration, ScoreNote } from '../scoreUtils';
import { noteNumToNote, makeNote, SIXTEENTHS_TO_DUR } from '../scoreUtils';

/** Greedy-split sixteenths into representable standard durations (descending). */
const STANDARD_SIXTEENTHS = [24, 16, 12, 8, 6, 4, 3, 2, 1] as const;

function splitSixteenths(total: number): NoteDuration[] {
  const parts: NoteDuration[] = [];
  let remaining = total;
  while (remaining > 0) {
    const found = STANDARD_SIXTEENTHS.find(d => d <= remaining);
    if (!found) break;
    parts.push(SIXTEENTHS_TO_DUR[found] as NoteDuration);
    remaining -= found;
  }
  return parts;
}

/**
 * Convert engine bass output to score notes (L:1/8 duration → ABC duration).
 * When a duration has no direct ABC equivalent (e.g. 18 sixteenths for 9/8 full-bar),
 * it is split into tied standard notes.
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
    const { pitch, octave } = noteNumToNote(bn.noteNum, scale, bassBase);
    const oct = Math.max(2, Math.min(4, octave));

    const directLabel = SIXTEENTHS_TO_DUR[sixteenths];
    if (directLabel) {
      result.push(makeNote(pitch, oct, directLabel as NoteDuration));
    } else {
      // Split into tied standard notes (e.g. 18 sixteenths → '2.' tied '4.')
      const parts = splitSixteenths(sixteenths);
      for (let i = 0; i < parts.length; i++) {
        result.push(makeNote(pitch, oct, parts[i], '', i < parts.length - 1));
      }
    }
  }
  return result;
}
