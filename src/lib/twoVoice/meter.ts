// ────────────────────────────────────────────────────────────────
// Meter & strong-beat helpers (v4 spec)
// ────────────────────────────────────────────────────────────────
// Aligned with:
//   temp/ear_training_bass_prompt_v4.md — §강박 위치표 (L:1/8)
//   temp/ear_training_melody_prompt_v4.md — §강박 위치표
// STRONG_BEAT_MAP in scales.ts uses 1-based L:1/8 positions as in the docs.
// ────────────────────────────────────────────────────────────────

import type { TimeSignature } from './types';
import { STRONG_BEAT_MAP, MEASURE_TOTAL } from './scales';

/** Bar length in L:1/8 units (same as 문서 “마디 총 단위”). */
export function barTotalEighths(timeSig: TimeSignature): number {
  return MEASURE_TOTAL[timeSig];
}

/** Compound meters: 6/8, 9/8, 12/8 (♩. beat unit). */
export function isCompoundMeter(timeSig: TimeSignature): boolean {
  const [top, bot] = timeSig.split('/').map(s => parseInt(s, 10));
  return bot === 8 && top % 3 === 0 && top >= 6;
}

/**
 * Strong + mid-strong beat starts as 0-based L:1/8 offsets within a bar.
 * Use for melody `cumEighths` alignment (멜로디 프롬프트 협화 검증 지점).
 */
export function strongBeatOffsetsEighths0(timeSig: TimeSignature): number[] {
  const b = STRONG_BEAT_MAP[timeSig];
  const set = new Set<number>();
  for (const p of b.strong) set.add(p - 1);
  for (const p of b.mid) set.add(p - 1);
  return [...set].sort((a, c) => a - c);
}

/**
 * Same beats on the 16th-note grid (0-based offset within bar).
 * For counterpoint vertical checks & timelines.
 */
export function strongBeatOffsetsSixteenths0(timeSig: TimeSignature): Set<number> {
  const out = new Set<number>();
  for (const e of strongBeatOffsetsEighths0(timeSig)) {
    out.add(e * 2);
  }
  return out;
}
