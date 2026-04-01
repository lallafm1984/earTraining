// ────────────────────────────────────────────────────────────────
// 2성부 멜로디 ↔ scoreGenerator 1성부 난이도·화음 스냅 정렬
// LEVEL_PARAMS(beginner_1…advanced_3)의 stepwiseProb, maxLeap, maxInterval,
// 강·약박 화음톤 스냅 확률을 동일 계열로 둔다.
// ────────────────────────────────────────────────────────────────

import type { PitchName } from '../scoreUtils';
import { CHORD_TONES, getBassBaseOctave, nnToMidi } from '../scoreUtils';

/** melodyLevel 1–9 ↔ scoreGenerator 9단계와 동일한 선율·도약 파라미터 */
export interface MelodyMotionParams {
  stepwiseProb: number;
  maxLeap: number;
  maxInterval: number;
  /** 강박: 이미 협화 선택 후 추가로 화음톤에 붙일 가중(내부 스냅 확률) */
  chordSnapStrong: number;
  /** 약박: 경과음 후 화음톤 스냅 */
  chordSnapWeak: number;
}

// beginner_1 … advanced_3 와 동일 수치 (consonanceRatio는 별도 처리)
export const MELODY_MOTION_BY_LEVEL: Record<number, MelodyMotionParams> = {
  1: { stepwiseProb: 0.95, maxLeap: 3, maxInterval: 3, chordSnapStrong: 0.68, chordSnapWeak: 0.20 },
  2: { stepwiseProb: 0.88, maxLeap: 4, maxInterval: 4, chordSnapStrong: 0.66, chordSnapWeak: 0.22 },
  3: { stepwiseProb: 0.82, maxLeap: 5, maxInterval: 5, chordSnapStrong: 0.64, chordSnapWeak: 0.22 },
  4: { stepwiseProb: 0.75, maxLeap: 5, maxInterval: 5, chordSnapStrong: 0.62, chordSnapWeak: 0.20 },
  5: { stepwiseProb: 0.70, maxLeap: 5, maxInterval: 5, chordSnapStrong: 0.58, chordSnapWeak: 0.18 },
  6: { stepwiseProb: 0.65, maxLeap: 5, maxInterval: 5, chordSnapStrong: 0.55, chordSnapWeak: 0.18 },
  7: { stepwiseProb: 0.60, maxLeap: 5, maxInterval: 5, chordSnapStrong: 0.52, chordSnapWeak: 0.16 },
  8: { stepwiseProb: 0.55, maxLeap: 5, maxInterval: 5, chordSnapStrong: 0.50, chordSnapWeak: 0.15 },
  9: { stepwiseProb: 0.50, maxLeap: 5, maxInterval: 5, chordSnapStrong: 0.48, chordSnapWeak: 0.15 },
};

export function getMelodyMotionParams(level: number): MelodyMotionParams {
  const k = Math.min(Math.max(level, 1), 9);
  return MELODY_MOTION_BY_LEVEL[k];
}

/**
 * 베이스 실제 음에 가장 잘 맞는 **화음 근음 도수**(0–6).
 * 각 근음의 트라이어드 구성음(스케일 도)을 베이스 옥타브대에서 스캔해 MIDI·PC로 매칭.
 * 매칭이 너무 나쁘면 `fallbackDegree`(진행표)를 쓴다.
 */
export function inferChordDegreeFromBassMidi(
  bassMidi: number,
  scale: PitchName[],
  keySignature: string,
  fallbackDegree: number,
): number {
  if (bassMidi <= 0 || !Number.isFinite(bassMidi)) {
    return ((fallbackDegree % 7) + 7) % 7;
  }
  const bassBase = getBassBaseOctave(scale);
  const targetPc = bassMidi % 12;
  let bestRoot = 0;
  let bestMetric = Infinity;

  for (let rootDeg = 0; rootDeg < 7; rootDeg++) {
    for (const deg of CHORD_TONES[rootDeg]) {
      for (let k = -3; k <= 3; k++) {
        const nn = deg + k * 7;
        const m = nnToMidi(nn, scale, bassBase, keySignature);
        const midiErr = Math.abs(m - bassMidi);
        const pcErr = (m % 12) === targetPc ? 0 : 30;
        const metric = midiErr + pcErr;
        if (metric < bestMetric) {
          bestMetric = metric;
          bestRoot = rootDeg;
        }
      }
    }
  }

  if (bestMetric > 36) {
    return ((fallbackDegree % 7) + 7) % 7;
  }
  return bestRoot;
}
