import {
  ScoreNote, NoteDuration, PitchName, Accidental,
  getSixteenthsPerBar,
  durationToSixteenths,
  getTupletActualSixteenths,
  noteToMidiWithKey,
  getKeySigAlteration,
  getKeySignatureAccidentalCount,
  getScaleDegrees,
  SIXTEENTHS_TO_DUR,
  splitAtBeatBoundaries,
  nnToMidi,
  getMidiInterval,
  isForbiddenMelodicInterval,
  PITCH_ORDER,
  getBassBaseOctave,
  CHORD_TONES,
  DISSONANT_PC,
  IMPERFECT_CONSONANT_PC,
  MIN_TREBLE_BASS_SEMITONES,
  uid,
  makeNote,
  makeRest,
  noteNumToNote,
  scaleNoteToNn,
  buildTrebleAttackMidiMap,
  passesBassSpacing,
  chordToneBnnCandidates,
  snapToChordTone,
  generateProgression,
  getStrongBeatOffsets,
} from './scoreUtils';

import type { BassLevel, TimeSignature as TVTimeSignature } from './twoVoice';
import { applyCounterpointCorrections, generateTwoVoiceStack, generateMelody } from './twoVoice';
import { applyMelodyAccidentals } from './twoVoice/chromaticAccidental';
import { fillRhythm } from './trebleRhythmFill';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

/**
 * 9단계 난이도 체계:
 *   초급 1~3 (beginner_1/2/3)  → 문서 Level 1~3
 *   중급 1~3 (intermediate_1/2/3) → 문서 Level 3~4 사이, Level 4, Level 4~5 사이
 *   고급 1~3 (advanced_1/2/3) → 문서 Level 5, Level 5~6 사이, Level 6
 */
export type Difficulty =
  | 'beginner_1' | 'beginner_2' | 'beginner_3'
  | 'intermediate_1' | 'intermediate_2' | 'intermediate_3'
  | 'advanced_1' | 'advanced_2' | 'advanced_3';

export type BassDifficulty = 'bass_1' | 'bass_2' | 'bass_3' | 'bass_4';

/** 상위 카테고리 */
export type DifficultyCategory = 'beginner' | 'intermediate' | 'advanced';

export function getDifficultyCategory(d: Difficulty): DifficultyCategory {
  if (d.startsWith('beginner')) return 'beginner';
  if (d.startsWith('intermediate')) return 'intermediate';
  return 'advanced';
}

/** 난이도를 내부 수치 레벨(1~9)로 변환 */
function difficultyLevel(d: Difficulty): number {
  const map: Record<Difficulty, number> = {
    beginner_1: 1, beginner_2: 2, beginner_3: 3,
    intermediate_1: 4, intermediate_2: 5, intermediate_3: 6,
    advanced_1: 7, advanced_2: 8, advanced_3: 9,
  };
  return map[d];
}

export interface GeneratorOptions {
  keySignature: string;
  timeSignature: string;
  difficulty: Difficulty;
  bassDifficulty?: BassDifficulty;
  measures: number;
  useGrandStaff: boolean;
}

export interface GeneratedScore {
  trebleNotes: ScoreNote[];
  bassNotes: ScoreNote[];
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

// PITCH_ORDER, getBassBaseOctave, CHORD_TONES → imported from scoreUtils

/**
 * 9단계별 리듬 풀 (16분음표 단위) — 누적 도입
 *   L1: 온(16)·2분(8)·4분(4)
 *   L2: + 점2분(12) / 쉼표 도입
 *   L3: + 8분(2) / 8분쉼표
 *   L4: + 점4분(6) — 4·8분 비중 약간↑
 *   L5: 붙임줄 당김음 (L4보다 촘촘한 풀)
 *   L6: + 16분(1) — 8·16 비중↑
 *   L7–L9: 점4·4·점8·8·16 균형 (고급은 중급보다 긴 음가 비중 유지)
 */
const DURATION_POOL: Record<Difficulty, number[]> = {
  // L1: 온·2분
  beginner_1:     [16, 8],
  // L2: 4분·점2분 (쉼표 포함)
  beginner_2:     [12, 8, 4],
  // L3: + 8분 (온음표 제외)
  beginner_3:     [12, 8, 4, 2],
  // L4: 점4분 중심 + 4·8 조금 더
  intermediate_1: [8, 6, 4, 4, 2, 2],
  // L5: L4와 동일 계열 (당김음·타이로 난이도 상승)
  intermediate_2: [8, 6, 4, 4, 2, 2],
  // L6: 16분 등장, 4분 비중 유지
  intermediate_3: [12, 8, 6, 4, 4, 4, 2, 2, 1],
  // L7–L9: 중급보다 2·4·8 비중 큼, 16·점8 유지, 4분 최소 1회
  advanced_1:     [8, 6, 6, 4, 4, 4, 3, 2, 1],
  advanced_2:     [8, 6, 6, 4, 4, 4, 3, 2, 1],
  advanced_3:     [8, 6, 6, 4, 4, 4, 3, 2, 1],
};


// ────────────────────────────────────────────────────────────────
// 단조 화성 지원
// ────────────────────────────────────────────────────────────────

function isMinorKey(keySignature: string): boolean {
  return keySignature.endsWith('m');
}

/**
 * 단조에서 올린 7음(leading tone)의 임시표를 결정.
 * 화성단음계: 7음을 반음 올림 → 이끔음(leading tone) 생성.
 * 예: Am에서 G→G#, Dm에서 C→C#, Gm에서 F→F#
 */
function getMinorLeadingToneAccidental(keySignature: string, seventhDegree: PitchName): Accidental {
  const keyAlt = getKeySigAlteration(keySignature, seventhDegree);
  // 조표에서 이미 b가 붙은 음이면 내추럴로 올림, 아니면 #
  if (keyAlt === 'b') return 'n';
  return '#';
}

// ────────────────────────────────────────────────────────────────
// Bass difficulty labels & params
// ────────────────────────────────────────────────────────────────

export const BASS_DIFF_LABELS: Record<BassDifficulty, string> = {
  bass_1: '1단계', bass_2: '2단계', bass_3: '3단계', bass_4: '4단계',
};

export const BASS_DIFF_DESC: Record<BassDifficulty, string> = {
  bass_1: '지속음 — 마디당 한 음 유지',
  bass_2: '순차진행 — 2도 순차 이동만',
  bass_3: '순차+도약 — 간헐적 5도 포함',
  bass_4: '혼합리듬 — 도약+리듬 변화',
};

interface BassLevelParams {
  mode: 'pedal' | 'root_beat' | 'directed_step' | 'harmonic_half' | 'harmonic_mixed';
  durationPool: number[];
  minDur: number;
}

const BASS_LEVEL_PARAMS: Record<BassDifficulty, BassLevelParams> = {
  bass_1: { mode: 'pedal',           durationPool: [16, 8], minDur: 8 },
  bass_2: { mode: 'harmonic_half',   durationPool: [8],     minDur: 8 },
  bass_3: { mode: 'harmonic_mixed',  durationPool: [8, 4],  minDur: 4 },
  bass_4: { mode: 'harmonic_mixed',  durationPool: [8, 4, 2], minDur: 2 },
};

// MIN_TREBLE_BASS_SEMITONES, DISSONANT_PC, IMPERFECT_CONSONANT_PC, buildTrebleAttackMidiMap → imported from scoreUtils

// ────────────────────────────────────────────────────────────────
// New two-voice bass integration helpers
// ────────────────────────────────────────────────────────────────

function mapBassDifficultyToLevel(bd: BassDifficulty): BassLevel {
  const map: Record<BassDifficulty, BassLevel> = { bass_1: 1, bass_2: 2, bass_3: 3, bass_4: 4 };
  return map[bd];
}

/**
 * Build attack MIDI map for bass ScoreNotes within a bar.
 * Maps 16th-note offset → MIDI value for each bass note attack in the bar.
 */
function buildBassAttackMidiMap(
  bassNotes: ScoreNote[],
  barStartSixteenths: number,
  barLengthSixteenths: number,
  keySignature: string,
): Map<number, number> {
  const map = new Map<number, number>();
  let off = 0;
  for (const n of bassNotes) {
    const dur = durationToSixteenths(n.duration);
    if (off >= barStartSixteenths && off < barStartSixteenths + barLengthSixteenths) {
      if (n.pitch !== 'rest') {
        map.set(off - barStartSixteenths, noteToMidiWithKey(n, keySignature));
      }
    }
    off += dur;
  }
  return map;
}


// ────────────────────────────────────────────────────────────────
// 난이도별 파라미터 테이블 (문서 기반)
// ────────────────────────────────────────────────────────────────

interface LevelParams {
  // 선율
  maxInterval: number;          // 최대 음정 (도 단위)
  stepwiseProb: number;         // 순차진행 확률
  maxLeap: number;              // 허용 도약 (도)
  chromaticBudget: [number, number]; // 반음계 임시표 [min, max]
  chromaticProb: number;        // 노트당 임시표 확률
  // 리듬
  syncopationProb: number;      // 당김음 확률
  tripletBudget: [number, number]; // 셋잇단 [min, max]
  tripletProb: number;          // 셋잇단 삽입 확률
  /** 붙임줄(같은 음·타이): 직전 음과 높이가 같을 때만 적용 */
  tieProb: number;
  restProb: number;             // 쉼표 확률
  dottedProb: number;           // 점음표 확률
  // 2성부
  contraryMotionRatio: number;  // 반진행 비율
  bassIndependence: number;     // 베이스 리듬 독립도 (0~1)
  voiceCrossingMax: number;     // 성부 교차 최대 횟수
  consonanceRatio: number;      // 협화음 비율
  // 종지
  cadenceType: string[];        // 사용 가능한 종지 유형
  // 함정
  maxTraps: number;             // 연습 1회당 최대 함정 수
}

const LEVEL_PARAMS: Record<Difficulty, LevelParams> = {
  // ── L1: 온·2분·4분 ──
  beginner_1: {
    maxInterval: 3, stepwiseProb: 0.95, maxLeap: 3,
    chromaticBudget: [0, 0], chromaticProb: 0,
    syncopationProb: 0, tripletBudget: [0, 0], tripletProb: 0,
    tieProb: 0, restProb: 0, dottedProb: 0,
    contraryMotionRatio: 0.30, bassIndependence: 0,
    voiceCrossingMax: 0, consonanceRatio: 1.0,
    cadenceType: ['perfect'],
    maxTraps: 0,
  },
  // ── L2: 점2분·쉼표 ──
  beginner_2: {
    maxInterval: 4, stepwiseProb: 0.88, maxLeap: 4,
    chromaticBudget: [0, 0], chromaticProb: 0,
    syncopationProb: 0, tripletBudget: [0, 0], tripletProb: 0,
    tieProb: 0, restProb: 0.20, dottedProb: 0.35,
    contraryMotionRatio: 0.30, bassIndependence: 0,
    voiceCrossingMax: 0, consonanceRatio: 1.0,
    cadenceType: ['perfect'],
    maxTraps: 0,
  },
  // ── L3: 8분·8분쉼표 ──
  beginner_3: {
    maxInterval: 5, stepwiseProb: 0.82, maxLeap: 5,
    chromaticBudget: [0, 0], chromaticProb: 0,
    syncopationProb: 0, tripletBudget: [0, 0], tripletProb: 0,
    tieProb: 0, restProb: 0.20, dottedProb: 0.25,
    contraryMotionRatio: 0.40, bassIndependence: 0.2,
    voiceCrossingMax: 0, consonanceRatio: 0.95,
    cadenceType: ['perfect'],
    maxTraps: 0,
  },
  // ── L4: 점4분 ──
  intermediate_1: {
    maxInterval: 5, stepwiseProb: 0.75, maxLeap: 5,
    chromaticBudget: [0, 0], chromaticProb: 0,
    syncopationProb: 0, tripletBudget: [0, 0], tripletProb: 0,
    tieProb: 0, restProb: 0.15, dottedProb: 0.80,
    contraryMotionRatio: 0.50, bassIndependence: 0.3,
    voiceCrossingMax: 0, consonanceRatio: 0.92,
    cadenceType: ['perfect', 'half'],
    maxTraps: 0,
  },
  // ── L5: 붙임줄 당김음 ──
  intermediate_2: {
    maxInterval: 5, stepwiseProb: 0.70, maxLeap: 5,
    chromaticBudget: [0, 0], chromaticProb: 0,
    syncopationProb: 0.30, tripletBudget: [0, 0], tripletProb: 0,
    tieProb: 0.30, restProb: 0.15, dottedProb: 0.22,
    contraryMotionRatio: 0.50, bassIndependence: 0.45,
    voiceCrossingMax: 0, consonanceRatio: 0.88,
    cadenceType: ['perfect', 'half', 'plagal'],
    maxTraps: 1,
  },
  // ── L6: 16분·16분쉼표 ──
  intermediate_3: {
    maxInterval: 5, stepwiseProb: 0.65, maxLeap: 5,
    chromaticBudget: [0, 0], chromaticProb: 0,
    syncopationProb: 0.26, tripletBudget: [0, 0], tripletProb: 0,
    tieProb: 0.20, restProb: 0.20, dottedProb: 0.22,
    contraryMotionRatio: 0.55, bassIndependence: 0.55,
    voiceCrossingMax: 1, consonanceRatio: 0.85,
    cadenceType: ['perfect', 'half', 'plagal'],
    maxTraps: 1,
  },
  // ── L7: 점8분 ──
  advanced_1: {
    maxInterval: 5, stepwiseProb: 0.60, maxLeap: 5,
    chromaticBudget: [0, 0], chromaticProb: 0,
    syncopationProb: 0.22, tripletBudget: [0, 0], tripletProb: 0,
    tieProb: 0.25, restProb: 0.20, dottedProb: 0.38,
    contraryMotionRatio: 0.60, bassIndependence: 0.65,
    voiceCrossingMax: 1, consonanceRatio: 0.82,
    cadenceType: ['perfect', 'half', 'plagal', 'deceptive'],
    maxTraps: 2,
  },
  // ── L8: 임시표 ──
  advanced_2: {
    maxInterval: 5, stepwiseProb: 0.55, maxLeap: 5,
    chromaticBudget: [2, 4], chromaticProb: 0.15,
    syncopationProb: 0.22, tripletBudget: [0, 0], tripletProb: 0,
    tieProb: 0.25, restProb: 0.20, dottedProb: 0.30,
    contraryMotionRatio: 0.65, bassIndependence: 0.75,
    voiceCrossingMax: 2, consonanceRatio: 0.80,
    cadenceType: ['perfect', 'half', 'plagal', 'deceptive'],
    maxTraps: 2,
  },
  // ── L9: 셋잇단 ──
  advanced_3: {
    maxInterval: 5, stepwiseProb: 0.50, maxLeap: 5,
    chromaticBudget: [2, 4], chromaticProb: 0.15,
    syncopationProb: 0.26, tripletBudget: [1, 3], tripletProb: 0.50,
    tieProb: 0.25, restProb: 0.20, dottedProb: 0.30,
    contraryMotionRatio: 0.65, bassIndependence: 0.85,
    voiceCrossingMax: 2, consonanceRatio: 0.78,
    cadenceType: ['perfect', 'half', 'plagal', 'deceptive', 'cadential64'],
    maxTraps: 3,
  },
};

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// uid, makeNote → imported from scoreUtils

/** 직전 으뜸 성부 음(쉼표 제외) — 붙임줄(같은 음) 여부 판별용 */
function lastNonRestMelody(notes: ScoreNote[]): ScoreNote | null {
  for (let k = notes.length - 1; k >= 0; k--) {
    if (notes[k].pitch !== 'rest') return notes[k];
  }
  return null;
}

function samePitchHeight(a: ScoreNote, pitch: PitchName, octave: number, accidental: Accidental): boolean {
  return a.pitch === pitch && a.octave === octave && a.accidental === accidental;
}

// makeRest, noteNumToNote → imported from scoreUtils
// fillRhythm → ./trebleRhythmFill

// generateProgression → imported from scoreUtils

// ── 셋잇단음표 삽입 ──
function tryInsertTriplet(
  notes: ScoreNote[],
  pitchFn: (idx: number) => { pitch: PitchName; octave: number },
  maxRemaining: number,
  prob: number,
): { inserted: boolean; lastNn?: number } {
  if (maxRemaining < 4 || Math.random() > prob) return { inserted: false };
  for (let k = 0; k < 3; k++) {
    const { pitch, octave } = pitchFn(k);
    notes.push({
      id: uid(), pitch, octave, accidental: '' as Accidental,
      duration: '8', tie: false,
      // tupletNoteDur: [2, 1, 1] — 합계 4 (4분음표 span)
      ...(k === 0
        ? { tuplet: '3' as const, tupletSpan: '4' as NoteDuration, tupletNoteDur: 2 }
        : { tupletNoteDur: 1 }),
    });
  }
  return { inserted: true };
}

// ────────────────────────────────────────────────────────────────
// ★ 후처리: 연속 동일음 3회 이상 제거 (안전망)
// ────────────────────────────────────────────────────────────────
// ★ 후처리: 임시표 정리 — 대위법 보정 후 깨진 임시표 제거
// ────────────────────────────────────────────────────────────────
/**
 * 대위법·강박 보정 등의 후처리에서 음이 이동하면 임시표의 해결 관계가 깨질 수 있다.
 * 1) 해결 없는 임시표 (다음 음과 >3반음) → 임시표 제거
 * 2) 인접 동일 임시표 (같은 음·같은 임시표 연속) → 두 번째 임시표 제거
 * 3) 진입 단2도 (직전 음과 1반음) → 임시표 제거
 * 4) 진입 큰도약 (직전 음과 >7반음) → 임시표 제거
 * 5) 삼전음 (직전 또는 다음 음과 6반음) → 임시표 제거
 */
function cleanupBrokenAccidentals(notes: ScoreNote[], keySignature: string): void {
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (!n.accidental) continue;
    if (n.pitch === 'rest') continue;

    // ── 인접 동일 임시표: 직전 음과 같은 음+임시표면 두 번째 제거 ──
    if (i > 0) {
      const prev = notes[i - 1];
      if (prev.pitch === n.pitch && prev.octave === n.octave &&
          prev.accidental === n.accidental) {
        notes[i] = { ...n, accidental: '' as Accidental };
        continue;
      }
    }

    const curMidi = noteToMidiWithKey(n, keySignature);

    // ── 직전 피치음과의 관계 검사 ──
    let prevMidi = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (notes[j].pitch !== 'rest') {
        prevMidi = noteToMidiWithKey(notes[j], keySignature);
        break;
      }
    }
    if (prevMidi > 0) {
      const entryDist = Math.abs(curMidi - prevMidi);
      // 단2도(1반음) 진입: 불협화 충돌
      if (entryDist === 1) {
        notes[i] = { ...n, accidental: '' as Accidental };
        continue;
      }
      // 큰 도약(>7반음) 진입: 부자연스러운 연결
      if (entryDist > 7) {
        notes[i] = { ...n, accidental: '' as Accidental };
        continue;
      }
      // 삼전음(6반음) 진입
      if (entryDist === 6) {
        notes[i] = { ...n, accidental: '' as Accidental };
        continue;
      }
    }

    // ── 같은방향 연속 도약: prev→acc→next 모두 같은 방향 + 양쪽 3반음 이상 ──
    if (prevMidi > 0) {
      let nextMidiForDir = -1;
      for (let j = i + 1; j < notes.length; j++) {
        if (notes[j].pitch !== 'rest') {
          nextMidiForDir = noteToMidiWithKey(notes[j], keySignature);
          break;
        }
      }
      if (nextMidiForDir > 0) {
        const entryDir = curMidi - prevMidi;
        const exitDir = nextMidiForDir - curMidi;
        // 같은 방향으로 양쪽 다 3반음 이상 도약
        if (entryDir > 0 && exitDir > 0 && Math.abs(entryDir) >= 3 && Math.abs(exitDir) >= 3) {
          notes[i] = { ...n, accidental: '' as Accidental };
          continue;
        }
        if (entryDir < 0 && exitDir < 0 && Math.abs(entryDir) >= 3 && Math.abs(exitDir) >= 3) {
          notes[i] = { ...n, accidental: '' as Accidental };
          continue;
        }
      }
    }

    // ── 다음 피치음과의 관계 검사 ──
    let nextMidi = -1;
    for (let j = i + 1; j < notes.length; j++) {
      if (notes[j].pitch !== 'rest') {
        nextMidi = noteToMidiWithKey(notes[j], keySignature);
        break;
      }
    }
    if (nextMidi > 0) {
      const exitDist = Math.abs(curMidi - nextMidi);
      // 해결 없는 임시표: >3반음 도약
      if (exitDist > 3) {
        notes[i] = { ...n, accidental: '' as Accidental };
        continue;
      }
      // 삼전음(6반음) 탈출
      if (exitDist === 6) {
        notes[i] = { ...n, accidental: '' as Accidental };
        continue;
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────
// ★ 후처리: 삼전음(Tritone, 6반음) 도약 보정
// ────────────────────────────────────────────────────────────────
/**
 * 인접한 두 음의 MIDI 거리가 정확히 6반음(증4도/감5도)이면
 * 두 번째 음을 ±1 스케일도 이동하여 삼전음을 회피.
 */
function fixTritoneleaps(
  notes: ScoreNote[],
  scale: PitchName[],
  baseOctave: number,
  keySignature: string,
): void {
  for (let i = 1; i < notes.length; i++) {
    const prev = notes[i - 1];
    const cur = notes[i];
    if (prev.pitch === 'rest' || cur.pitch === 'rest') continue;
    // 타이로 연결된 음은 스킵
    if (prev.tie) continue;

    const prevMidi = noteToMidiWithKey(prev, keySignature);
    const curMidi = noteToMidiWithKey(cur, keySignature);
    if (Math.abs(curMidi - prevMidi) !== 6) continue;

    // 임시표가 있는 음은 임시표 제거로 해결 시도
    if (cur.accidental) {
      const stripped = { ...cur, accidental: '' as Accidental };
      const strippedMidi = noteToMidiWithKey(stripped, keySignature);
      if (Math.abs(strippedMidi - prevMidi) !== 6) {
        notes[i] = stripped;
        continue;
      }
    }

    // 스케일 음 ±1도 이동
    const curNn = scaleNoteToNn(cur.pitch, cur.octave, scale, baseOctave);
    if (curNn < 0) continue; // 스케일 음이 아니면 스킵

    const dir = curMidi > prevMidi ? -1 : 1; // 반대 방향으로 축소
    for (const delta of [dir, -dir]) {
      const candNn = curNn + delta;
      if (candNn < 0) continue;
      const cand = noteNumToNote(candNn, scale, baseOctave);
      const candMidi = noteToMidiWithKey(makeNote(cand.pitch, cand.octave, cur.duration), keySignature);
      if (Math.abs(candMidi - prevMidi) !== 6 && cand.octave >= 2 && cand.octave <= 6) {
        notes[i] = { ...cur, pitch: cand.pitch as PitchName, octave: cand.octave, accidental: '' as Accidental };
        break;
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────
/**
 * MIDI 기준 연속 3회 이상 동일음을 인접 음계음으로 교체.
 * 타이로 연결된 음은 의도적 반복이므로 건드리지 않는다.
 */
function fixConsecutiveRepeats(
  notes: ScoreNote[],
  scale: PitchName[],
  baseOctave: number,
  keySignature: string,
): void {
  // 종지 마디 마지막 음은 으뜸음이므로 교체 금지
  let lastMelodicIdx = -1;
  for (let k = notes.length - 1; k >= 0; k--) {
    if (notes[k].pitch !== 'rest') { lastMelodicIdx = k; break; }
  }

  const MAX_REPEAT = 2; // 최대 허용 연속 동일음 (2 = 타이 1쌍)
  let runStart = 0;
  for (let i = 1; i <= notes.length; i++) {
    const prev = notes[i - 1];
    const cur = i < notes.length ? notes[i] : null;
    const same = cur &&
      cur.pitch !== 'rest' && prev.pitch !== 'rest' &&
      noteToMidiWithKey(cur, keySignature) === noteToMidiWithKey(prev, keySignature);
    if (same) continue;

    // run: [runStart .. i-1] 모두 같은 MIDI
    const runLen = i - runStart;
    if (runLen > MAX_REPEAT) {
      // runStart+MAX_REPEAT 부터 끝까지 교체
      const baseMidi = noteToMidiWithKey(notes[runStart], keySignature);
      for (let j = runStart + MAX_REPEAT; j < i; j++) {
        const n = notes[j];
        if (n.pitch === 'rest') continue;
        // 종지음(마지막 멜로디 음)은 교체 금지
        if (j === lastMelodicIdx) continue;
        // 타이 앞 음이면 스킵 (타이 쌍은 의도적)
        if (j > 0 && notes[j - 1].tie) continue;
        // 순차 이동: 위로 1도 시도, 실패 시 아래로
        const curNn = scaleNoteToNn(n.pitch, n.octave, scale, baseOctave);
        const upNn = curNn + 1;
        const dnNn = curNn - 1;
        const up = noteNumToNote(upNn, scale, baseOctave);
        const dn = noteNumToNote(dnNn, scale, baseOctave);
        const upMidi = noteToMidiWithKey(makeNote(up.pitch, up.octave, n.duration), keySignature);
        const dnMidi = noteToMidiWithKey(makeNote(dn.pitch, dn.octave, n.duration), keySignature);
        // 이전 음과 다른 방향 우선
        const target = (upMidi !== baseMidi && up.octave <= 5) ? up
          : (dnMidi !== baseMidi && dn.octave >= 2) ? dn : up;
        notes[j] = { ...n, pitch: target.pitch as PitchName, octave: target.octave, accidental: '' as Accidental };
      }
    }
    runStart = i;
  }
}

// scaleNoteToNn → imported from scoreUtils

// ────────────────────────────────────────────────────────────────
// ★ 후처리: 단조 대사관계(False Relation / Cross-Relation) 방지
// ────────────────────────────────────────────────────────────────
/**
 * 단조에서 트레블이 올린 7음(이끔음)을 연주하는 박자에 베이스가 내린 7음(자연단음계)을
 * 동시 또는 인접 박자에서 연주하면 대사관계(cross-relation)가 발생.
 * 해당 베이스 음을 근음(1도)으로 교체하여 해결.
 */
function fixMinorCrossRelation(
  treble: ScoreNote[], bass: ScoreNote[],
  scale: PitchName[], seventhDeg: PitchName, leadingAcc: Accidental,
  bassBase: number, keySignature: string, sixteenthsPerBar: number,
): void {
  if (!leadingAcc || bass.length === 0) return;

  // 트레블/베이스 공격점 타임라인 구축
  const trebleAttacks: { offset: number; idx: number; note: ScoreNote }[] = [];
  const bassAttacks: { offset: number; idx: number; note: ScoreNote }[] = [];
  let off = 0;
  for (let i = 0; i < treble.length; i++) {
    trebleAttacks.push({ offset: off, idx: i, note: treble[i] });
    off += durationToSixteenths(treble[i].duration);
  }
  off = 0;
  for (let i = 0; i < bass.length; i++) {
    bassAttacks.push({ offset: off, idx: i, note: bass[i] });
    off += durationToSixteenths(bass[i].duration);
  }

  // 트레블에서 올린 7음 사용 위치 수집
  const raisedOffsets = new Set<number>();
  for (const ta of trebleAttacks) {
    if (ta.note.pitch === seventhDeg && ta.note.accidental === leadingAcc) {
      raisedOffsets.add(ta.offset);
    }
  }
  if (raisedOffsets.size === 0) return;

  // 베이스에서 내린 7음(자연단음계 7음, 임시표 없음)이 동시 또는 ±1박 이내에 있으면 교체
  const tonicPitch = scale[0];
  for (const ba of bassAttacks) {
    if (ba.note.pitch !== seventhDeg || ba.note.accidental !== '') continue;
    // 동시 또는 인접 박자 확인
    const beatLen = sixteenthsPerBar >= 12 ? 6 : 4; // 복합박자 6, 단순박자 4
    const hasCrossRelation = [...raisedOffsets].some(ro => Math.abs(ro - ba.offset) <= beatLen);
    if (!hasCrossRelation) continue;
    // 근음으로 교체
    const { octave } = noteNumToNote(0, scale, bassBase);
    const oct = Math.max(2, Math.min(4, octave));
    bass[ba.idx] = { ...ba.note, pitch: tonicPitch, octave: oct };
  }
}

// ────────────────────────────────────────────────────────────────
// ★ 종지 쉼표 — 마지막 마디 하드코딩
// ────────────────────────────────────────────────────────────────
function generateCadenceMeasure(
  scale: PitchName[],
  trebleBase: number,
  bassBase: number,
  sixteenthsPerBar: number,
  useGrandStaff: boolean,
  keySignature: string,
): { treble: ScoreNote[]; bass: ScoreNote[] } {
  const tonicPitch = scale[0];
  const bassDeg    = noteNumToNote(0, scale, bassBase);
  let bassOctave = Math.max(2, Math.min(3, bassDeg.octave));

  const canUsePatternB = sixteenthsPerBar >= 16 && !!SIXTEENTHS_TO_DUR[12] && !!SIXTEENTHS_TO_DUR[4];
  const usePatternB    = canUsePatternB && Math.random() < 0.5;

  const noteSixteenths = usePatternB ? 12 : Math.min(8, sixteenthsPerBar);
  const restSixteenths = sixteenthsPerBar - noteSixteenths;

  const noteDur = SIXTEENTHS_TO_DUR[noteSixteenths] || '2';

  const trebleMelody = makeNote(tonicPitch, trebleBase, noteDur);
  let bassMelody = makeNote(bassDeg.pitch, bassOctave, noteDur);
  while (
    useGrandStaff &&
    noteToMidiWithKey(trebleMelody, keySignature) === noteToMidiWithKey(bassMelody, keySignature) &&
    bassOctave > 2
  ) {
    bassOctave--;
    bassMelody = makeNote(bassDeg.pitch, bassOctave, noteDur);
  }

  // 트레블: 강박(pos 0)에서 tonic 시작 → 종결감 유지
  const treble: ScoreNote[] = [makeNote(tonicPitch, trebleBase, noteDur)];
  if (restSixteenths > 0) {
    treble.push(makeRest(SIXTEENTHS_TO_DUR[restSixteenths] || '4'));
  }

  const bass: ScoreNote[] = useGrandStaff ? [bassMelody] : [];
  if (useGrandStaff && restSixteenths > 0) {
    bass.push(makeRest(SIXTEENTHS_TO_DUR[restSixteenths] || '4'));
  }

  return { treble, bass };
}

/**
 * 새 2성부: 대위 보정·후처리 후에도 종지 마지막 **실음**이 으뜸(트레블)·근음(베이스)이 되도록 복구.
 * `generateCadenceMeasure`와 같은 음높이 규칙을 쓴다.
 */
function forceGrandStaffFinalTonic(
  treble: ScoreNote[],
  bass: ScoreNote[],
  scale: PitchName[],
  trebleBase: number,
  bassBase: number,
): void {
  const tTonic = noteNumToNote(0, scale, trebleBase);
  for (let i = treble.length - 1; i >= 0; i--) {
    if (treble[i].pitch === 'rest') continue;
    treble[i] = {
      ...treble[i],
      pitch: tTonic.pitch,
      octave: tTonic.octave,
      accidental: '' as Accidental,
    };
    break;
  }
  const bDeg = noteNumToNote(0, scale, bassBase);
  const bOct = Math.max(2, Math.min(3, bDeg.octave));
  for (let i = bass.length - 1; i >= 0; i--) {
    if (bass[i].pitch === 'rest') continue;
    bass[i] = {
      ...bass[i],
      pitch: bDeg.pitch,
      octave: bOct,
      accidental: '' as Accidental,
    };
    break;
  }
}

// ────────────────────────────────────────────────────────────────
// ★ 곡 내부 쉼표 — 후처리
// ────────────────────────────────────────────────────────────────
function applyInternalRests(
  treble: ScoreNote[],
  bass: ScoreNote[],
  difficulty: Difficulty,
  measures: number,
  sixteenthsPerBar: number,
  useGrandStaff: boolean,
  timeSignature?: string,
): void {
  const lvl = difficultyLevel(difficulty);
  const params = LEVEL_PARAMS[difficulty];
  const beatSize = (() => {
    if (!timeSignature) return 4;
    const [, bs] = timeSignature.split('/');
    return 16 / (parseInt(bs, 10) || 4);
  })();

  // 쉼표 예산: L1=0, L2~L4=최대1, L5+=최대2
  const maxBudget = lvl === 1 ? 0 : lvl <= 4 ? 1 : 2;
  // 0~maxBudget 범위 (0이면 쉼표 없음 → ~50% 확률로 쉼표 삽입)
  const budget = maxBudget === 0 || params.restProb === 0
    ? 0
    : Math.floor(Math.random() * (maxBudget + 1));
  if (budget === 0) return;

  type NotePos = { noteIdx: number; bar: number; offset: number; dur: number };
  const sizMap: Record<NoteDuration, number> = {
    '1': 16, '1.': 24, '2': 8, '2.': 12, '4': 4, '4.': 6, '8': 2, '8.': 3, '16': 1,
  };

  const timeline: NotePos[] = [];
  let pos = 0;
  let tupletRemain = 0;
  let tupletActualTotal = 0;
  let tupletNoteIdx = 0;
  let tupletCount = 0;
  for (let i = 0; i < treble.length; i++) {
    const note = treble[i];
    let dur: number;

    if (note.tuplet) {
      // 셋잇단 그룹 시작: 실제 재생 시간으로 계산
      tupletCount = parseInt(note.tuplet, 10);
      const spanDur = note.tupletSpan || note.duration;
      tupletActualTotal = getTupletActualSixteenths(note.tuplet, spanDur);
      tupletRemain = tupletCount;
      tupletNoteIdx = 0;
    }

    if (tupletRemain > 0) {
      // 셋잇단 음표: 첫 음에 전체 실제 시간 할당, 나머지는 0
      // (inTuplet으로 후보에서 제외되므로 개별 offset 정확도 불필요)
      dur = tupletNoteIdx === 0 ? tupletActualTotal : 0;
      tupletNoteIdx++;
      tupletRemain--;
    } else {
      dur = sizMap[note.duration] ?? 4;
    }

    timeline.push({ noteIdx: i, bar: Math.floor(pos / sixteenthsPerBar), offset: pos % sixteenthsPerBar, dur });
    pos += dur;
  }

  const inTuplet = new Set<number>();
  for (let i = 0; i < treble.length; i++) {
    const note = treble[i];
    if (note.tuplet) {
      const count = parseInt(note.tuplet, 10);
      for (let k = 0; k < count; k++) inTuplet.add(i + k);
    }
  }

  const bassRestAt = new Set<string>();
  if (useGrandStaff) {
    let bpos = 0;
    for (const bn of bass) {
      const bdur = sizMap[bn.duration] ?? 4;
      if (bn.pitch === 'rest') {
        bassRestAt.add(`${Math.floor(bpos / sixteenthsPerBar)}_${bpos % sixteenthsPerBar}`);
      }
      bpos += bdur;
    }
  }

  const isRest = (idx: number) => treble[idx]?.pitch === 'rest';

  let candidates: NotePos[] = [];

  if (lvl <= 2) {
    // L2: 4분음표만, 약박 위치
    candidates = timeline.filter((p, idx) =>
      p.dur === 4 &&
      (p.offset === 4 || p.offset === 12) &&
      !isRest(p.noteIdx) &&
      !inTuplet.has(p.noteIdx) &&
      !isRest(timeline[idx - 1]?.noteIdx ?? -1) &&
      !isRest(timeline[idx + 1]?.noteIdx ?? -1)
    );
  } else {
    // 중급·고급: 4분 쉼표 + 8분 쉼표 (정박만)
    const quarterCandidates = timeline.filter((p, idx) =>
      p.dur === 4 &&
      (p.offset === 4 || p.offset === 12) &&
      !isRest(p.noteIdx) && !inTuplet.has(p.noteIdx) &&
      !isRest(timeline[idx - 1]?.noteIdx ?? -1) &&
      !isRest(timeline[idx + 1]?.noteIdx ?? -1)
    );
    // 8분 쉼표: 정박(박 머리) 위치에서만 허용 — 엇박 8분 쉼표 방지
    const eighthCandidates = timeline.filter((p, idx) => {
      if (p.dur !== 2) return false;
      if (p.offset % beatSize !== 0) return false; // 정박만
      if (p.bar === 0 && p.offset === 0) return false; // 첫 마디 첫 박 제외
      const next = timeline[idx + 1];
      if (!next || next.dur !== 2) return false;
      return !isRest(p.noteIdx) && !inTuplet.has(p.noteIdx) &&
        !isRest(timeline[idx - 1]?.noteIdx ?? -1) && !isRest(next.noteIdx);
    });
    // 8분 쉼표 비중을 높여 실제 선택 확률 확보 (1:2)
    candidates = [...quarterCandidates, ...eighthCandidates, ...eighthCandidates];
  }

  candidates = candidates.filter(p =>
    p.bar < measures - 1 &&
    !bassRestAt.has(`${p.bar}_${p.offset}`)
  );

  if (candidates.length === 0) return;

  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const chosen: NotePos[] = [];
  const chosenIdx = new Set<number>();
  for (const c of shuffled) {
    if (chosen.length >= budget) break;
    const prevIdx = c.noteIdx - 1;
    const nextIdx = c.noteIdx + 1;
    if (chosenIdx.has(prevIdx) || chosenIdx.has(nextIdx)) continue;
    chosen.push(c);
    chosenIdx.add(c.noteIdx);
  }

  for (const c of chosen) {
    if (c.noteIdx > 0 && treble[c.noteIdx - 1]?.tie) {
      treble[c.noteIdx - 1] = { ...treble[c.noteIdx - 1], tie: false };
    }
    treble[c.noteIdx] = makeRest(treble[c.noteIdx].duration);
  }
}

// ────────────────────────────────────────────────────────────────
// 선율 규칙 (1성부 선율 작법 가이드라인)
// ────────────────────────────────────────────────────────────────

/**
 * Rule 2: 증/감음정 금지 — 트라이톤·증2도 직접 도약 방지.
 * 금지 음정이면 nn을 ±1 조정하여 회피.
 */
function fixForbiddenInterval(
  nn: number, prevNn: number,
  scale: PitchName[], baseOctave: number, keySignature: string,
  rangeMin: number, rangeMax: number,
): number {
  const nnDist = Math.abs(nn - prevNn);
  if (nnDist === 0) return nn;
  const semi = getMidiInterval(prevNn, nn, scale, baseOctave, keySignature);
  if (!isForbiddenMelodicInterval(semi, nnDist)) return nn;

  // nn ±1 중 금지 아닌 쪽 선택
  const dir = nn > prevNn ? 1 : -1;
  for (const delta of [dir, -dir]) {
    const cand = nn + delta;
    if (cand < rangeMin || cand > rangeMax) continue;
    const candSemi = getMidiInterval(prevNn, cand, scale, baseOctave, keySignature);
    const candNnDist = Math.abs(cand - prevNn);
    if (!isForbiddenMelodicInterval(candSemi, candNnDist)) return cand;
  }
  // 두 쪽 다 금지면 ±2 시도
  for (const delta of [dir * 2, -dir * 2]) {
    const cand = nn + delta;
    if (cand < rangeMin || cand > rangeMax) continue;
    const candSemi = getMidiInterval(prevNn, cand, scale, baseOctave, keySignature);
    const candNnDist = Math.abs(cand - prevNn);
    if (!isForbiddenMelodicInterval(candSemi, candNnDist)) return cand;
  }
  return nn; // 극히 드문 경우 그대로
}

/**
 * Rule 1: 갭-필 원칙 — 완전4도(nn 4) 이상 도약 후 반대방향 순차 강제.
 * isInTriadChain이면 예외 (Rule 3 트라이어드 진행 중).
 */
function applyGapFill(
  nn: number, prevNn: number, prevInterval: number, prevDir: number,
  isInTriadChain: boolean,
  rangeMin: number, rangeMax: number,
): number {
  if (isInTriadChain) return nn;
  if (Math.abs(prevInterval) < 4) return nn;
  // 반대방향 순차 강제
  const target = prevNn + (prevDir > 0 ? -1 : 1);
  return Math.max(rangeMin, Math.min(rangeMax, target));
}

/** 스케일 디그리 집합이 어떤 온음계 3화음의 부분집합인지 판별 */
function isTriadSubset(degrees: number[]): boolean {
  // 7개 온음계 3화음: I(0,2,4) ii(1,3,5) iii(2,4,6) IV(3,5,0) V(4,6,1) vi(5,0,2) vii°(6,1,3)
  const triads = [
    [0, 2, 4], [1, 3, 5], [2, 4, 6],
    [0, 3, 5], [1, 4, 6], [0, 2, 5], [1, 3, 6],
  ];
  const degSet = new Set(degrees.map(d => ((d % 7) + 7) % 7));
  return triads.some(t => {
    const ts = new Set(t);
    for (const d of degSet) {
      if (!ts.has(d)) return false;
    }
    return true;
  });
}

/**
 * Rule 3: 연속 도약 트라이어드 — 2+ 연속 도약 시 3화음 음형 검증.
 * 트라이어드 미형성 시 순차로 전환.
 */
function checkConsecutiveLeapTriad(
  nn: number, prevNn: number, interval: number,
  leapNotes: number[],
): { nn: number; isTriadChain: boolean; leapNotes: number[] } {
  const isLeap = Math.abs(interval) >= 2;
  if (!isLeap) {
    return { nn, isTriadChain: false, leapNotes: [nn] };
  }
  // 도약 — 리프 체인에 추가
  const newLeap = leapNotes.length === 0 ? [prevNn, nn] : [...leapNotes, nn];
  if (newLeap.length >= 3) {
    // 3+ 음 (2+ 연속 도약) — 트라이어드 검증
    if (isTriadSubset(newLeap)) {
      return { nn, isTriadChain: true, leapNotes: newLeap };
    }
    // 트라이어드 아님 → 순차 강제 (도약 방향의 1도)
    const step = interval > 0 ? 1 : -1;
    return { nn: prevNn + step, isTriadChain: false, leapNotes: [prevNn + step] };
  }
  return { nn, isTriadChain: false, leapNotes: newLeap };
}

/**
 * Rule 4: 경향음 해결 — 이끔음(7도)→으뜸음, 버금딸림음(4도)→가온음.
 */
function applyTendencyResolution(
  nn: number, prevNn: number, isCadenceContext: boolean,
): number {
  const prevDeg = ((prevNn % 7) + 7) % 7;
  // 이끔음 (스케일 7도 = deg index 6) → 으뜸음으로 상행
  if (prevDeg === 6) {
    const target = prevNn + 1;
    if (isCadenceContext || Math.random() < 0.85) return target;
  }
  // 버금딸림음 (스케일 4도 = deg index 3) → 가온음으로 하행
  if (prevDeg === 3) {
    if (Math.random() < 0.60) return prevNn - 1;
  }
  return nn;
}

/**
 * Rule 5: 단일 정점 — 4마디 프레이즈 내 최고음은 정점 위치에서만 허용.
 */
function enforcePeakNote(
  nn: number, bar: number, barPos: number,
  peak: { bar: number; peakNn: number },
): number {
  const atPeak = bar === peak.bar && barPos === 0;
  if (atPeak) {
    // 정점 위치: peakNn 이상으로 끌어올림
    return Math.max(nn, peak.peakNn);
  }
  // 비정점 위치: peakNn 미만으로 제한 (천장 plateau 방지를 위해 랜덤 오프셋)
  if (nn >= peak.peakNn) {
    return peak.peakNn - 1 - Math.floor(Math.random() * 2);
  }
  return nn;
}

// ────────────────────────────────────────────────────────────────
// Main generator
// ────────────────────────────────────────────────────────────────

export function generateScore(opts: GeneratorOptions): GeneratedScore {
  const { keySignature, timeSignature, difficulty, measures, useGrandStaff } = opts;
  const bassDifficulty = opts.bassDifficulty;

  if (measures < 1) throw new Error('measures must be >= 1');
  if (!timeSignature || !timeSignature.includes('/')) throw new Error(`Invalid timeSignature: ${timeSignature}`);
  const scale             = getScaleDegrees(keySignature);
  const sixteenthsPerBar  = getSixteenthsPerBar(timeSignature);
  const isMinor           = isMinorKey(keySignature);
  const progression       = generateProgression(measures, isMinor);
  /** 단조 7음 (이끔음 올림 대상) — scale[6] */
  const minorSeventhDeg   = isMinor ? scale[6] : null;
  const minorLeadingAcc   = isMinor && minorSeventhDeg
    ? getMinorLeadingToneAccidental(keySignature, minorSeventhDeg) : '' as Accidental;
  const lvl               = difficultyLevel(difficulty);

  const trebleNotes: ScoreNote[] = [];
  const bassNotes:   ScoreNote[] = [];

  // 루트가 높은 조(G,A,B 등)에서 wrap 편향으로 옥타브5에 음이 몰리는 현상 보정
  // wrapCount >= 4이면 TREBLE_BASE를 3으로 낮춰 한 옥타브 아래에서 시작
  const rootIdx = PITCH_ORDER.indexOf(scale[0]);
  const wrapCount = rootIdx; // wrap이 발생하는 음계도 수 = rootIdx
  const TREBLE_BASE = wrapCount >= 4 ? 3 : 4;
  const BASS_BASE   = getBassBaseOctave(scale);

  // 조표의 wrap 보정을 반영한 트레블 실효 최대 nn 계산
  const rawTrebleMax = lvl <= 2 ? 8 : 12;
  let effectiveTrebleMax = rawTrebleMax;
  while (effectiveTrebleMax > 0 && noteNumToNote(effectiveTrebleMax, scale, TREBLE_BASE).octave > 5) {
    effectiveTrebleMax--;
  }

  // 2성부 + TREBLE_BASE=3 인 조: 트레블이 옥타브3에 내려가면 베이스와 겹침
  // → octave 4 이상만 사용하도록 최소 nn 설정 (Am:2→C4, Gm:3→C4, Bm:1→C#4)
  const trebleRangeMin = (useGrandStaff && TREBLE_BASE <= 3) ? (7 - rootIdx) : 0;

  // ── Step A: 새 2성부 베이스 선생성 (bassDifficulty가 지정된 경우) ──
  let newBassScoreNotes: ScoreNote[] | null = null;
  const useNewBassModule = useGrandStaff && !!bassDifficulty;
  if (useNewBassModule) {
    const bassLevel = mapBassDifficultyToLevel(bassDifficulty!);
    const tvTimeSig = timeSignature as TVTimeSignature;
    const tvMeasures = ([4, 8, 12, 16] as const).find(m => m >= measures - 1) ?? 16;
    const stack = generateTwoVoiceStack({
      keySignature,
      mode: isMinor ? 'harmonic_minor' : 'major',
      timeSig: tvTimeSig,
      measures,
      tvMeasures,
      bassLevel,
      melodyLevel: lvl,
      progression,
      trebleBaseOctave: TREBLE_BASE,
      melodyNnMin: Math.max(trebleRangeMin, 0),
      melodyNnMax: effectiveTrebleMax,
    });
    newBassScoreNotes = stack.bassScoreNotes;
    trebleNotes.push(...stack.trebleScoreNotes);
  }

  const useDedicatedTwoVoiceMelody =
    useNewBassModule && !!newBassScoreNotes && newBassScoreNotes.length > 0;

  // ── 1성부 멜로디: 통합 생성기 호출 ──
  if (!useDedicatedTwoVoiceMelody) {
    const melodyNotes = generateMelody({
      key: keySignature,
      mode: isMinor ? 'harmonic_minor' : 'major',
      timeSig: timeSignature as TVTimeSignature,
      measures,
      melodyLevel: lvl,
      progression,
      trebleBaseOctave: TREBLE_BASE,
      melodyNnMin: Math.max(trebleRangeMin, 0),
      melodyNnMax: effectiveTrebleMax,
      // bassNotes 생략 → 1성부 모드
    });
    trebleNotes.push(...melodyNotes);
  }

  // ── 새 베이스 모듈: 선생성된 베이스를 bassNotes에 할당 ──
  if (useNewBassModule && newBassScoreNotes) {
    bassNotes.push(...newBassScoreNotes);
  }

  // ── 1성부 후처리: 임시표 정리 + 삼전음 보정 ──
  if (!useDedicatedTwoVoiceMelody) {
    cleanupBrokenAccidentals(trebleNotes, keySignature);
    fixTritoneleaps(trebleNotes, scale, TREBLE_BASE, keySignature);
  }

  // ── 종지 마디 ──
  // ── 단조: 종지 직전 마지막 트레블 음이 7음이면 이끔음(올린 7음)으로 교체 ──
  if (isMinor && minorSeventhDeg && minorLeadingAcc && trebleNotes.length > 0) {
    const lastIdx = trebleNotes.length - 1;
    const lastNote = trebleNotes[lastIdx];
    if (lastNote.pitch === minorSeventhDeg && lastNote.accidental === '') {
      trebleNotes[lastIdx] = { ...lastNote, accidental: minorLeadingAcc };
    }
  }

  const cadence = generateCadenceMeasure(
    scale, TREBLE_BASE, BASS_BASE, sixteenthsPerBar, useGrandStaff, keySignature,
  );
  trebleNotes.push(...cadence.treble);
  bassNotes.push(...cadence.bass);

  // ── Step C: 대위법 후처리 (새 베이스 모듈 사용 시) ──
  if (useNewBassModule) {
    const tvTimeSig = timeSignature as TVTimeSignature;
    applyCounterpointCorrections(trebleNotes, bassNotes, tvTimeSig, keySignature, lvl);

    // ── Step C-1.5: 임시표 정리 + 삼전음 보정 (안전망 이전) ──
    cleanupBrokenAccidentals(trebleNotes, keySignature);
    fixTritoneleaps(trebleNotes, scale, TREBLE_BASE, keySignature);

    // ── Step C-2: 최종 강박 불협화 안전망 ──
    // counterpoint 보정 후에도 남은 강박 불협화를 직접 보정
    // 음표 onset뿐 아니라 지속 중인 강박 위치도 모두 검사
    {
      const strongOffsets16 = [...getStrongBeatOffsets(timeSignature)];

      // 베이스 타임라인
      const bassTimeline: { start: number; end: number; midi: number }[] = [];
      let bPos = 0;
      for (const bn of bassNotes) {
        const dur = bn.tupletNoteDur ?? durationToSixteenths(bn.duration);
        if (bn.pitch !== 'rest') {
          bassTimeline.push({ start: bPos, end: bPos + dur, midi: noteToMidiWithKey(bn, keySignature) });
        }
        bPos += dur;
      }

      // 트레블 타임라인: 각 음의 시작/끝/인덱스
      const trebleTimeline: { start: number; end: number; idx: number }[] = [];
      let tPos = 0;
      for (let ti = 0; ti < trebleNotes.length; ti++) {
        const dur = trebleNotes[ti].tupletNoteDur ?? durationToSixteenths(trebleNotes[ti].duration);
        if (trebleNotes[ti].pitch !== 'rest') {
          trebleTimeline.push({ start: tPos, end: tPos + dur, idx: ti });
        }
        tPos += dur;
      }

      // 모든 강박 위치를 순회
      const totalSixteenths = measures * sixteenthsPerBar;
      for (let absPos = 0; absPos < totalSixteenths; absPos++) {
        const barOff = absPos % sixteenthsPerBar;
        if (!strongOffsets16.includes(barOff)) continue;

        // 이 위치에서 울리는 트레블 찾기
        const te = trebleTimeline.find(t => t.start <= absPos && t.end > absPos);
        if (!te) continue;
        const tn = trebleNotes[te.idx];

        // 이 위치에서 울리는 베이스 찾기
        const be = bassTimeline.find(b => b.start <= absPos && b.end > absPos);
        if (!be) continue;

        const tMidi = noteToMidiWithKey(tn, keySignature);
        const pc = ((tMidi - be.midi) % 12 + 12) % 12;
        if (!DISSONANT_PC.has(pc)) continue;

        // 불협화 → 가까운 스케일 음으로 교체
        // 이 음이 다른 강박에서도 울리므로, 모든 동시 베이스와 협화하는 음을 선택
        let bestPitch: PitchName = tn.pitch;
        let bestOct = tn.octave;
        let bestDist = Infinity;
        let bestIsImperfect = false;

        for (let oct = tn.octave - 1; oct <= tn.octave + 1; oct++) {
          for (const sp of scale) {
            if (sp === 'rest') continue;
            const cNote = makeNote(sp, oct, tn.duration);
            const cMidi = noteToMidiWithKey(cNote, keySignature);
            if (cMidi <= be.midi) continue;
            const cPc = ((cMidi - be.midi) % 12 + 12) % 12;
            if (DISSONANT_PC.has(cPc)) continue;

            // 이 음이 다른 강박에서도 울릴 때 그 베이스와도 협화해야 함
            let allConsonant = true;
            for (let checkPos = te.start; checkPos < te.end; checkPos++) {
              const checkBarOff = checkPos % sixteenthsPerBar;
              if (!strongOffsets16.includes(checkBarOff)) continue;
              const checkBass = bassTimeline.find(b => b.start <= checkPos && b.end > checkPos);
              if (!checkBass) continue;
              const checkPc = ((cMidi - checkBass.midi) % 12 + 12) % 12;
              if (DISSONANT_PC.has(checkPc)) { allConsonant = false; break; }
            }
            if (!allConsonant) continue;

            const dist = Math.abs(cMidi - tMidi);
            const imperfect = IMPERFECT_CONSONANT_PC.has(cPc);
            if (imperfect && !bestIsImperfect) {
              bestPitch = sp; bestOct = oct; bestDist = dist; bestIsImperfect = true;
            } else if (imperfect === bestIsImperfect && dist < bestDist) {
              bestPitch = sp; bestOct = oct; bestDist = dist;
            }
          }
        }

        if (bestDist < Infinity) {
          trebleNotes[te.idx] = { ...tn, pitch: bestPitch, octave: bestOct, accidental: '' };
        }
      }
    }
  }

  // ── Step C-3: 안전망 후 병진행 재보정 ──
  if (useNewBassModule) {
    const tvTimeSig2 = timeSignature as TVTimeSignature;
    applyCounterpointCorrections(trebleNotes, bassNotes, tvTimeSig2, keySignature, lvl);

    // ── Step C-4: 최종 임시표 정리 (모든 보정 완료 후) ──
    cleanupBrokenAccidentals(trebleNotes, keySignature);
  }

  // ── 후처리: 내부 쉼표 ──
  applyInternalRests(trebleNotes, bassNotes, difficulty, measures, sixteenthsPerBar, useGrandStaff, timeSignature);

  // ── 후처리: 박자 경계 분할 (중급 2단계 이상에서만) ──
  const finalTreble = lvl >= 5
    ? splitAtBeatBoundaries(trebleNotes, timeSignature)
    : trebleNotes;
  const finalBass = useGrandStaff
    ? (lvl >= 5 ? splitAtBeatBoundaries(bassNotes, timeSignature) : bassNotes)
    : bassNotes;

  // ── 후처리: 연속 붙임줄 2회 제한 — 연속된 2개의 tie 중 마지막 제거 ──
  for (let i = 0; i < finalTreble.length - 1; i++) {
    if (finalTreble[i].tie && finalTreble[i + 1].tie) {
      finalTreble[i + 1] = { ...finalTreble[i + 1], tie: false };
    }
  }
  if (useGrandStaff) {
    for (let i = 0; i < finalBass.length - 1; i++) {
      if (finalBass[i].tie && finalBass[i + 1].tie) {
        finalBass[i + 1] = { ...finalBass[i + 1], tie: false };
      }
    }
  }

  // ── 후처리: 연속 동일음 3회 이상 방지 (안전망) ──
  // 생성 루프의 bypass 경로(해결음·이끔음·임시표·타이)에서 누락된 연속 체크 보완
  fixConsecutiveRepeats(finalTreble, scale, TREBLE_BASE, keySignature);

  // ── 후처리: 단조 대사관계(False Relation) 방지 ──
  // 트레블이 올린 7음(이끔음, e.g. G#)을 쓰는 동시에 베이스가 내린 7음(G♮)을 연주하면
  // 귀에 거슬리는 대사(cross-relation) 발생 → 베이스 음을 근음이나 5음으로 교체
  if (isMinor && useGrandStaff && minorSeventhDeg) {
    fixMinorCrossRelation(finalTreble, finalBass, scale, minorSeventhDeg, minorLeadingAcc, BASS_BASE, keySignature, sixteenthsPerBar);
  }

  if (useNewBassModule) {
    forceGrandStaffFinalTonic(finalTreble, finalBass, scale, TREBLE_BASE, BASS_BASE);
  }

  // ── ★ 최종 검토: 비활성화 (reviewAndFixScore 연쇄 보정이 선율 품질 저하 유발) ──
  // const reviewed = reviewAndFixScore(
  //   finalTreble, finalBass,
  //   keySignature, timeSignature, scale,
  //   useGrandStaff, params.consonanceRatio,
  // );

  // ── 최종 임시표 안전망: 모든 후처리(쉼표·분할·반복음·대사관계) 완료 후 ──
  cleanupBrokenAccidentals(finalTreble, keySignature);

  return { trebleNotes: finalTreble, bassNotes: finalBass };
}

// ────────────────────────────────────────────────────────────────
// ★ 최종 검토: 자동 생성 악보의 화성·성부 진행·마디 정합성 검증 및 보정
// ────────────────────────────────────────────────────────────────

/**
 * 트레블·베이스 공격점(attack) 타임라인 구축.
 * 반환: { offset: 16분음표 위치, noteIdx: 원본 배열 인덱스, midi: MIDI 값 }[]
 */
function buildAttackTimeline(
  notes: ScoreNote[],
  keySignature: string,
): { offset: number; noteIdx: number; midi: number }[] {
  const tl: { offset: number; noteIdx: number; midi: number }[] = [];
  let off = 0;
  let i = 0;
  while (i < notes.length) {
    const n = notes[i];
    if (n.tuplet) {
      const p = parseInt(n.tuplet, 10);
      const span = getTupletActualSixteenths(n.tuplet, n.tupletSpan || n.duration);
      if (n.pitch !== 'rest') {
        tl.push({ offset: off, noteIdx: i, midi: noteToMidiWithKey(n, keySignature) });
      }
      off += span;
      i += p;
    } else {
      const dur = durationToSixteenths(n.duration);
      if (n.pitch !== 'rest') {
        tl.push({ offset: off, noteIdx: i, midi: noteToMidiWithKey(n, keySignature) });
      }
      off += dur;
      i += 1;
    }
  }
  return tl;
}

/**
 * 두 MIDI 값의 음정(반음 수)으로 협화/불협화 판별.
 * 협화: 유니즌(0), 단3(3), 장3(4), 완전4(5), 완전5(7),
 *       단6(8), 장6(9), 옥타브(12) 및 그 복합음정(+12, +24…)
 */
function isConsonantInterval(semitones: number): boolean {
  const mod = ((semitones % 12) + 12) % 12;
  return [0, 3, 4, 5, 7, 8, 9].includes(mod);
}

/**
 * 병행 완전음정(5도/옥타브) 검사.
 * 연속 두 공격점에서 동일 완전음정(0,7)이 같은 방향으로 진행하면 위반.
 */
function isParallelPerfect(
  prevTrebleMidi: number, prevBassMidi: number,
  currTrebleMidi: number, currBassMidi: number,
): boolean {
  const prevInt = ((prevTrebleMidi - prevBassMidi) % 12 + 12) % 12;
  const currInt = ((currTrebleMidi - currBassMidi) % 12 + 12) % 12;
  // 둘 다 완전 유니즌(0) 또는 완전5도(7)
  if (prevInt !== 0 && prevInt !== 7) return false;
  if (currInt !== 0 && currInt !== 7) return false;
  // 같은 방향으로 진행해야 병행
  const trebleDir = Math.sign(currTrebleMidi - prevTrebleMidi);
  const bassDir   = Math.sign(currBassMidi - prevBassMidi);
  return trebleDir !== 0 && trebleDir === bassDir;
}

/**
 * 마디별 음표 그룹으로 분할 (16분음표 단위 기준).
 */
function splitNotesIntoMeasures(
  notes: ScoreNote[],
  sixteenthsPerBar: number,
): ScoreNote[][] {
  const measures: ScoreNote[][] = [];
  let currentMeasure: ScoreNote[] = [];
  let posInBar = 0;

  let i = 0;
  while (i < notes.length) {
    const n = notes[i];
    if (n.tuplet) {
      const p = parseInt(n.tuplet, 10);
      const span = getTupletActualSixteenths(n.tuplet, n.tupletSpan || n.duration);
      for (let k = 0; k < p && i + k < notes.length; k++) {
        currentMeasure.push(notes[i + k]);
      }
      posInBar += span;
      i += p;
    } else {
      const dur = durationToSixteenths(n.duration);
      currentMeasure.push(n);
      posInBar += dur;
      i += 1;
    }
    if (posInBar >= sixteenthsPerBar) {
      measures.push(currentMeasure);
      currentMeasure = [];
      posInBar = 0;
    }
  }
  if (currentMeasure.length > 0) measures.push(currentMeasure);
  return measures;
}

/**
 * ★ reviewAndFixScore — 자동 생성 악보의 최종 검토 및 보정
 *
 * 검증 항목:
 *  1. 마디 음가 합계 정합성 (각 마디의 16분음표 합이 박자와 일치)
 *  2. 병행 완전5도/옥타브 제거 (2성부)
 *  3. 수직 화성 협화도 검증 (consonanceRatio 기준)
 *  4. 선율 윤곽: 증음정(augmented 2nd = 3반음) 제거
 *  5. 마디 경계 성부 진행 매끄러움 (7반음 초과 도약 보정)
 *  6. 종지 마디 확인 (으뜸음으로 종결)
 */
function reviewAndFixScore(
  treble: ScoreNote[],
  bass: ScoreNote[],
  keySignature: string,
  timeSignature: string,
  scale: PitchName[],
  useGrandStaff: boolean,
  consonanceRatio: number,
): { treble: ScoreNote[]; bass: ScoreNote[] } {
  const sixteenthsPerBar = getSixteenthsPerBar(timeSignature);
  const BASS_BASE = 3;

  // ════════════════════════════════════════════════════════════════
  // Pass 1: 마디 음가 합계 정합성 검증
  // ════════════════════════════════════════════════════════════════
  const verifyMeasureDurations = (notes: ScoreNote[], label: string): void => {
    // 반복: splice 후 인덱스 변동이 있을 수 있으므로 안정될 때까지 재검증
    for (let pass = 0; pass < 3; pass++) {
    let anyFix = false;
    const measures = splitNotesIntoMeasures(notes, sixteenthsPerBar);
    for (let m = 0; m < measures.length; m++) {
      let total = 0;
      let ni = 0;
      while (ni < measures[m].length) {
        const n = measures[m][ni];
        if (n.tuplet) {
          const span = getTupletActualSixteenths(n.tuplet, n.tupletSpan || n.duration);
          total += span;
          ni += parseInt(n.tuplet, 10);
        } else {
          total += durationToSixteenths(n.duration);
          ni += 1;
        }
      }
      // 부족한 경우 쉼표로 채움
      if (total < sixteenthsPerBar) {
        const gap = sixteenthsPerBar - total;
        const fillDur = SIXTEENTHS_TO_DUR[gap];
        if (fillDur) {
          let insertIdx = 0;
          for (let mi = 0; mi < m; mi++) insertIdx += measures[mi].length;
          insertIdx += measures[m].length;
          notes.splice(insertIdx, 0, {
            id: Math.random().toString(36).substr(2, 9),
            pitch: 'rest', octave: 4, accidental: '', duration: fillDur, tie: false,
          });
          anyFix = true;
          break; // 재분할 필요 → 다음 pass에서 재검증
        }
      }

      // 초과한 경우: 마디 끝에서 역순으로 음표를 줄여 맞춤
      if (total > sixteenthsPerBar) {
        let excess = total - sixteenthsPerBar;
        let startIdx = 0;
        for (let mi = 0; mi < m; mi++) startIdx += measures[mi].length;

        // 마디 내 요소를 "청크" 단위로 분류 (일반 음표 1개 또는 tuplet 그룹)
        const chunks: { start: number; count: number; dur: number; isTuplet: boolean }[] = [];
        let ci = 0;
        while (ci < measures[m].length) {
          const n = measures[m][ci];
          if (n.tuplet) {
            const cnt = parseInt(n.tuplet, 10);
            const dur = getTupletActualSixteenths(n.tuplet, n.tupletSpan || n.duration);
            chunks.push({ start: ci, count: cnt, dur, isTuplet: true });
            ci += cnt;
          } else {
            chunks.push({ start: ci, count: 1, dur: durationToSixteenths(n.duration), isTuplet: false });
            ci += 1;
          }
        }

        // 뒤에서부터 청크 단위로 제거/축소
        for (let ch = chunks.length - 1; ch >= 0 && excess > 0; ch--) {
          const chunk = chunks[ch];
          if (chunk.dur <= excess) {
            notes.splice(startIdx + chunk.start, chunk.count);
            excess -= chunk.dur;
          } else if (!chunk.isTuplet) {
            const newDur = chunk.dur - excess;
            const newDurLabel = SIXTEENTHS_TO_DUR[newDur];
            if (newDurLabel) {
              notes[startIdx + chunk.start] = { ...notes[startIdx + chunk.start], duration: newDurLabel };
            }
            excess = 0;
          } else {
            // tuplet 그룹 전체 제거 후, 남는 공간을 쉼표로 채움
            const gap = chunk.dur - excess;
            notes.splice(startIdx + chunk.start, chunk.count);
            excess -= chunk.dur;
            if (gap > 0) {
              const fillDur = SIXTEENTHS_TO_DUR[gap];
              if (fillDur) {
                notes.splice(startIdx + chunk.start, 0, {
                  id: Math.random().toString(36).substr(2, 9),
                  pitch: 'rest', octave: 4, accidental: '', duration: fillDur, tie: false,
                });
              }
            }
          }
        }
        anyFix = true;
        break; // 재분할 필요 → 다음 pass에서 재검증
      }
    }
    if (!anyFix) break; // 수정 없으면 종료
    } // end pass loop
  };

  verifyMeasureDurations(treble, 'treble');
  if (useGrandStaff && bass.length > 0) {
    verifyMeasureDurations(bass, 'bass');
  }

  // ════════════════════════════════════════════════════════════════
  // Pass 2: 2성부 수직 화성 검증 (병행 완전음정 + 협화도)
  // ════════════════════════════════════════════════════════════════
  if (useGrandStaff && bass.length > 0) {
    const trebleTL = buildAttackTimeline(treble, keySignature);
    const bassTL   = buildAttackTimeline(bass, keySignature);

    // 동시 공격점 매칭 (offset 기준)
    const bassMap = new Map<number, { noteIdx: number; midi: number }>();
    for (const b of bassTL) {
      bassMap.set(b.offset, { noteIdx: b.noteIdx, midi: b.midi });
    }

    type SimultaneousPoint = {
      offset: number;
      trebleIdx: number; trebleMidi: number;
      bassIdx: number;   bassMidi: number;
    };
    const simultaneous: SimultaneousPoint[] = [];
    for (const t of trebleTL) {
      const b = bassMap.get(t.offset);
      if (b) {
        simultaneous.push({
          offset: t.offset,
          trebleIdx: t.noteIdx, trebleMidi: t.midi,
          bassIdx: b.noteIdx,   bassMidi: b.midi,
        });
      }
    }

    // 2a: 병행 완전5도/옥타브 제거 — 베이스 음을 인접 화음톤으로 이동
    for (let i = 1; i < simultaneous.length; i++) {
      const prev = simultaneous[i - 1];
      const curr = simultaneous[i];
      if (isParallelPerfect(prev.trebleMidi, prev.bassMidi, curr.trebleMidi, curr.bassMidi)) {
        const bassNote = bass[curr.bassIdx];
        if (bassNote.pitch === 'rest') continue;

        // 반음 올리거나 내려서 완전음정 해소
        const currPitchIdx = PITCH_ORDER.indexOf(bassNote.pitch as PitchName);
        if (currPitchIdx < 0) continue;

        // 인접 음계 음으로 이동 (한 스텝 위 또는 아래)
        const stepUp   = (currPitchIdx + 1) % 7;
        const stepDown = (currPitchIdx + 6) % 7;
        const candidatePitches = [PITCH_ORDER[stepUp], PITCH_ORDER[stepDown]];

        let fixed = false;
        for (const candPitch of candidatePitches) {
          const candNote: ScoreNote = {
            ...bassNote, pitch: candPitch, accidental: '' as Accidental,
            id: bassNote.id,
          };
          const candMidi = noteToMidiWithKey(candNote, keySignature);
          // 새 음이 트레블과 병행 완전음정을 만들지 않는지 확인
          if (!isParallelPerfect(prev.trebleMidi, prev.bassMidi, curr.trebleMidi, candMidi)) {
            // 간격도 충분한지 확인
            if (curr.trebleMidi - candMidi >= MIN_TREBLE_BASS_SEMITONES) {
              bass[curr.bassIdx] = candNote;
              curr.bassMidi = candMidi;
              fixed = true;
              break;
            }
          }
        }
        // 인접 음으로도 해결 안 되면 옥타브 조정
        if (!fixed && bassNote.octave > 2) {
          const lowered: ScoreNote = { ...bassNote, octave: bassNote.octave - 1 };
          const loweredMidi = noteToMidiWithKey(lowered, keySignature);
          if (!isParallelPerfect(prev.trebleMidi, prev.bassMidi, curr.trebleMidi, loweredMidi)) {
            bass[curr.bassIdx] = lowered;
            curr.bassMidi = loweredMidi;
          }
        }
      }
    }

    // 2b: 수직 협화도 검증 — 불협화 비율이 (1-consonanceRatio) 초과 시 보정
    let dissonantCount = 0;
    const dissonantPoints: number[] = [];
    for (let i = 0; i < simultaneous.length; i++) {
      const s = simultaneous[i];
      const interval = Math.abs(s.trebleMidi - s.bassMidi);
      if (!isConsonantInterval(interval)) {
        dissonantCount++;
        dissonantPoints.push(i);
      }
    }
    const maxDissonant = Math.floor(simultaneous.length * (1 - consonanceRatio));
    if (dissonantCount > maxDissonant) {
      // 초과 불협화음을 협화음으로 보정 (가장 가까운 협화 음정으로 베이스 이동)
      const excessCount = dissonantCount - maxDissonant;
      const toFix = dissonantPoints.slice(0, excessCount);
      for (const idx of toFix) {
        const s = simultaneous[idx];
        const bassNote = bass[s.bassIdx];
        if (bassNote.pitch === 'rest') continue;
        const bassMidi = s.bassMidi;
        const trebleMidi = s.trebleMidi;

        // 협화 음정 목표: 현재 베이스에서 ±1~2 반음 내 협화음 탐색
        let bestNote: ScoreNote | null = null;
        let bestDist = Infinity;
        for (let delta = -3; delta <= 3; delta++) {
          if (delta === 0) continue;
          const targetMidi = bassMidi + delta;
          if (trebleMidi - targetMidi < MIN_TREBLE_BASS_SEMITONES) continue;
          if (!isConsonantInterval(Math.abs(trebleMidi - targetMidi))) continue;

          // MIDI → 가장 가까운 음계 음 매핑
          const semitone = ((targetMidi % 12) + 12) % 12;
          const PITCH_SEMITONES_REV: Record<number, PitchName> = {
            0: 'C', 1: 'C', 2: 'D', 3: 'D', 4: 'E', 5: 'F',
            6: 'F', 7: 'G', 8: 'G', 9: 'A', 10: 'A', 11: 'B',
          };
          const candPitch = PITCH_SEMITONES_REV[semitone];
          if (!candPitch) continue;
          const candOctave = Math.floor(targetMidi / 12) - 1;
          if (candOctave < 2 || candOctave > 4) continue;

          const candNote: ScoreNote = {
            ...bassNote, pitch: candPitch, octave: candOctave,
            accidental: '' as Accidental,
          };
          const actualMidi = noteToMidiWithKey(candNote, keySignature);
          const dist = Math.abs(actualMidi - bassMidi);
          if (dist < bestDist && isConsonantInterval(Math.abs(trebleMidi - actualMidi))) {
            bestDist = dist;
            bestNote = candNote;
          }
        }
        if (bestNote) {
          bass[s.bassIdx] = bestNote;
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Pass 3: 선율 윤곽 검증 — 증음정(augmented 2nd = 3반음) 제거
  // ════════════════════════════════════════════════════════════════
  const fixAugmentedIntervals = (notes: ScoreNote[]): void => {
    for (let i = 1; i < notes.length; i++) {
      if (notes[i].pitch === 'rest' || notes[i - 1].pitch === 'rest') continue;
      if (notes[i].tuplet && notes[i].tuplet !== '') continue; // 잇단음표 내부는 건너뜀

      const prevMidi = noteToMidiWithKey(notes[i - 1], keySignature);
      const currMidi = noteToMidiWithKey(notes[i], keySignature);
      const interval = Math.abs(currMidi - prevMidi);

      // 증2도(3반음) = 자연단음계 6→7도 등에서 발생 — 순차진행처럼 보이지만 소리가 어색
      if (interval === 3) {
        // 현재 음을 한 반음 줄여 장2도(2반음)로 만듦
        const dir = Math.sign(currMidi - prevMidi);
        const targetMidi = prevMidi + dir * 2; // 장2도

        // 가장 가까운 음계 음 찾기
        const targetSemitone = ((targetMidi % 12) + 12) % 12;
        let bestPitch: PitchName | null = null;
        let bestDist = Infinity;
        for (const sp of scale) {
          if (sp === 'rest') continue;
          const spNote: ScoreNote = {
            id: '', pitch: sp, octave: notes[i].octave,
            accidental: '' as Accidental, duration: notes[i].duration,
          };
          const spMidi = noteToMidiWithKey(spNote, keySignature);
          const spSemitone = ((spMidi % 12) + 12) % 12;
          const d = Math.abs(spSemitone - targetSemitone);
          const dWrap = Math.min(d, 12 - d);
          if (dWrap < bestDist) {
            bestDist = dWrap;
            bestPitch = sp;
          }
        }
        if (bestPitch && bestDist <= 1) {
          notes[i] = { ...notes[i], pitch: bestPitch, accidental: '' as Accidental };
        }
      }
    }
  };

  fixAugmentedIntervals(treble);
  if (useGrandStaff && bass.length > 0) {
    fixAugmentedIntervals(bass);
  }

  // ════════════════════════════════════════════════════════════════
  // Pass 4: 마디 경계 성부 진행 매끄러움 (7반음 초과 도약 보정)
  // ════════════════════════════════════════════════════════════════
  const smoothMeasureBoundaries = (notes: ScoreNote[]): void => {
    const measures = splitNotesIntoMeasures(notes, sixteenthsPerBar);
    // 마디 경계: 이전 마디 마지막 음 → 다음 마디 첫 음
    let globalIdx = 0;
    for (let m = 0; m < measures.length; m++) {
      const measureLen = measures[m].length;
      if (m > 0 && measureLen > 0) {
        const prevMeasure = measures[m - 1];
        // 이전 마디 마지막 비쉼표 음
        let prevNote: ScoreNote | null = null;
        for (let k = prevMeasure.length - 1; k >= 0; k--) {
          if (prevMeasure[k].pitch !== 'rest') { prevNote = prevMeasure[k]; break; }
        }
        // 현재 마디 첫 비쉼표 음
        let currNote: ScoreNote | null = null;
        let currNoteLocalIdx = -1;
        for (let k = 0; k < measureLen; k++) {
          if (measures[m][k].pitch !== 'rest') { currNote = measures[m][k]; currNoteLocalIdx = k; break; }
        }

        if (prevNote && currNote) {
          const prevMidi = noteToMidiWithKey(prevNote, keySignature);
          const currMidi = noteToMidiWithKey(currNote, keySignature);
          const leap = Math.abs(currMidi - prevMidi);

          // 7반음(완전5도) 초과 도약 → 인접 음계 음으로 보정
          if (leap > 7) {
            const dir = Math.sign(currMidi - prevMidi);
            // 목표: 직전 음에서 2~5반음 거리의 음계 음
            const targetMidi = prevMidi + dir * 4; // 장3도 거리
            let bestPitch: PitchName | null = null;
            let bestOctave = currNote.octave;
            let bestDist = Infinity;

            for (const sp of scale) {
              if (sp === 'rest') continue;
              for (let oct = currNote.octave - 1; oct <= currNote.octave + 1; oct++) {
                if (oct < 2 || oct > 5) continue;
                const candNote: ScoreNote = {
                  id: '', pitch: sp, octave: oct,
                  accidental: '' as Accidental, duration: currNote.duration,
                };
                const candMidi = noteToMidiWithKey(candNote, keySignature);
                const d = Math.abs(candMidi - targetMidi);
                if (d < bestDist && Math.abs(candMidi - prevMidi) <= 7 && Math.abs(candMidi - prevMidi) >= 1) {
                  bestDist = d;
                  bestPitch = sp;
                  bestOctave = oct;
                }
              }
            }

            if (bestPitch) {
              const actualIdx = globalIdx + currNoteLocalIdx;
              if (actualIdx < notes.length) {
                notes[actualIdx] = {
                  ...notes[actualIdx],
                  pitch: bestPitch,
                  octave: bestOctave,
                  accidental: '' as Accidental,
                };
              }
            }
          }
        }
      }
      globalIdx += measureLen;
    }
  };

  smoothMeasureBoundaries(treble);
  // 베이스는 패턴 기반이므로 마디 경계 보정은 treble에만 적용

  // ════════════════════════════════════════════════════════════════
  // Pass 5: 종지 마디 검증 — 마지막 실제 음이 으뜸음인지 확인
  // ════════════════════════════════════════════════════════════════
  const tonicPitch = scale[0];
  // 트레블 마지막 비쉼표 음 확인
  for (let i = treble.length - 1; i >= 0; i--) {
    if (treble[i].pitch !== 'rest') {
      if (treble[i].pitch !== tonicPitch) {
        treble[i] = { ...treble[i], pitch: tonicPitch, accidental: '' as Accidental };
      }
      break;
    }
  }
  // 베이스 마지막 비쉼표 음 확인
  if (useGrandStaff && bass.length > 0) {
    for (let i = bass.length - 1; i >= 0; i--) {
      if (bass[i].pitch !== 'rest') {
        if (bass[i].pitch !== tonicPitch) {
          bass[i] = { ...bass[i], pitch: tonicPitch, accidental: '' as Accidental };
        }
        break;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Pass 6: 2성부 최종 간격 재검증 (보정 과정에서 간격이 좁아졌을 수 있음)
  // ════════════════════════════════════════════════════════════════
  if (useGrandStaff && bass.length > 0) {
    const trebleTL2 = buildAttackTimeline(treble, keySignature);
    const bassTL2   = buildAttackTimeline(bass, keySignature);
    const bassMap2 = new Map<number, number>();
    for (const b of bassTL2) bassMap2.set(b.offset, b.noteIdx);

    for (const t of trebleTL2) {
      const bIdx = bassMap2.get(t.offset);
      if (bIdx === undefined) continue;
      const bassNote = bass[bIdx];
      if (bassNote.pitch === 'rest') continue;
      const bassMidi = noteToMidiWithKey(bassNote, keySignature);
      const trebleMidi = t.midi;

      // 간격 부족 → 베이스 옥타브 내림
      if (trebleMidi - bassMidi < MIN_TREBLE_BASS_SEMITONES && bassNote.octave > 2) {
        bass[bIdx] = { ...bassNote, octave: Math.max(2, bassNote.octave - 1) };
      }
      // 동일 건반 → 베이스 옥타브 내림
      if (trebleMidi === bassMidi && bassNote.octave > 2) {
        bass[bIdx] = { ...bassNote, octave: Math.max(2, bassNote.octave - 1) };
      }
    }
  }

  return { treble, bass };
}

// passesBassSpacing, chordToneBnnCandidates → imported from scoreUtils

/**
 * 베이스-트레블 충돌 해결.
 * - 동일 건반: 한 옥타브 내림 → 그래도 문제면 다른 화음톤 (bnn±7 그리드, 음수 % 버그 없음)
 * - 성부 간격 부족: 먼저 다른 화음톤으로 재배치, 그다음 한 옥타브 내림
 *   (옥타브만 내리면 다음 음과 '옥타브+도'로 끊기는 현상 완화)
 */
function resolveBassClash(
  note: ScoreNote, bnn: number, oct: number, durLabel: NoteDuration,
  bassOff: number, scale: PitchName[], bassBase: number,
  keySignature: string, trebleAttackMap: Map<number, number>,
  bTones: number[],
): ScoreNote {
  const clashMidi = trebleAttackMap.get(bassOff);
  if (clashMidi === undefined) return note;

  const bassMidi = noteToMidiWithKey(note, keySignature);
  const pitch = note.pitch as PitchName;

  const noteFromBnn = (b: number): ScoreNote => {
    const n = Math.max(-5, Math.min(4, b));
    const { pitch: p, octave } = noteNumToNote(n, scale, bassBase);
    const o = Math.max(2, Math.min(4, octave));
    return makeNote(p, o, durLabel);
  };

  /** 화음 구성음 후보 중 현재 음과 MIDI 거리가 가장 짧은 통과 후보 반환 */
  const closestChordTone = (): ScoreNote | null => {
    let best: ScoreNote | null = null;
    let bestDist = Infinity;
    for (const candBnn of chordToneBnnCandidates(bnn, bTones)) {
      if (candBnn === bnn) continue;
      const cand = noteFromBnn(candBnn);
      if (!passesBassSpacing(cand, bassOff, trebleAttackMap, keySignature)) continue;
      const dist = Math.abs(noteToMidiWithKey(cand, keySignature) - bassMidi);
      if (dist < bestDist) { bestDist = dist; best = cand; }
    }
    return best;
  };

  // 동일 건반
  if (bassMidi === clashMidi) {
    if (oct > 2) {
      const lowered = makeNote(pitch, Math.max(2, oct - 1), durLabel);
      if (passesBassSpacing(lowered, bassOff, trebleAttackMap, keySignature)) {
        return lowered;
      }
    }
    const closest = closestChordTone();
    if (closest) return closest;
    if (oct > 2) {
      return makeNote(pitch, Math.max(2, oct - 1), durLabel);
    }
    return note;
  }

  // 성부 간격 부족 (§4)
  if (clashMidi - bassMidi < MIN_TREBLE_BASS_SEMITONES) {
    const closest = closestChordTone();
    if (closest) return closest;
    if (oct > 2) {
      const lowered = makeNote(pitch, Math.max(2, oct - 1), durLabel);
      if (passesBassSpacing(lowered, bassOff, trebleAttackMap, keySignature)) {
        return lowered;
      }
    }
  }

  // 피치클래스 반음 충돌 — G bass + G# treble처럼 옥타브를 넘어 동시에 울리는 반음 불협화 감지
  // (차이가 15 이상이라 위 간격 검사를 통과했지만 pitch class는 1 반음 차)
  const pitchClassDiff = ((clashMidi - bassMidi) % 12 + 12) % 12;
  if (pitchClassDiff === 1) {
    const closest = closestChordTone();
    if (closest) return closest;
  }

  return note;
}

/** 직전 베이스와의 간격이 한 옥타브 이상이면, 같은 음높이로 옥타브 2~4 중 간격이 가장 짧은 것 선택 */
function smoothBassMelodicContinuity(
  note: ScoreNote,
  durLabel: NoteDuration,
  bassOff: number,
  prevMidi: number | undefined,
  keySignature: string,
  trebleAttackMap: Map<number, number>,
): ScoreNote {
  if (prevMidi === undefined || note.pitch === 'rest') return note;
  const midi = noteToMidiWithKey(note, keySignature);
  if (Math.abs(midi - prevMidi) < 12) return note;
  const p = note.pitch as PitchName;
  let best = note;
  let bestD = Math.abs(midi - prevMidi);
  for (let tryOct = 2; tryOct <= 4; tryOct++) {
    const cand = makeNote(p, tryOct, durLabel);
    if (!passesBassSpacing(cand, bassOff, trebleAttackMap, keySignature)) continue;
    const d = Math.abs(noteToMidiWithKey(cand, keySignature) - prevMidi);
    if (d < bestD) {
      bestD = d;
      best = cand;
    }
  }
  return best;
}

/**
 * 싱코페이션 구절 해소 마디 (1-based 기준 설명과 동일)
 * - 4마디 곡(measures<=4): 해소 없음
 * - 그 외: 4,8,12…(종지 직전 마디 미만) + 종지 바로 앞 마디(8곡→7, 12곡→11, 16곡→15)
 */
function isSyncopationPhraseResolutionBar(totalMeasures: number, barIndex: number): boolean {
  if (totalMeasures <= 4) return false;
  const contentBars = totalMeasures - 1;
  const oneBased = barIndex + 1;
  if (oneBased === contentBars) return true;
  return oneBased >= 4 && oneBased % 4 === 0 && oneBased < contentBars;
}

// getStrongBeatOffsets → imported from scoreUtils

/**
 * 수직 협화음 검증 — treble과의 pitch-class 차이가 불협화(2도·4도·7도)이면
 * 가장 가까운 다른 화음톤으로 대체. 대체 불가 시 원본 반환.
 * (2성부 가이드라인 §1: 강박 협화음 우선성)
 */
function ensureConsonance(
  nn: number, off: number,
  trebleAttackMap: Map<number, number>,
  scale: PitchName[], bassBase: number,
  keySignature: string, bTones: number[],
): number {
  const tMidi = trebleAttackMap.get(off);
  if (tMidi === undefined) return nn;
  const n = Math.max(-5, Math.min(4, nn));
  const { pitch, octave } = noteNumToNote(n, scale, bassBase);
  const oct = Math.max(2, Math.min(3, octave));
  const bMidi = noteToMidiWithKey(makeNote(pitch, oct, '4'), keySignature);
  const pc = ((tMidi - bMidi) % 12 + 12) % 12;
  if (!DISSONANT_PC.has(pc)) return nn;
  // 불협화 → 다른 화음톤 중 협화음이면서 가장 가까운 것 선택
  let best = nn, bestDist = Infinity;
  for (const t of bTones) {
    for (const base of [
      Math.floor(nn / 7) * 7 + t,
      Math.floor(nn / 7) * 7 + t - 7,
      Math.floor(nn / 7) * 7 + t + 7,
    ]) {
      if (base < -5 || base > 4 || base === nn) continue;
      const { pitch: cp, octave: co } = noteNumToNote(base, scale, bassBase);
      const cOct = Math.max(2, Math.min(3, co));
      const cMidi = noteToMidiWithKey(makeNote(cp, cOct, '4'), keySignature);
      const cPc = ((tMidi - cMidi) % 12 + 12) % 12;
      if (DISSONANT_PC.has(cPc)) continue;
      const d = Math.abs(base - nn);
      if (d < bestDist) { bestDist = d; best = base; }
    }
  }
  return Math.max(-5, Math.min(4, best));
}

/**
 * 병진행 완전5도·8도 보정 — treble 반대 방향으로 베이스 1 scale step 조정.
 * 조정 불가(음역 밖, treble 충돌)이면 원본 반환.
 */
function fixParallelPerfect(
  nn: number, note: ScoreNote, durLabel: NoteDuration, off: number,
  prevBMidi: number | undefined,
  trebleAttackMap: Map<number, number>,
  scale: PitchName[], bassBase: number,
  keySignature: string,
): ScoreNote {
  if (prevBMidi === undefined) return note;
  const curTMidi = trebleAttackMap.get(off);
  if (curTMidi === undefined) return note;
  let prevTMidi: number | undefined;
  for (const [o, m] of trebleAttackMap) { if (o < off) prevTMidi = m; }
  if (prevTMidi === undefined) return note;
  const curBMidi = noteToMidiWithKey(note, keySignature);
  const prevInt = ((prevTMidi - prevBMidi) % 12 + 12) % 12;
  const curInt  = ((curTMidi  - curBMidi)  % 12 + 12) % 12;
  if (!((prevInt === 0 || prevInt === 7) && prevInt === curInt)) return note;
  // 병진행 완전음정 감지 — treble 반대 방향으로 1 scale step 이동
  const trebleDir = curTMidi > prevTMidi ? 1 : -1;
  const fixedNn = Math.max(-5, Math.min(4, nn - trebleDir));
  if (fixedNn === nn) return note;
  const { pitch: fp, octave: fo } = noteNumToNote(fixedNn, scale, bassBase);
  const fixedOct = Math.max(2, Math.min(3, fo));
  const fixedNote = makeNote(fp, fixedOct, durLabel);
  return noteToMidiWithKey(fixedNote, keySignature) !== curTMidi ? fixedNote : note;
}

/**
 * 불완전 협화음 비율 후보정 — perfect consonance(unison/5th/8ve)를
 * 가장 가까운 3rd/6th로 교체하여 imperfect consonance 비율을 높인다.
 * 강박 음은 건드리지 않는다.
 */
function applyImperfectConsonanceRatio(
  bassNotes: ScoreNote[], startIdx: number,
  offsets: number[], durations: number[],
  trebleAttackMap: Map<number, number>,
  scale: PitchName[], bassBase: number,
  keySignature: string, bTones: number[],
  targetRatio: number,
  strongBeats: Set<number>,
): void {
  const count = offsets.length;
  if (count === 0) return;

  // 현재 비율 계산
  let totalVertical = 0, imperfectCount = 0;
  const pcs: number[] = [];
  for (let i = 0; i < count; i++) {
    const tMidi = trebleAttackMap.get(offsets[i]);
    if (tMidi === undefined) { pcs.push(-1); continue; }
    const bMidi = noteToMidiWithKey(bassNotes[startIdx + i], keySignature);
    const pc = ((tMidi - bMidi) % 12 + 12) % 12;
    pcs.push(pc);
    totalVertical++;
    if (IMPERFECT_CONSONANT_PC.has(pc)) imperfectCount++;
  }
  if (totalVertical === 0) return;
  const currentRatio = imperfectCount / totalVertical;
  if (currentRatio >= targetRatio) return;

  // 부족분 보정: 약박의 perfect consonance(0, 5, 7)를 imperfect로 교체
  const perfectIndices: number[] = [];
  for (let i = 0; i < count; i++) {
    if (strongBeats.has(offsets[i])) continue; // 강박 보존
    const pc = pcs[i];
    if (pc === 0 || pc === 5 || pc === 7) perfectIndices.push(i);
  }

  const needed = Math.ceil(targetRatio * totalVertical) - imperfectCount;
  for (let k = 0; k < Math.min(needed, perfectIndices.length); k++) {
    const idx = perfectIndices[k];
    const off = offsets[idx];
    const tMidi = trebleAttackMap.get(off);
    if (tMidi === undefined) continue;

    // bTones 중 imperfect consonance가 되는 가장 가까운 후보 탐색
    const origNote = bassNotes[startIdx + idx];
    const origBnn = -99; // 역산 불필요 — bTones에서 직접 탐색
    let bestNote: ScoreNote | undefined;
    let bestDist = Infinity;
    for (const t of bTones) {
      for (const base of [t, t - 7, t + 7]) {
        if (base < -5 || base > 4) continue;
        const { pitch: cp, octave: co } = noteNumToNote(base, scale, bassBase);
        const cOct = Math.max(2, Math.min(3, co));
        const cand = makeNote(cp, cOct, origNote.duration);
        const cMidi = noteToMidiWithKey(cand, keySignature);
        const cPc = ((tMidi - cMidi) % 12 + 12) % 12;
        if (!IMPERFECT_CONSONANT_PC.has(cPc)) continue;
        const origMidi = noteToMidiWithKey(origNote, keySignature);
        const d = Math.abs(cMidi - origMidi);
        if (d < bestDist) { bestDist = d; bestNote = cand; }
      }
    }
    if (bestNote) bassNotes[startIdx + idx] = bestNote;
  }
}

// ── 베이스 난이도별 생성 (bass_1~bass_9) ─────────────────────
function generateBassForBar(
  bassNotes: ScoreNote[],
  trebleRhythm: number[],
  sixteenthsPerBar: number,
  chordRoot: number,
  scale: PitchName[],
  keySignature: string,
  trebleAttackMap: Map<number, number>,
  timeSignature: string,
  bassDifficulty: BassDifficulty,
  prevBassNn: number,
  prevBassMidi: number | undefined,
  /** 0부터 — 싱코페이션 구절 해소 판별용 */
  barIndex: number,
  /** 총 마디(종지 포함) — 해소 마디 계산 */
  totalMeasures: number,
  /** 다음 마디 코드 근음 (3단계 순차 경과음 연결용, 마지막 마디면 0) */
  nextChordRoot: number,
  /** 직전 마디의 진행 방향 (계단식 베이스 연속성 유지용) */
  prevBassDir: number,
  /** bass_5: 도약 실행할 마디 인덱스 집합 */
  leapBarsSet?: Set<number>,
): { prevBassNn: number; lastMidi: number | undefined; prevBassDir: number } {
  const BASS_BASE = getBassBaseOctave(scale);
  const bp = BASS_LEVEL_PARAMS[bassDifficulty];
  const bTones = CHORD_TONES[chordRoot];

  // 근음·3음·5음 bnn 정규화 (베이스 음역 -5 ~ 4)
  const rootBnn  = chordRoot > 4 ? chordRoot - 7 : chordRoot;
  const thirdBnn = bTones[1] > 4 ? bTones[1] - 7 : bTones[1];
  const fifthBnn = bTones[2] > 4 ? bTones[2] - 7 : bTones[2];

  /** 직전 실제 울린 MIDI — 충돌로 옥타브만 바뀐 뒤 다음 음이 '한 옥타브 위 계단'처럼 보이는 것 방지 */
  let prevMidiTrack: number | undefined = prevBassMidi;

  // snapToChordTone → imported from scoreUtils (now takes bTones as 2nd param)

  /** 음 하나 출력 — 충돌 해결 후 bassNotes에 추가, 실제 bnn 반환 */
  const emitNote = (nn: number, dur: number, off: number): number => {
    const n = Math.max(-5, Math.min(4, nn));
    const durLabel = SIXTEENTHS_TO_DUR[dur] || '4';
    const { pitch, octave } = noteNumToNote(n, scale, BASS_BASE);
    const oct = Math.max(2, Math.min(4, octave));
    let note = makeNote(pitch, oct, durLabel);
    note = resolveBassClash(note, n, oct, durLabel, off, scale, BASS_BASE, keySignature, trebleAttackMap, bTones);
    note = smoothBassMelodicContinuity(note, durLabel, off, prevMidiTrack, keySignature, trebleAttackMap);
    note = fixParallelPerfect(n, note, durLabel, off, prevMidiTrack, trebleAttackMap, scale, BASS_BASE, keySignature);
    prevMidiTrack = noteToMidiWithKey(note, keySignature);
    bassNotes.push(note);
    return n;
  };

  const bassRhythm = fillRhythm(sixteenthsPerBar, bp.durationPool, {
    timeSignature, minDur: bp.minDur,
  });

  let bnn = rootBnn;
  let bassOff = 0;

  // ── 패턴 보호용 공통 emit (4~7단 등) ──────────────────────────
  // resolveBassClash로 인한 고유 반주 패턴 훼손 방지
  // 동일 건반(treble 충돌) 시에만 옥타브를 내림.
  const emitPatternNote = (nn: number, dur: number, off: number): void => {
    const n = Math.max(-5, Math.min(4, nn));
    const durLabel = SIXTEENTHS_TO_DUR[dur] || '4';
    const { pitch, octave } = noteNumToNote(n, scale, BASS_BASE);
    let oct = Math.max(2, Math.min(3, octave));
    let note = makeNote(pitch, oct, durLabel);
    
    const clashMidi = trebleAttackMap.get(off);
    if (clashMidi !== undefined && noteToMidiWithKey(note, keySignature) === clashMidi) {
      note = makeNote(pitch, Math.max(2, oct - 1), durLabel);
    }
    prevMidiTrack = noteToMidiWithKey(note, keySignature);
    bassNotes.push(note);
  };

  switch (bp.mode) {

    // ── 1단: 지속음 — 해당 마디 화음의 근음을 한 음으로 유지 ──
    case 'pedal': {
      const pedalBnn = rootBnn; // 해당 마디 코드의 근음
      const durLabel = SIXTEENTHS_TO_DUR[sixteenthsPerBar] || '1';
      const { pitch, octave } = noteNumToNote(pedalBnn, scale, BASS_BASE);
      const oct = Math.max(2, Math.min(3, octave));
      let note = makeNote(pitch, oct, durLabel);
      note = resolveBassClash(note, pedalBnn, oct, durLabel, 0, scale, BASS_BASE, keySignature, trebleAttackMap, bTones);
      note = smoothBassMelodicContinuity(note, durLabel, 0, prevMidiTrack, keySignature, trebleAttackMap);
      prevMidiTrack = noteToMidiWithKey(note, keySignature);
      bassNotes.push(note);
      return { prevBassNn: pedalBnn, lastMidi: prevMidiTrack, prevBassDir: 0 };
    }

    // ── 2단: 근음 정박 — 모든 정박에 코드 근음 동일 배치 ─────────
    case 'root_beat': {

      // 박자별 리듬 패턴 결정 (16분음표 단위)
      const [rbTopStr, rbBotStr] = timeSignature.split('/');
      const rbTop = parseInt(rbTopStr, 10);
      const rbBot = parseInt(rbBotStr, 10);
      const isCompound = rbBot === 8 && rbTop % 3 === 0 && rbTop >= 6;

      let rbPattern: { dur: number; useRoot: boolean }[];

      if (isCompound) {
        // 복합 박자 (6/8, 9/8, 12/8): 점4분음표(6) 단위
        const numGroups = Math.round(sixteenthsPerBar / 6);
        rbPattern = [];
        for (let g = 0; g < numGroups; g++) {
          // 모든 그룹을 Root로 고정
          rbPattern.push({ dur: 6, useRoot: true });
        }
        // 나머지 (6으로 나누어 떨어지지 않을 경우)
        const remainder = sixteenthsPerBar - numGroups * 6;
        if (remainder > 0) {
          rbPattern.push({ dur: remainder, useRoot: true });
        }
      } else if (rbTop === 4 && rbBot === 4) {
        // 4/4: 2분음표 2개 — 1박·3박 모두 Root
        rbPattern = [
          { dur: 8, useRoot: true },
          { dur: 8, useRoot: true },
        ];
      } else if (rbTop === 3 && rbBot === 4) {
        // 3/4: 점2분음표 1개 — 마디 전체 Root
        rbPattern = [{ dur: 12, useRoot: true }];
      } else if (rbTop === 2 && rbBot === 4) {
        // 2/4: 2분음표 1개 — 마디 전체 Root
        rbPattern = [{ dur: 8, useRoot: true }];
      } else if (rbTop === 2 && rbBot === 2) {
        // 2/2: 온음표 1개 — 마디 전체 Root
        rbPattern = [{ dur: 16, useRoot: true }];
      } else {
        // 기타 박자: 박 단위로 분할, 첫 박 Root + 나머지 Root 또는 5th
        const rbBeatSize = 16 / rbBot;
        rbPattern = [];
        let rem = sixteenthsPerBar;
        let isFirst = true;
        while (rem > 0) {
          const chunk = Math.min(rbBeatSize, rem);
          rbPattern.push({ dur: chunk, useRoot: true });
          rem -= chunk;
          isFirst = false;
        }
      }

      // ── 근음 정박 전용 emit ──────────────────────────────────────
      // 음 자체는 절대 바꾸지 않음 (resolveBassClash 스킵)
      // 동일 건반(treble 충돌) 시에만 옥타브 1 내림
      const emitRootNote = (nn: number, dur: number, off: number): void => {
        const n = Math.max(-5, Math.min(4, nn));
        const durLabel = SIXTEENTHS_TO_DUR[dur] || '2';
        const { pitch, octave } = noteNumToNote(n, scale, BASS_BASE);
        let oct = Math.max(2, Math.min(3, octave));
        let note = makeNote(pitch, oct, durLabel);
        // 동일 건반만 회피 (옥타브 1 내림)
        const clashMidi = trebleAttackMap.get(off);
        if (clashMidi !== undefined && noteToMidiWithKey(note, keySignature) === clashMidi) {
          note = makeNote(pitch, Math.max(2, oct - 1), durLabel);
        }
        prevMidiTrack = noteToMidiWithKey(note, keySignature);
        bassNotes.push(note);
      };

      // 패턴 실행 — 모든 슬롯에 동일 근음
      for (let j = 0; j < rbPattern.length; j++) {
        emitRootNote(rootBnn, rbPattern[j].dur, bassOff);
        bassOff += rbPattern[j].dur;
      }
      bnn = rootBnn;
      return { prevBassNn: rootBnn, lastMidi: prevMidiTrack, prevBassDir: 0 };
    }

    // ── 3단: 순차 진행 — 마디 간 연속 2도 순차 (도약 없음) ──────
    // 랜덤 요소로 다양한 패턴 생성:
    //   - 시작 음: 랜덤 (으뜸음, 3음, 5음 등)
    //   - 초기 방향: 상행/하행 랜덤
    //   - 음역 경계에서 자동 방향 반전
    //   - 30% 확률로 방향 전환 (다양성)
    //   - 리듬: 2분음표 단위
    case 'directed_step': {
      // 박자별 리듬 결정: 2분음표(8) 단위
      const [stepTopStr, stepBotStr] = timeSignature.split('/');
      const stepTop = parseInt(stepTopStr, 10) || 4;
      const stepBot = parseInt(stepBotStr, 10) || 4;
      const isStepCompound = stepBot === 8 && stepTop % 3 === 0 && stepTop >= 6;

      let stepRhythm: number[];

      if (isStepCompound) {
        // 복합 박자 (6/8, 9/8, 12/8): 점4분음표 단위
        const numGroups = Math.round(sixteenthsPerBar / 6);
        stepRhythm = Array(numGroups).fill(6);
        const remainder = sixteenthsPerBar - numGroups * 6;
        if (remainder > 0) stepRhythm.push(remainder);
      } else if (stepTop >= 4 && stepBot === 4) {
        // 4/4, 5/4 등: 2분음표(8) 단위
        stepRhythm = [];
        let rem = sixteenthsPerBar;
        while (rem > 0) {
          const chunk = Math.min(8, rem);
          stepRhythm.push(chunk);
          rem -= chunk;
        }
      } else if (stepTop === 3 && stepBot === 4) {
        stepRhythm = [12];
      } else if (stepTop === 2 && stepBot === 4) {
        stepRhythm = [8];
      } else {
        stepRhythm = [];
        let rem = sixteenthsPerBar;
        while (rem > 0) {
          const chunk = Math.min(8, rem);
          stepRhythm.push(chunk);
          rem -= chunk;
        }
      }

      const numSlots = stepRhythm.length;

      let startBnn: number;
      let stepDir: number;

      if (barIndex === 0) {
        // 첫 마디: 현재 화음의 화음톤 중심으로 시작 (-1 제거: I화음에서 비화성음)
        startBnn = snapToChordTone(rand([0, 2, 4, -3]), bTones);
        stepDir = Math.random() < 0.5 ? -1 : 1;
      } else {
        // 이후 마디: 직전 마디의 방향을 계속 유지하되, 음역 끝부분에 다다르면 무조건 반전
        stepDir = prevBassDir === 0 ? (Math.random() < 0.5 ? 1 : -1) : prevBassDir;

        if (prevBassNn >= 3) {
          stepDir = -1;
        } else if (prevBassNn <= -4) {
          stepDir = 1;
        } else {
          // 일정한 지그재그 패턴 방지: 20% 확률로만 방향을 전환하여 연속적인 계단 진행 유도
          if (Math.random() < 0.2) {
            stepDir = stepDir === 1 ? -1 : 1;
          }
        }

        // 직전 마디 마지막 음에서 한 스텝 진행 후 현재 화음톤으로 스냅 (마디 경계 화성 정합)
        startBnn = prevBassNn + stepDir;
        if (startBnn > 4) { startBnn = prevBassNn - 1; stepDir = -1; }
        if (startBnn < -5) { startBnn = prevBassNn + 1; stepDir = 1; }
        startBnn = Math.max(-5, Math.min(4, startBnn));
        startBnn = snapToChordTone(startBnn, bTones);
      }

      // 시퀀스 생성: 매 슬롯마다 같은 방향으로 이동 후 화음톤 스냅
      const stepSequence: number[] = [startBnn];
      let current = startBnn;
      for (let s = 1; s < numSlots; s++) {
        current += stepDir;
        // 경계 도달 시 방향 반전
        if (current > 4) { current = prevBassNn <= 4 ? 3 : 4; stepDir = -1; }
        if (current < -5) { current = prevBassNn >= -5 ? -4 : -5; stepDir = 1; }
        current = Math.max(-5, Math.min(4, current));
        // 강박 슬롯은 화음톤에 스냅 — 비화성음으로 인한 불협화음 방지
        const snapped = snapToChordTone(current, bTones);
        if (snapped !== stepSequence[s - 1]) current = snapped;
        stepSequence.push(current);
      }

      // ── 순차 진행 전용 emit ──────────────────────────────────────
      // resolveBassClash / smoothBassMelodicContinuity를 건너뛰어
      // 음 자체가 바뀌어 도약이 생기는 문제 방지.
      // 동일 건반(treble 충돌) 시에만 옥타브를 내림.
      const emitStepNote = (nn: number, dur: number, off: number): void => {
        // 3단계: 순차 패턴 보존 우선 — ensureConsonance 사용 시
        // 순차 음이 화음톤으로 변경되어 계단식 패턴이 깨지므로 적용하지 않음
        const n = Math.max(-5, Math.min(4, nn));
        const durLabel = SIXTEENTHS_TO_DUR[dur] || '2';
        const { pitch, octave } = noteNumToNote(n, scale, BASS_BASE);
        let oct = Math.max(2, Math.min(3, octave));
        let note = makeNote(pitch, oct, durLabel);
        // 동일 건반 회피 + 최소 간격(15반음) 미달 시 옥타브 내림
        const clashMidi = trebleAttackMap.get(off);
        if (clashMidi !== undefined) {
          const bassMidi = noteToMidiWithKey(note, keySignature);
          if (bassMidi === clashMidi || clashMidi - bassMidi < MIN_TREBLE_BASS_SEMITONES) {
            note = makeNote(pitch, Math.max(2, oct - 1), durLabel);
          }
        }
        note = fixParallelPerfect(n, note, durLabel, off, prevMidiTrack, trebleAttackMap, scale, BASS_BASE, keySignature);
        prevMidiTrack = noteToMidiWithKey(note, keySignature);
        bassNotes.push(note);
      };

      // 출력 — 의도한 시퀀스를 그대로 출력 (보정으로 인한 도약 없음)
      let intendedLastBnn = startBnn;
      for (let j = 0; j < stepRhythm.length; j++) {
        const seqBnn = j < stepSequence.length ? stepSequence[j] : startBnn;
        emitStepNote(seqBnn, stepRhythm[j], bassOff);
        if (j < stepSequence.length) intendedLastBnn = stepSequence[j];
        bassOff += stepRhythm[j];
        bnn = seqBnn;
      }
      // prevBassNn은 의도한 순차 위치로 반환 (다음 마디 계산 기준)
      return { prevBassNn: intendedLastBnn, lastMidi: prevMidiTrack, prevBassDir: stepDir };
    }

    // ── 4단: 기본 반주 (미사용 — 주석 처리) ────────────
    /* case 'alternating': {
      const rhythmLen = bassRhythm.length;

      for (let j = 0; j < rhythmLen; j++) {
        // 마지막 박자 & 패턴이 2개 이상이고 & 다음 마디 코드가 존재할 때 어프로치 노트 적용
        const isLastSlot = j === rhythmLen - 1 && rhythmLen > 1;
        const hasNextMeasure = barIndex + 1 < totalMeasures;

        if (isLastSlot && hasNextMeasure) {
          // 다음 마디 첫 박 타겟의 bnn 계산
          let targetBnn = nextChordRoot > 4 ? nextChordRoot - 7 : nextChordRoot;
          
          // 타겟 노트의 인접음(Diatonic Approach): 위에서 하행(+1) 또는 아래에서 상행(-1)
          let approachDir = Math.random() < 0.5 ? 1 : -1;
          
          // 어프로치 노트가 베이스 음역(-5 ~ 4)을 벗어나면, 옥타브를 꺾지 말고 어프로치 방향을 반전시킴
          // (옥타브를 꺾으면 다음 마디 타겟음과 7도 도약이 발생함)
          if (targetBnn + approachDir > 4) {
            approachDir = -1;
          } else if (targetBnn + approachDir < -5) {
            approachDir = 1;
          }
          bnn = targetBnn + approachDir;
        } else {
          // 1~3박자: 무조건 근음(Root) 연주
          bnn = rootBnn;
        }

        emitPatternNote(bnn, bassRhythm[j], bassOff);
        bassOff += bassRhythm[j];
      }
      return { prevBassNn: bnn, lastMidi: prevMidiTrack, prevBassDir: 0 };
    } */ // end alternating (미사용)

    // ── 5단: 2분음표 협화 베이스 — 화음톤 기반 2분음표로 treble과 협화 ──
    case 'harmonic_half': {
      // 박자별 2분음표(8) 단위 리듬 결정
      const [hTopStr, hBotStr] = timeSignature.split('/');
      const hTop = parseInt(hTopStr, 10) || 4;
      const hBot = parseInt(hBotStr, 10) || 4;
      const isHCompound = hBot === 8 && hTop % 3 === 0 && hTop >= 6;
      let hRhythm: number[];
      if (isHCompound) {
        // 복합 박자: 점4분음표(6) 단위
        const n = Math.round(sixteenthsPerBar / 6);
        hRhythm = Array(n).fill(6);
        const rem = sixteenthsPerBar - n * 6;
        if (rem > 0) hRhythm.push(rem);
      } else if (hTop === 3 && hBot === 4) {
        // 3/4: 점2분음표 1개
        hRhythm = [12];
      } else if (hTop === 2 && hBot === 4) {
        // 2/4: 2분음표 1개
        hRhythm = [8];
      } else {
        // 4/4 등: 2분음표(8) 단위
        hRhythm = [];
        let rem = sixteenthsPerBar;
        while (rem > 0) { const c = Math.min(8, rem); hRhythm.push(c); rem -= c; }
      }

      // 첫 슬롯은 근음, 이후 슬롯은 treble과 가장 잘 어울리는 화음톤 선택
      bnn = rootBnn;
      let hOff = bassOff;
      for (let j = 0; j < hRhythm.length; j++) {
        if (j > 0) {
          // treble MIDI 확인 후 가장 협화적인 화음톤 선택
          const tMidi = trebleAttackMap.get(hOff);
          if (tMidi !== undefined) {
            let bestTone = rootBnn, bestScore = -1;
            for (const t of bTones) {
              const cand = t > 4 ? t - 7 : t;
              if (cand < -5 || cand > 4) continue;
              const { pitch: cp, octave: co } = noteNumToNote(cand, scale, BASS_BASE);
              const cOct = Math.max(2, Math.min(3, co));
              const cMidi = noteToMidiWithKey(makeNote(cp, cOct, '4'), keySignature);
              const pc = ((tMidi - cMidi) % 12 + 12) % 12;
              // 불완전 협화음(3도/6도) 최우선, 완전 협화음 차선, 불협화 제외
              let score = 0;
              if (IMPERFECT_CONSONANT_PC.has(pc)) score = 3;
              else if (!DISSONANT_PC.has(pc)) score = 1;
              // 직전 음과의 순차 진행 보너스 (부드러운 움직임)
              const dist = Math.abs(cand - bnn);
              if (dist <= 2) score += 1;
              if (score > bestScore) { bestScore = score; bestTone = cand; }
            }
            bnn = bestTone;
          } else {
            bnn = rand(bTones);
            if (bnn > 4) bnn -= 7;
          }
        }
        bnn = Math.max(-5, Math.min(4, bnn));
        // 협화음 검증
        bnn = ensureConsonance(bnn, hOff, trebleAttackMap, scale, BASS_BASE, keySignature, bTones);

        const durLabel = SIXTEENTHS_TO_DUR[hRhythm[j]] || '2';
        const { pitch, octave } = noteNumToNote(bnn, scale, BASS_BASE);
        let oct = Math.max(2, Math.min(3, octave));
        let note = makeNote(pitch, oct, durLabel);
        // 동일 건반 회피 + 최소 간격
        const clashMidi = trebleAttackMap.get(hOff);
        if (clashMidi !== undefined) {
          const bassMidi = noteToMidiWithKey(note, keySignature);
          if (bassMidi === clashMidi || clashMidi - bassMidi < MIN_TREBLE_BASS_SEMITONES) {
            note = makeNote(pitch, Math.max(2, oct - 1), durLabel);
          }
        }
        note = fixParallelPerfect(bnn, note, durLabel, hOff, prevMidiTrack, trebleAttackMap, scale, BASS_BASE, keySignature);
        prevMidiTrack = noteToMidiWithKey(note, keySignature);
        bassNotes.push(note);
        hOff += hRhythm[j];
      }
      return { prevBassNn: bnn, lastMidi: prevMidiTrack, prevBassDir: 0 };
    }

    // ── 3단: 2분음표 + 4분음표 협화 베이스 ────────────────────────
    // 4/4: 2분+2분(8+8) 또는 2분+4분+4분(8+4+4) 랜덤 선택
    // 3/4: 2분+4분(8+4)
    // 2/4: 2분(8)
    case 'harmonic_mixed': {
      const [mTopStr, mBotStr] = timeSignature.split('/');
      const mTop = parseInt(mTopStr, 10) || 4;
      const mBot = parseInt(mBotStr, 10) || 4;
      const isMCompound = mBot === 8 && mTop % 3 === 0 && mTop >= 6;
      let mRhythm: number[];
      if (isMCompound) {
        // 복합 박자: 점4분(6) 단위
        const n = Math.round(sixteenthsPerBar / 6);
        mRhythm = Array(n).fill(6);
        const rem = sixteenthsPerBar - n * 6;
        if (rem > 0) mRhythm.push(rem);
      } else if (mTop === 4 && mBot === 4) {
        // 4/4: 2분+2분 또는 2분+4분+4분
        mRhythm = Math.random() < 0.5 ? [8, 8] : [8, 4, 4];
      } else if (mTop === 3 && mBot === 4) {
        // 3/4: 2분+4분
        mRhythm = [8, 4];
      } else if (mTop === 2 && mBot === 4) {
        // 2/4: 2분 1개
        mRhythm = [8];
      } else {
        // 기타: 2분 단위 채우기
        mRhythm = [];
        let rem = sixteenthsPerBar;
        while (rem > 0) { const c = Math.min(8, rem); mRhythm.push(c); rem -= c; }
      }

      // 첫 슬롯은 근음, 이후 슬롯은 treble과 가장 잘 어울리는 화음톤 선택
      bnn = rootBnn;
      let mOff = bassOff;
      for (let j = 0; j < mRhythm.length; j++) {
        if (j > 0) {
          const tMidi = trebleAttackMap.get(mOff);
          if (tMidi !== undefined) {
            let bestTone = rootBnn, bestScore = -1;
            for (const t of bTones) {
              const cand = t > 4 ? t - 7 : t;
              if (cand < -5 || cand > 4) continue;
              const { pitch: cp, octave: co } = noteNumToNote(cand, scale, BASS_BASE);
              const cOct = Math.max(2, Math.min(3, co));
              const cMidi = noteToMidiWithKey(makeNote(cp, cOct, '4'), keySignature);
              const pc = ((tMidi - cMidi) % 12 + 12) % 12;
              let score = 0;
              if (IMPERFECT_CONSONANT_PC.has(pc)) score = 3;
              else if (!DISSONANT_PC.has(pc)) score = 1;
              const dist = Math.abs(cand - bnn);
              if (dist <= 2) score += 1;
              if (score > bestScore) { bestScore = score; bestTone = cand; }
            }
            bnn = bestTone;
          } else {
            bnn = rand(bTones);
            if (bnn > 4) bnn -= 7;
          }
        }
        bnn = Math.max(-5, Math.min(4, bnn));
        bnn = ensureConsonance(bnn, mOff, trebleAttackMap, scale, BASS_BASE, keySignature, bTones);

        const durLabel = SIXTEENTHS_TO_DUR[mRhythm[j]] || '4';
        const { pitch, octave } = noteNumToNote(bnn, scale, BASS_BASE);
        let oct = Math.max(2, Math.min(3, octave));
        let note = makeNote(pitch, oct, durLabel);
        const clashMidi = trebleAttackMap.get(mOff);
        if (clashMidi !== undefined) {
          const bassMidi = noteToMidiWithKey(note, keySignature);
          if (bassMidi === clashMidi || clashMidi - bassMidi < MIN_TREBLE_BASS_SEMITONES) {
            note = makeNote(pitch, Math.max(2, oct - 1), durLabel);
          }
        }
        note = fixParallelPerfect(bnn, note, durLabel, mOff, prevMidiTrack, trebleAttackMap, scale, BASS_BASE, keySignature);
        prevMidiTrack = noteToMidiWithKey(note, keySignature);
        bassNotes.push(note);
        mOff += mRhythm[j];
      }
      return { prevBassNn: bnn, lastMidi: prevMidiTrack, prevBassDir: 0 };
    }

    // ── 6단: 분산화음 arpeggio (미사용 — 주석 처리) ─────────────
    /* case 'arpeggio': {
      // 3음·5음은 가급적 근음 위로 올림
      let hi3 = thirdBnn <= rootBnn ? thirdBnn + 7 : thirdBnn;
      let hi5 = fifthBnn <= rootBnn ? fifthBnn + 7 : fifthBnn;

      // 음역(4) 초과 시 옥타브를 낮춤 (clamp로 인해 같은 음 반복되는 버그 방지)
      if (hi3 > 4) hi3 -= 7;
      if (hi5 > 4) hi5 -= 7;

      const arp = [rootBnn, hi3, hi5, hi3];
      for (let j = 0; j < bassRhythm.length; j++) {
        bnn = arp[j % arp.length];
        emitPatternNote(bnn, bassRhythm[j], bassOff);
        bassOff += bassRhythm[j];
      }
      return { prevBassNn: bnn, lastMidi: prevMidiTrack, prevBassDir: 0 };
    }

    // ── 7단: 전위 화음 (미사용) ─────────────────
    case 'inversion': {
      // 하행 베이스 라인: 5음(높)→3음→근음  또는  3음→근음→5음(낮)
      let hi5 = fifthBnn < rootBnn ? fifthBnn + 7 : fifthBnn;
      if (hi5 > 4) hi5 -= 7;

      let lo5 = fifthBnn > rootBnn ? fifthBnn - 7 : fifthBnn;
      if (lo5 < -5) lo5 += 7;

      const descLine = Math.random() < 0.5
        ? [hi5, thirdBnn, rootBnn]
        : [thirdBnn, rootBnn, lo5];

      for (let j = 0; j < bassRhythm.length; j++) {
        bnn = emitNote(descLine[j % descLine.length], bassRhythm[j], bassOff);
        bassOff += bassRhythm[j];
      }
      return { prevBassNn: bnn, lastMidi: prevMidiTrack, prevBassDir: 0 };
    }

    // ── 8단: 싱코페이션 — (쉼표)-근음 교차 / 구절 해소는 isSyncopationPhraseResolutionBar 참조
    case 'syncopated': {
      if (isSyncopationPhraseResolutionBar(totalMeasures, barIndex)) {
        // 5단 leap과 동일: 도약 진행(근↔낮은5↔3↔근) + 5단 리듬 풀
        const lowFifth = fifthBnn >= rootBnn ? fifthBnn - 7 : fifthBnn;
        const leapPattern = [rootBnn, Math.max(-5, lowFifth), thirdBnn, rootBnn];
        const resolutionRhythm = fillRhythm(sixteenthsPerBar, [4], {
          timeSignature, minDur: 4,
        });
        let pos = 0;
        for (let j = 0; j < resolutionRhythm.length; j++) {
          bnn = emitNote(leapPattern[j % leapPattern.length], resolutionRhythm[j], pos);
          pos += resolutionRhythm[j];
        }
        bassOff = pos;
        return { prevBassNn: bnn, lastMidi: prevMidiTrack, prevBassDir: 0 };
      }

      const [topStr, bs] = timeSignature.split('/');
      const top = parseInt(topStr, 10) || 4;
      const bottom = parseInt(bs, 10) || 4;
      const isCompound = bottom === 8 && top % 3 === 0 && top >= 6;
      const beatSize = isCompound ? 6 : 16 / bottom;
      const numBeats = Math.max(1, Math.round(sixteenthsPerBar / beatSize));
      let pos = 0;
      bnn = rootBnn;
      for (let b = 0; b < numBeats; b++) {
        const dur = beatSize;
        if (b % 2 === 0) {
          bassNotes.push(makeRest(SIXTEENTHS_TO_DUR[dur] || '4'));
        } else {
          bnn = emitNote(rootBnn, dur, pos);
        }
        pos += dur;
      }
      bassOff = pos;
      return { prevBassNn: bnn, lastMidi: prevMidiTrack, prevBassDir: 0 };
    }

    // ── 9단: 반진행 — 마디 단위 반진행 + 강박 이동 보장 + 병행 완전음정 방지 ─
    case 'contrary': {
      const [, bs] = timeSignature.split('/');
      const beatSize = 16 / (parseInt(bs, 10) || 4);

      // 트레블 공격 목록 (시간순 정렬)
      const trebleAttacks = [...trebleAttackMap.entries()].sort(([a], [b]) => a - b);

      // pos에서 가장 최근 트레블 MIDI 값
      const getTrebleMidiAt = (pos: number): number | undefined => {
        let result: number | undefined;
        for (const [off, midi] of trebleAttacks) {
          if (off <= pos) result = midi;
          else break;
        }
        return result;
      };

      // bnn → MIDI 변환
      const bnnToMidi = (n: number): number => {
        const clamped = Math.max(-5, Math.min(4, n));
        const { pitch, octave } = noteNumToNote(clamped, scale, BASS_BASE);
        const oct = Math.max(2, Math.min(4, octave));
        return noteToMidiWithKey(makeNote(pitch, oct, '4'), keySignature);
      };

      // 방향 인식 화음 구성음 snap — 현재 위치 제외, 방향 강력 선호
      const snapDir = (nn: number, preferDir: number): number => {
        let best: number | undefined;
        let bestScore = Infinity;
        for (const t of bTones) {
          for (const base of [
            Math.floor(nn / 7) * 7 + t,
            Math.floor(nn / 7) * 7 + t - 7,
            Math.floor(nn / 7) * 7 + t + 7,
          ]) {
            if (base === nn || base < -5 || base > 4) continue; // 현재 위치 제외
            const d = Math.abs(base - nn);
            const wrongDir = preferDir !== 0 && Math.sign(base - nn) !== preferDir;
            const score = d + (wrongDir ? 10 : 0); // 방향 페널티 강화
            if (score < bestScore) { bestScore = score; best = base; }
          }
        }
        return Math.max(-5, Math.min(4, best ?? nn));
      };

      // 병행 완전음정(5도/8도) 검사
      const hasParallelPerfect = (
        pBMidi: number, pTMidi: number | undefined,
        cBMidi: number, cTMidi: number | undefined,
      ): boolean => {
        if (pTMidi === undefined || cTMidi === undefined) return false;
        const pInt = ((pTMidi - pBMidi) % 12 + 12) % 12;
        const cInt = ((cTMidi - cBMidi) % 12 + 12) % 12;
        if ((pInt !== 0 && pInt !== 7) || (cInt !== 0 && cInt !== 7)) return false;
        return Math.sign(cBMidi - pBMidi) !== 0 &&
          Math.sign(cBMidi - pBMidi) === Math.sign(cTMidi - pTMidi);
      };

      // 마디 전체 트레블 방향으로 반진행 방향 결정 (진동 방지)
      const globalTDir = trebleAttacks.length >= 2
        ? (trebleAttacks[trebleAttacks.length - 1][1] > trebleAttacks[0][1] ? 1 : -1) : 0;
      const bassDir = globalTDir === 0 ? (Math.random() < 0.5 ? 1 : -1) : -globalTDir;

      bnn = snapToChordTone(prevBassNn !== 0 ? prevBassNn : rootBnn, bTones);

      let pos = 0;
      let prevBMidi = bnnToMidi(bnn);
      let prevTMidi = getTrebleMidiAt(0);

      for (let j = 0; j < bassRhythm.length; j++) {
        if (j > 0) {
          if (pos % beatSize === 0) {
            // 강박: 현재 위치 제외 + 방향 강력 선호 chord tone snap → 반드시 이동 보장
            bnn = snapDir(bnn, bassDir);
          } else {
            // 약박: 순차 경과음 (passing tone)
            bnn = Math.max(-5, Math.min(4, bnn + bassDir));
          }
        }

        // 병행 완전음정 보정 — 위반 시 한 step 추가 이동
        const currTMidi = getTrebleMidiAt(pos);
        if (j > 0 && hasParallelPerfect(prevBMidi, prevTMidi, bnnToMidi(bnn), currTMidi)) {
          bnn = Math.max(-5, Math.min(4, bnn + bassDir));
        }

        bnn = emitNote(bnn, bassRhythm[j], bassOff);
        prevBMidi = noteToMidiWithKey(bassNotes[bassNotes.length - 1], keySignature);
        prevTMidi = currTMidi;
        bassOff += bassRhythm[j];
        pos += bassRhythm[j];
      }
      return { prevBassNn: bnn, lastMidi: prevMidiTrack, prevBassDir: 0 };
    }
    */ // end 미사용 케이스 (arpeggio / inversion / syncopated / contrary)

    default:
      return { prevBassNn: rootBnn, lastMidi: prevMidiTrack, prevBassDir: 0 };
  }
}

// ── 초급 베이스: 화음톤 기반 ─────────────────────────────────
function generateBasicBass(
  bassNotes: ScoreNote[], trebleRhythm: number[], sixteenthsPerBar: number,
  chordRoot: number, scale: PitchName[],
  keySignature: string,
  trebleAttackMap: Map<number, number>,
  timeSignature?: string,
  pool?: number[],
  params?: LevelParams,
) {
  const BASS_BASE   = getBassBaseOctave(scale);
  const bTones      = CHORD_TONES[chordRoot];
  // 난이도 풀 우선, 없으면 트레블 기반 폴백
  const bassPool = pool ?? (trebleRhythm.some(d => d <= 2) ? [16, 8] : [8, 4]);
  const bassRhythm  = fillRhythm(sixteenthsPerBar, bassPool, { timeSignature, minDur: 2 });

  const strongBeats = getStrongBeatOffsets(timeSignature || '4/4');
  const contraryRatio = params?.contraryMotionRatio ?? 0.30;
  const consonanceTarget = params?.consonanceRatio ?? 1.0;

  let bnn = chordRoot;
  if (bnn > 4) bnn -= 7;

  const startIdx = bassNotes.length;
  const offsets: number[] = [];
  const durations: number[] = [];

  let bassOff = 0;
  let prevMidi: number | undefined = undefined;
  let prevTrebleMidi: number | undefined;
  for (let j = 0; j < bassRhythm.length; j++) {
    const dur      = bassRhythm[j];
    const durLabel = SIXTEENTHS_TO_DUR[dur] || '4';
    if (j > 0) {
      // 반진행 바이어스: treble 방향 반대로 화음톤 선택
      const curTrebleMidi = trebleAttackMap.get(bassOff);
      let useContrary = false;
      if (prevTrebleMidi !== undefined && curTrebleMidi !== undefined && Math.random() < contraryRatio) {
        const trebleDir = curTrebleMidi > prevTrebleMidi ? 1 : curTrebleMidi < prevTrebleMidi ? -1 : 0;
        if (trebleDir !== 0) {
          // treble 반대 방향의 화음톤 선호
          const candidates = bTones.map(t => t > 4 ? t - 7 : t).filter(t => t >= -5 && t <= 4);
          const preferred = candidates.filter(t => Math.sign(t - bnn) === -trebleDir);
          if (preferred.length > 0) { bnn = rand(preferred); useContrary = true; }
        }
      }
      if (!useContrary) { bnn = rand(bTones); if (bnn > 4) bnn -= 7; }
    }
    bnn = Math.max(-5, Math.min(4, bnn));

    // 강박 협화음 검증
    if (strongBeats.has(bassOff)) {
      bnn = ensureConsonance(bnn, bassOff, trebleAttackMap, scale, BASS_BASE, keySignature, bTones);
    }

    const { pitch, octave } = noteNumToNote(bnn, scale, BASS_BASE);
    let oct = Math.max(2, Math.min(4, octave));
    let note = makeNote(pitch, oct, durLabel);
    note = resolveBassClash(note, bnn, oct, durLabel, bassOff, scale, BASS_BASE, keySignature, trebleAttackMap, bTones);
    note = smoothBassMelodicContinuity(note, durLabel, bassOff, prevMidi, keySignature, trebleAttackMap);
    note = fixParallelPerfect(bnn, note, durLabel, bassOff, prevMidi, trebleAttackMap, scale, BASS_BASE, keySignature);

    // treble MIDI 추적
    const tMidi = trebleAttackMap.get(bassOff);
    if (tMidi !== undefined) prevTrebleMidi = tMidi;

    prevMidi = noteToMidiWithKey(note, keySignature);
    bassNotes.push(note);
    offsets.push(bassOff);
    durations.push(dur);
    bassOff += dur;
  }

  // 불완전 협화음 비율 후보정
  if (consonanceTarget < 1.0) {
    applyImperfectConsonanceRatio(
      bassNotes, startIdx, offsets, durations,
      trebleAttackMap, scale, BASS_BASE, keySignature, bTones,
      consonanceTarget, strongBeats,
    );
  }
}

// ── 중급 베이스: 독립적 리듬 프로필 ─────────────────────────
function generateIndependentBass(
  bassNotes: ScoreNote[], trebleRhythm: number[], sixteenthsPerBar: number,
  chordRoot: number, scale: PitchName[], params: LevelParams,
  keySignature: string,
  trebleAttackMap: Map<number, number>,
  timeSignature?: string,
  pool?: number[],
) {
  const BASS_BASE   = getBassBaseOctave(scale);
  const bTones      = CHORD_TONES[chordRoot];

  // 난이도 풀 우선, 없으면 독립도 기반 폴백
  let bassPool: number[];
  if (pool) {
    bassPool = pool;
  } else if (params.bassIndependence >= 0.6) {
    bassPool = [8, 6, 4, 2];
  } else {
    const trebleShort = trebleRhythm.some(d => d <= 2);
    bassPool = trebleShort ? [8, 4] : [8, 6, 4];
  }

  const bassRhythm = fillRhythm(sixteenthsPerBar, bassPool, { timeSignature, minDur: 2 });

  const strongBeats = getStrongBeatOffsets(timeSignature || '4/4');
  const contraryRatio = params.contraryMotionRatio;
  const consonanceTarget = params.consonanceRatio;

  let bnn = chordRoot;
  if (bnn > 4) bnn -= 7;

  const startIdx = bassNotes.length;
  const offsets: number[] = [];
  const durations: number[] = [];

  let bassOff = 0;
  let prevMidi: number | undefined = undefined;
  let prevTrebleMidi: number | undefined;
  for (let j = 0; j < bassRhythm.length; j++) {
    const dur      = bassRhythm[j];
    const durLabel = SIXTEENTHS_TO_DUR[dur] || '4';
    if (j > 0) {
      // 반진행 바이어스: treble 방향 반대로 이동 선호
      const curTrebleMidi = trebleAttackMap.get(bassOff);
      let useContrary = false;
      if (prevTrebleMidi !== undefined && curTrebleMidi !== undefined && Math.random() < contraryRatio) {
        const trebleDir = curTrebleMidi > prevTrebleMidi ? 1 : curTrebleMidi < prevTrebleMidi ? -1 : 0;
        if (trebleDir !== 0) {
          // treble 반대 방향으로 순차/화음톤 이동
          const bassDir = -trebleDir;
          if (Math.random() < 0.4) {
            bnn += bassDir; // 순차 (반진행 방향)
          } else {
            const candidates = bTones.map(t => t > 4 ? t - 7 : t).filter(t => t >= -5 && t <= 4);
            const preferred = candidates.filter(t => Math.sign(t - bnn) === bassDir);
            bnn = preferred.length > 0 ? rand(preferred) : rand(candidates);
          }
          useContrary = true;
        }
      }
      if (!useContrary) {
        // 기존 순차진행 + 화음톤 혼합
        if (Math.random() < 0.4) {
          bnn += rand([1, -1]); // 순차
        } else {
          bnn = rand(bTones);
        }
      }
      if (bnn > 4) bnn -= 7;
    }
    bnn = Math.max(-5, Math.min(4, bnn));

    // 강박 협화음 검증
    if (strongBeats.has(bassOff)) {
      bnn = ensureConsonance(bnn, bassOff, trebleAttackMap, scale, BASS_BASE, keySignature, bTones);
    }

    const { pitch, octave } = noteNumToNote(bnn, scale, BASS_BASE);
    let oct = Math.max(2, Math.min(4, octave));
    let note = makeNote(pitch, oct, durLabel);
    note = resolveBassClash(note, bnn, oct, durLabel, bassOff, scale, BASS_BASE, keySignature, trebleAttackMap, bTones);
    note = smoothBassMelodicContinuity(note, durLabel, bassOff, prevMidi, keySignature, trebleAttackMap);
    note = fixParallelPerfect(bnn, note, durLabel, bassOff, prevMidi, trebleAttackMap, scale, BASS_BASE, keySignature);

    // treble MIDI 추적
    const tMidi = trebleAttackMap.get(bassOff);
    if (tMidi !== undefined) prevTrebleMidi = tMidi;

    prevMidi = noteToMidiWithKey(note, keySignature);
    bassNotes.push(note);
    offsets.push(bassOff);
    durations.push(dur);
    bassOff += dur;
  }

  // 불완전 협화음 비율 후보정
  applyImperfectConsonanceRatio(
    bassNotes, startIdx, offsets, durations,
    trebleAttackMap, scale, BASS_BASE, keySignature, bTones,
    consonanceTarget, strongBeats,
  );
}

// ── 고급 베이스: 분산화음(아르페지오) / 워킹베이스 ────────────
function generateArpeggioBass(
  bassNotes: ScoreNote[],
  sixteenthsPerBar: number,
  chordRoot: number,
  scale: PitchName[],
  keySignature: string,
  trebleAttackMap: Map<number, number>,
) {
  const BASS_BASE = getBassBaseOctave(scale);
  const bTones = CHORD_TONES[chordRoot];
  const pattern = [bTones[0], bTones[2], bTones[1], bTones[2]];

  const totalEighths = Math.floor(sixteenthsPerBar / 2);
  const leftover     = sixteenthsPerBar % 2;

  let bassOff = 0;
  let prevMidi: number | undefined = undefined;
  for (let j = 0; j < totalEighths; j++) {
    let bnn = pattern[j % pattern.length];
    if (bnn > 4) bnn -= 7;
    bnn = Math.max(-5, Math.min(4, bnn));
    const { pitch, octave } = noteNumToNote(bnn, scale, BASS_BASE);
    let oct = Math.max(2, Math.min(4, octave));
    let note = makeNote(pitch, oct, '8');
    note = resolveBassClash(note, bnn, oct, '8', bassOff, scale, BASS_BASE, keySignature, trebleAttackMap, bTones);
    note = smoothBassMelodicContinuity(note, '8', bassOff, prevMidi, keySignature, trebleAttackMap);
    prevMidi = noteToMidiWithKey(note, keySignature);
    bassNotes.push(note);
    bassOff += 2;
  }

  if (leftover > 0) {
    let bnn = pattern[totalEighths % pattern.length];
    if (bnn > 4) bnn -= 7;
    bnn = Math.max(-5, Math.min(4, bnn));
    const { pitch, octave } = noteNumToNote(bnn, scale, BASS_BASE);
    let oct = Math.max(2, Math.min(4, octave));
    let note = makeNote(pitch, oct, '16');
    note = resolveBassClash(note, bnn, oct, '16', bassOff, scale, BASS_BASE, keySignature, trebleAttackMap, bTones);
    note = smoothBassMelodicContinuity(note, '16', bassOff, prevMidi, keySignature, trebleAttackMap);
    bassNotes.push(note);
  }
}
