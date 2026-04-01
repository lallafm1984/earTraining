// ────────────────────────────────────────────────────────────────
// Unified Melody Generator (통합 멜로디 생성기)
// 1성부(단일 보표) / 2성부(큰보표) 공용.
// bassNotes가 주어지면 2성부(강박 협화 강제), 없으면 1성부(독립 선율).
// Spec: temp/ear_training_melody_prompt_v4.md — 레벨 1–9, 강박 협화, 화성단조 처리
// ────────────────────────────────────────────────────────────────

import type { ScoreNote, PitchName, NoteDuration, Accidental } from '../scoreUtils';
import {
  getScaleDegrees,
  getSixteenthsPerBar,
  noteNumToNote,
  nnToMidi,
  noteToMidiWithKey,
  durationToSixteenths,
  makeNote,
  makeRest,
  DISSONANT_PC,
  IMPERFECT_CONSONANT_PC,
  CHORD_TONES,
  PITCH_ORDER,
  isForbiddenMelodicInterval,
  getKeySigAlteration,
  SIXTEENTHS_TO_DUR,
  sixteenthsToDuration,
  getTupletNoteDuration,
} from '../scoreUtils';
import type { TimeSignature } from './types';
import { strongBeatOffsetsSixteenths0 } from './meter';
import { fillRhythm } from '../trebleRhythmFill';
import {
  getDurationPoolForMelodyLevel,
  getTrebleRhythmParamsForMelodyLevel,
} from '../melodyRhythmLevel';
import { getMelodyMotionParams, inferChordDegreeFromBassMidi } from './melodyScoreParity';
import { applyMelodyAccidentals } from './chromaticAccidental';

// ────────────────────────────────────────────────────────────────
// Public interface
// ────────────────────────────────────────────────────────────────

/** @deprecated Use MelodyGeneratorOptions instead */
export type TwoVoiceMelodyOptions = MelodyGeneratorOptions;

export interface MelodyGeneratorOptions {
  key: string;              // e.g. 'C', 'Am', 'Dm'
  mode: 'major' | 'harmonic_minor';
  timeSig: TimeSignature;
  measures: number;         // total measures including cadence (4, 8, 12, 16)
  melodyLevel: number;      // 1-9
  progression: number[];    // chord progression (scale degree indices)
  /** Pre-generated bass (excluding cadence bar). 없으면 1성부 모드. */
  bassNotes?: ScoreNote[];
  /** Treble staff octave base (default 4). Pass scoreGenerator's TREBLE_BASE for alignment. */
  trebleBaseOctave?: number;
  /**
   * Min/max scale-degree offset (nn) — must match scoreGenerator treble bounds so the
   * melody stays in treble register (avoids B₃-style dips when nnLow was symmetric).
   */
  melodyNnMin?: number;
  melodyNnMax?: number;
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const TREBLE_BASE = 4;

/** Level-specific melody constraints (음역·쉼표는 v4 패턴, 선율·도약·스냅은 1성부 LEVEL_PARAMS 정렬) */
interface LevelConstraints {
  stepwiseRatio: number;
  maxLeap: number;
  maxInterval: number;
  chordSnapStrong: number;
  chordSnapWeak: number;
  allowRests: boolean;
  rangeOctaves: number;
}

/** 음역·쉼표 허용만 레벨별 (리듬 v4); stepwise/maxLeap 등은 getMelodyMotionParams로 덮어씀 */
const LEVEL_RANGE_REST: Record<number, Pick<LevelConstraints, 'allowRests' | 'rangeOctaves'>> = {
  1: { allowRests: false, rangeOctaves: 1 },
  2: { allowRests: true,  rangeOctaves: 1 },
  3: { allowRests: true,  rangeOctaves: 1 },
  4: { allowRests: true,  rangeOctaves: 1 },
  5: { allowRests: true,  rangeOctaves: 1.5 },
  6: { allowRests: true,  rangeOctaves: 1.5 },
  7: { allowRests: true,  rangeOctaves: 1.5 },
  8: { allowRests: true,  rangeOctaves: 1.5 },
  9: { allowRests: true,  rangeOctaves: 2 },
};

function buildLevelConstraints(level: number): LevelConstraints {
  const k = Math.min(Math.max(level, 1), 9);
  const motion = getMelodyMotionParams(k);
  const rr = LEVEL_RANGE_REST[k];
  return {
    stepwiseRatio: motion.stepwiseProb,
    maxLeap: motion.maxLeap,
    maxInterval: motion.maxInterval,
    chordSnapStrong: motion.chordSnapStrong,
    chordSnapWeak: motion.chordSnapWeak,
    allowRests: rr.allowRests,
    rangeOctaves: rr.rangeOctaves,
  };
}

// ────────────────────────────────────────────────────────────────
// Internal context
// ────────────────────────────────────────────────────────────────

interface MelodyGenContext {
  scale: PitchName[];
  baseOctave: number;
  keySignature: string;
  mode: 'major' | 'harmonic_minor';
  timeSig: TimeSignature;
  constraints: LevelConstraints;
  level: number;
  /** Range limits in nn */
  nnLow: number;
  nnHigh: number;
  /** 베이스가 존재하면 true (2성부), 없으면 false (1성부) */
  hasBass: boolean;
  /** 프레이즈 정점 계획 (lvl>=4, 4마디 프레이즈 단위) */
  phrasePeaks: { bar: number; peakNn: number }[];
}

function buildContext(opts: MelodyGeneratorOptions): MelodyGenContext {
  const keySignature = opts.mode === 'harmonic_minor'
    ? (opts.key.endsWith('m') ? opts.key : opts.key + 'm')
    : opts.key;
  const scale = getScaleDegrees(keySignature);
  const baseOctave = opts.trebleBaseOctave ?? TREBLE_BASE;
  const constraints = buildLevelConstraints(opts.melodyLevel);

  // Range: center around tonic at treble base octave (nn=0 = root at baseOctave)
  const rangeHalf = Math.ceil(constraints.rangeOctaves * 7);
  let nnLow = -rangeHalf;
  let nnHigh = rangeHalf;
  if (opts.melodyNnMin !== undefined) nnLow = Math.max(nnLow, opts.melodyNnMin);
  if (opts.melodyNnMax !== undefined) nnHigh = Math.min(nnHigh, opts.melodyNnMax);
  if (nnLow > nnHigh) nnLow = nnHigh;

  const hasBass = !!opts.bassNotes && opts.bassNotes.length > 0;
  const level = opts.melodyLevel;
  const effectiveMax = nnHigh;

  // ── 단일 정점 사전 계획 (4마디 프레이즈 단위, lvl>=4) ──
  const PHRASE_LEN = 4;
  const phrasePeaks: { bar: number; peakNn: number }[] = [];
  if (level >= 4) {
    const loopBars = opts.measures - 1; // 종지 마디 제외
    const phraseCount = Math.ceil(loopBars / PHRASE_LEN);
    for (let p = 0; p < phraseCount; p++) {
      const pStart = p * PHRASE_LEN;
      const pEnd = Math.min(pStart + PHRASE_LEN - 1, loopBars - 1);
      const peakBar = pEnd > pStart
        ? pStart + 1 + Math.floor(Math.random() * Math.max(1, pEnd - pStart))
        : pStart;
      const peakNn = Math.min(
        effectiveMax,
        Math.floor(effectiveMax * 0.75) + Math.floor(Math.random() * Math.ceil(effectiveMax * 0.25 + 1)),
      );
      phrasePeaks.push({ bar: Math.min(peakBar, pEnd), peakNn });
    }
  }

  return {
    scale, baseOctave, keySignature, mode: opts.mode,
    timeSig: opts.timeSig, constraints, level,
    nnLow, nnHigh,
    hasBass, phrasePeaks,
  };
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function nnToMidiCtx(nn: number, ctx: MelodyGenContext): number {
  return nnToMidi(nn, ctx.scale, ctx.baseOctave, ctx.keySignature);
}

function isInRange(nn: number, ctx: MelodyGenContext): boolean {
  return nn >= ctx.nnLow && nn <= ctx.nnHigh;
}

function clampNN(nn: number, ctx: MelodyGenContext): number {
  return Math.max(ctx.nnLow, Math.min(ctx.nnHigh, nn));
}

// ────────────────────────────────────────────────────────────────
// Consonance checks
// ────────────────────────────────────────────────────────────────

function pitchClassInterval(trebleMidi: number, bassMidi: number): number {
  return ((trebleMidi - bassMidi) % 12 + 12) % 12;
}

function isConsonant(trebleMidi: number, bassMidi: number): boolean {
  const pc = pitchClassInterval(trebleMidi, bassMidi);
  return !DISSONANT_PC.has(pc);
}

function isImperfectConsonant(trebleMidi: number, bassMidi: number): boolean {
  const pc = pitchClassInterval(trebleMidi, bassMidi);
  return IMPERFECT_CONSONANT_PC.has(pc);
}

// ────────────────────────────────────────────────────────────────
// Bass analysis: build sounding MIDI map per bar
// ────────────────────────────────────────────────────────────────

/**
 * For each bar, builds a map: 16th-note position -> sounding bass MIDI.
 * This accounts for sustained notes spanning multiple 16th positions.
 */
function buildBassSoundingMap(
  bassNotes: ScoreNote[],
  barCount: number,
  sixteenthsPerBar: number,
  keySignature: string,
): Map<number, number>[] {
  const maps: Map<number, number>[] = [];
  let noteIdx = 0;

  for (let bar = 0; bar < barCount; bar++) {
    const map = new Map<number, number>();
    let pos = 0;

    while (pos < sixteenthsPerBar && noteIdx < bassNotes.length) {
      const bn = bassNotes[noteIdx];
      const dur = durationToSixteenths(bn.duration);
      const midi = bn.pitch !== 'rest' ? noteToMidiWithKey(bn, keySignature) : -1;

      // Fill all 16th positions this note occupies within the current bar
      const endPos = Math.min(pos + dur, sixteenthsPerBar);
      for (let p = pos; p < endPos; p++) {
        if (midi >= 0) map.set(p, midi);
      }

      pos += dur;
      noteIdx++;

      // If we've filled the bar, move to next
      if (pos >= sixteenthsPerBar) break;
    }

    maps.push(map);
  }

  return maps;
}

// ────────────────────────────────────────────────────────────────
// Rhythm helpers (1성부 scoreGenerator와 동일한 박·셋잇단 조건)
// ────────────────────────────────────────────────────────────────

/** 16분음표 단위 박 길이 — generateScore treble와 동일 */
function trebleBeatSizeSixteenths(timeSig: string): number {
  const [topStr, botStr] = timeSig.split('/');
  const top = parseInt(topStr, 10);
  const bot = parseInt(botStr, 10);
  if (bot === 8 && top % 3 === 0 && top >= 6) return 6;
  if (bot === 8 && (top === 5 || top === 7)) return Math.ceil(top / 2) * 2;
  if (bot === 4 && (top === 5 || top === 7)) return Math.ceil(top / 2) * 4;
  if (bot === 8) return 4;
  return 16 / (bot || 4);
}

function lastNonRestMelody(notes: ScoreNote[]): ScoreNote | null {
  for (let k = notes.length - 1; k >= 0; k--) {
    if (notes[k].pitch !== 'rest') return notes[k];
  }
  return null;
}

function samePitchHeightForTie(
  a: ScoreNote,
  pitch: PitchName,
  octave: number,
  accidental: Accidental,
): boolean {
  return a.pitch === pitch && a.octave === octave && (a.accidental || '') === (accidental || '');
}

// ────────────────────────────────────────────────────────────────
// Pitch selection
// ────────────────────────────────────────────────────────────────

/**
 * Find consonant pitch candidates for a strong beat.
 * Prefers imperfect consonance (3rd, 6th), falls back to perfect consonance.
 */
function selectConsonantPitch(
  bassMidi: number,
  prevNN: number,
  chordDegree: number,
  ctx: MelodyGenContext,
): number {
  const tones = CHORD_TONES[((chordDegree % 7) + 7) % 7] || [0, 2, 4];

  // Build candidate NNs from chord tones in multiple octaves
  const candidates: { nn: number; midi: number; score: number }[] = [];

  for (const tone of tones) {
    // Check several octave transpositions
    for (let octOff = -2; octOff <= 2; octOff++) {
      const nn = tone + octOff * 7;
      if (!isInRange(nn, ctx)) continue;
      const midi = nnToMidiCtx(nn, ctx);
      if (midi <= bassMidi) continue; // treble must be above bass

      const imperfect = isImperfectConsonant(midi, bassMidi);
      const consonant = isConsonant(midi, bassMidi);
      if (!consonant) continue;

      // Scoring: prefer imperfect consonance, closer to previous pitch, in middle range
      const stepDist = Math.abs(nn - prevNN);
      let score = 0;
      score += imperfect ? 20 : 5;                          // prefer imperfect consonance
      score -= stepDist * 2;                                 // prefer proximity to prev
      score -= Math.abs(nn) * 0.5;                           // prefer central range

      candidates.push({ nn, midi, score });
    }
  }

  if (candidates.length === 0) {
    // Fallback: try all scale degrees
    for (let nn = ctx.nnLow; nn <= ctx.nnHigh; nn++) {
      const midi = nnToMidiCtx(nn, ctx);
      if (midi <= bassMidi) continue;
      if (isConsonant(midi, bassMidi)) {
        candidates.push({ nn, midi, score: -Math.abs(nn - prevNN) });
      }
    }
  }

  if (candidates.length === 0) {
    // Last resort: try shifting prevNN ±1~4 to find consonance
    for (const shift of [1, -1, 2, -2, 3, -3, 4, -4]) {
      const cnn = prevNN + shift;
      if (!isInRange(cnn, ctx)) continue;
      const cMidi = nnToMidiCtx(cnn, ctx);
      if (cMidi <= bassMidi) continue;
      if (isConsonant(cMidi, bassMidi)) {
        candidates.push({ nn: cnn, midi: cMidi, score: -Math.abs(shift) });
        break;
      }
    }
    if (candidates.length === 0) return prevNN;
  }

  // Sort by score descending, pick from top candidates with some randomness
  candidates.sort((a, b) => b.score - a.score);
  const topN = Math.min(3, candidates.length);
  return candidates[Math.floor(Math.random() * topN)].nn;
}

/**
 * 1성부 약박 화음톤 스냅과 유사: 현재 nn을 마디 화음(근·3·5) 중 가까운 음으로.
 */
function snapNnTowardChordTones(
  nn: number,
  prevNN: number,
  chordDegree: number,
  ctx: MelodyGenContext,
): number {
  const tones = CHORD_TONES[((chordDegree % 7) + 7) % 7] || [0, 2, 4];
  let best = nn;
  let bestAdj = Infinity;
  const block = Math.floor(nn / 7);
  for (const t of tones) {
    for (const base of [block * 7 + t, (block - 1) * 7 + t, (block + 1) * 7 + t]) {
      if (!isInRange(base, ctx)) continue;
      const d = Math.abs(base - nn);
      const repeats = base === prevNN ? 4.5 : 0;
      const interval = nn - prevNN;
      const stepTo = base - nn;
      const goesBack = interval !== 0 && Math.sign(stepTo) !== Math.sign(interval) ? 2 : 0;
      const adj = d + repeats + goesBack;
      if (adj < bestAdj) {
        bestAdj = adj;
        best = base;
      }
    }
  }
  return clampNN(best, ctx);
}

/**
 * 약박: scoreGenerator와 같이 stepwiseProb·min(maxLeap,maxInterval) 도약 후 약박 화음 스냅.
 */
function selectWeakBeatPitch(
  bassMidi: number,
  prevNN: number,
  ctx: MelodyGenContext,
  stepwiseCount: number,
  totalCount: number,
  chordDegree: number,
): number {
  const currentRatio = totalCount > 0 ? stepwiseCount / totalCount : 1;
  const needMoreSteps = currentRatio < ctx.constraints.stepwiseRatio;
  const shouldStep = needMoreSteps || Math.random() < ctx.constraints.stepwiseRatio;

  let nn: number;

  if (shouldStep) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    nn = prevNN + dir;
    if (!isInRange(nn, ctx)) nn = prevNN - dir;
    if (!isInRange(nn, ctx)) nn = prevNN;
  } else {
    const cap = Math.min(ctx.constraints.maxLeap, ctx.constraints.maxInterval);
    const leapOptions: number[] = [];
    for (let l = 2; l <= cap; l++) {
      leapOptions.push(l, -l);
    }
    if (leapOptions.length > 0) {
      nn = prevNN + leapOptions[Math.floor(Math.random() * leapOptions.length)];
    } else {
      nn = prevNN + (Math.random() < 0.5 ? 1 : -1);
    }
    nn = clampNN(nn, ctx);
    const semiDist = Math.abs(nnToMidiCtx(nn, ctx) - nnToMidiCtx(prevNN, ctx));
    const nnDist = Math.abs(nn - prevNN);
    if (isForbiddenMelodicInterval(semiDist, nnDist)) {
      nn = prevNN + (nn > prevNN ? -1 : 1);
      nn = clampNN(nn, ctx);
    }
  }

  const rangeSpan = ctx.nnHigh - ctx.nnLow;
  const rangeFactor = rangeSpan <= 8 ? 0.6 : 1.0;
  const snapChance = ctx.constraints.chordSnapWeak * rangeFactor;
  if (Math.random() < snapChance) {
    nn = snapNnTowardChordTones(nn, prevNN, chordDegree, ctx);
  }

  return nn;
}

// ────────────────────────────────────────────────────────────────
// 1-voice pitch selection (no bass constraint)
// ────────────────────────────────────────────────────────────────

/**
 * 1성부 모드: 베이스 없이 순수 interval 기반 음 선택.
 * scoreGenerator.ts의 인라인 로직을 함수로 추출.
 */
function selectPitchWithoutBass(
  prevNN: number,
  ctx: MelodyGenContext,
  prevDir: number,
  prevInterval: number,
  consecutiveSameDir: number,
  chordDegree: number,
  barPos: number,
  beatSize: number,
): number {
  let interval: number;

  // 음역 경계 우선
  if (prevNN >= ctx.nnHigh) {
    interval = rand([-1, -2]);
  } else if (prevNN <= ctx.nnLow) {
    interval = rand([1, 2]);
  } else if (Math.abs(prevInterval) >= 3) {
    // 도약 후 반대방향 순차진행
    if (ctx.level >= 7) {
      interval = prevDir > 0 ? rand([-1, -2]) : rand([1, 2]);
    } else {
      interval = prevDir > 0 ? -1 : 1;
    }
  } else if (consecutiveSameDir >= 3 && prevDir !== 0) {
    // 윤곽 다양성: 같은 방향 3회 연속 후 반대 방향 강제
    interval = prevDir > 0 ? rand([-1, -2]) : rand([1, 2]);
  } else if (Math.random() < ctx.constraints.stepwiseRatio) {
    interval = rand([1, -1]);
  } else {
    const maxLeap = ctx.constraints.maxLeap;
    const leapOptions: number[] = [];
    for (let l = 2; l <= Math.min(maxLeap, ctx.constraints.maxInterval); l++) {
      leapOptions.push(l, -l);
    }
    interval = leapOptions.length > 0 ? rand(leapOptions) : rand([1, -1]);
  }

  let nn = prevNN + interval;
  nn = clampNN(nn, ctx);

  // 화음톤 스냅
  const isDownbeat = barPos % beatSize === 0;
  const rangeFactor = (ctx.nnHigh - ctx.nnLow) <= 8 ? 0.6 : 1.0;
  const oddMeterFactor = /^[57]\/8$/.test(ctx.timeSig) ? 0.55 : 1.0;
  const snapChance = (isDownbeat
    ? ctx.constraints.chordSnapStrong
    : ctx.constraints.chordSnapWeak) * rangeFactor;
  if (Math.random() < snapChance) {
    nn = snapNnTowardChordTones(nn, prevNN, chordDegree, ctx);
    nn = clampNN(nn, ctx);
  }

  return nn;
}


// ────────────────────────────────────────────────────────────────
// 1-voice tendency resolution (lvl 4+)
// ────────────────────────────────────────────────────────────────

function applyTendencyResolution(
  nn: number, prevNn: number, isCadenceContext: boolean,
): number {
  const prevDeg = ((prevNn % 7) + 7) % 7;
  if (prevDeg === 6) {
    const target = prevNn + 1;
    if (isCadenceContext || Math.random() < 0.85) return target;
  }
  if (prevDeg === 3) {
    if (Math.random() < 0.60) return prevNn - 1;
  }
  return nn;
}

// ────────────────────────────────────────────────────────────────
// 1-voice phrase peak enforcement (lvl 4+)
// ────────────────────────────────────────────────────────────────

function enforcePeakNote(
  nn: number, bar: number, barPos: number,
  peak: { bar: number; peakNn: number },
): number {
  const atPeak = bar === peak.bar && barPos === 0;
  if (atPeak) {
    return Math.max(nn, peak.peakNn);
  }
  if (nn >= peak.peakNn) {
    return peak.peakNn - 1 - Math.floor(Math.random() * 2);
  }
  return nn;
}

// ────────────────────────────────────────────────────────────────
// 1-voice triad chain validation (lvl 7+)
// ────────────────────────────────────────────────────────────────

function isTriadSubset(degrees: number[]): boolean {
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

function checkConsecutiveLeapTriad(
  nn: number, prevNn: number, interval: number,
  leapNotes: number[],
): { nn: number; isTriadChain: boolean; leapNotes: number[] } {
  const isLeap = Math.abs(interval) >= 2;
  if (!isLeap) {
    return { nn, isTriadChain: false, leapNotes: [nn] };
  }
  const newLeap = leapNotes.length === 0 ? [prevNn, nn] : [...leapNotes, nn];
  if (newLeap.length >= 3) {
    if (isTriadSubset(newLeap)) {
      return { nn, isTriadChain: true, leapNotes: newLeap };
    }
    const step = interval > 0 ? 1 : -1;
    return { nn: prevNn + step, isTriadChain: false, leapNotes: [prevNn + step] };
  }
  return { nn, isTriadChain: false, leapNotes: newLeap };
}

// ────────────────────────────────────────────────────────────────
// Harmonic minor special handling
// ────────────────────────────────────────────────────────────────

/**
 * Check if moving from nnFrom to nnTo creates an augmented 2nd
 * (scale degree 5 -> 6 or 6 -> 5 in harmonic minor).
 */
function isAugmentedSecondMelody(nnFrom: number, nnTo: number): boolean {
  const degFrom = ((nnFrom % 7) + 7) % 7;
  const degTo = ((nnTo % 7) + 7) % 7;
  if (degFrom === 5 && degTo === 6 && nnTo > nnFrom) return true;
  if (degFrom === 6 && degTo === 5 && nnTo < nnFrom) return true;
  return false;
}

/**
 * In harmonic minor, raised 7th (#7) should resolve to tonic.
 * Returns true if the nn is scale degree 6 (0-indexed = the 7th degree).
 */
function isRaisedSeventh(nn: number): boolean {
  return ((nn % 7) + 7) % 7 === 6;
}

// ────────────────────────────────────────────────────────────────
// NoteNum -> ScoreNote conversion
// ────────────────────────────────────────────────────────────────

function nnToScoreNote(
  nn: number,
  dur: NoteDuration,
  ctx: MelodyGenContext,
  accidental: Accidental = '',
  tie: boolean = false,
): ScoreNote {
  const { pitch, octave } = noteNumToNote(nn, ctx.scale, ctx.baseOctave);

  // Determine accidental from key signature
  let acc = accidental;
  if (!acc) {
    const keySigAlt = getKeySigAlteration(ctx.keySignature, pitch);
    // For harmonic minor raised 7th, we may need explicit accidental
    if (ctx.mode === 'harmonic_minor' && isRaisedSeventh(nn)) {
      // The raised 7th needs a sharp/natural depending on the key
      // The scale already encodes this in the key signature handling
      // but we might need an explicit accidental if the key sig doesn't include it
      acc = '' as Accidental; // let the engraving engine handle via key sig
    }
  }

  return makeNote(pitch, octave, dur, acc, tie);
}

// ────────────────────────────────────────────────────────────────
// Post-processing: gap-fill, consecutive same pitch, etc.
// ────────────────────────────────────────────────────────────────

/**
 * Apply gap-fill rule: after a leap of 4th or larger,
 * the next note should move by step in the opposite direction.
 */
function applyGapFill(
  melodyNNs: number[],
  ctx: MelodyGenContext,
): void {
  for (let i = 1; i < melodyNNs.length - 1; i++) {
    const prev = melodyNNs[i - 1];
    const curr = melodyNNs[i];
    const leapSize = Math.abs(curr - prev);

    if (leapSize >= 3) { // 4th or larger (3 scale degrees = 4th)
      const leapDir = curr > prev ? 1 : -1;
      const next = melodyNNs[i + 1];
      const nextDir = next > curr ? 1 : -1;

      // If next continues in same direction as leap, correct it
      if (nextDir === leapDir && Math.abs(next - curr) > 1) {
        const corrected = curr - leapDir; // step in opposite direction
        if (isInRange(corrected, ctx)) {
          melodyNNs[i + 1] = corrected;
        }
      }
    }
  }
}

/**
 * Ensure no more than 2 consecutive same pitches.
 */
function limitConsecutiveSame(melodyNNs: number[], ctx: MelodyGenContext): void {
  for (let i = 2; i < melodyNNs.length; i++) {
    if (melodyNNs[i] === melodyNNs[i - 1] && melodyNNs[i] === melodyNNs[i - 2]) {
      // Move by step
      const dir = Math.random() < 0.5 ? 1 : -1;
      const nn = melodyNNs[i] + dir;
      melodyNNs[i] = isInRange(nn, ctx) ? nn : melodyNNs[i] - dir;
    }
  }
}

/**
 * In harmonic minor, ensure raised 7th (#7) resolves to tonic.
 */
function resolveLeadingTones(melodyNNs: number[], ctx: MelodyGenContext): void {
  if (ctx.mode !== 'harmonic_minor') return;
  for (let i = 0; i < melodyNNs.length - 1; i++) {
    if (isRaisedSeventh(melodyNNs[i])) {
      const nextDeg = ((melodyNNs[i + 1] % 7) + 7) % 7;
      if (nextDeg !== 0) {
        // Force resolution to tonic (one step up)
        const octBlock = Math.floor(melodyNNs[i] / 7);
        melodyNNs[i + 1] = (octBlock + 1) * 7; // tonic
        if (!isInRange(melodyNNs[i + 1], ctx)) {
          melodyNNs[i + 1] = octBlock * 7; // tonic below
        }
      }
    }
  }
}

/**
 * Avoid augmented 2nd in harmonic minor (degree 5 -> 6).
 */
function avoidAugmentedSeconds(melodyNNs: number[], ctx: MelodyGenContext): void {
  if (ctx.mode !== 'harmonic_minor') return;
  for (let i = 0; i < melodyNNs.length - 1; i++) {
    if (isAugmentedSecondMelody(melodyNNs[i], melodyNNs[i + 1])) {
      // Skip over the problematic interval: use degree 4 or 0 instead
      const curr = melodyNNs[i];
      const currDeg = ((curr % 7) + 7) % 7;
      if (currDeg === 5) {
        // Going up from degree 5 to 6 is aug2nd; go to degree 4 instead (step down)
        melodyNNs[i + 1] = curr - 1;
      } else if (currDeg === 6) {
        // Going down from degree 6 to 5; go to degree 0 (tonic) instead
        const octBlock = Math.floor(curr / 7);
        melodyNNs[i + 1] = (octBlock + 1) * 7;
      }
      if (!isInRange(melodyNNs[i + 1], ctx)) {
        melodyNNs[i + 1] = clampNN(melodyNNs[i + 1], ctx);
      }
    }
  }
}

/**
 * Validate forbidden melodic intervals and fix them.
 */
function fixForbiddenIntervals(melodyNNs: number[], ctx: MelodyGenContext): void {
  for (let i = 0; i < melodyNNs.length - 1; i++) {
    const nn1 = melodyNNs[i];
    const nn2 = melodyNNs[i + 1];
    const semiDist = Math.abs(nnToMidiCtx(nn1, ctx) - nnToMidiCtx(nn2, ctx));
    const nnDist = Math.abs(nn1 - nn2);

    if (isForbiddenMelodicInterval(semiDist, nnDist)) {
      // Adjust by moving the second note one step closer
      const dir = nn2 > nn1 ? -1 : 1;
      melodyNNs[i + 1] = nn2 + dir;
      if (!isInRange(melodyNNs[i + 1], ctx)) {
        melodyNNs[i + 1] = clampNN(melodyNNs[i + 1], ctx);
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Main generation function
// ────────────────────────────────────────────────────────────────

interface BarRhythmCell {
  dur16: number;
  /** 한 리듬 칸: 단일 음 또는 셋잇단 3음 */
  nns: number[];
}

/** @deprecated Use generateMelody instead */
export const generateTwoVoiceMelody = generateMelody;

export function generateMelody(opts: MelodyGeneratorOptions): ScoreNote[] {
  const ctx = buildContext(opts);
  const { timeSig, measures, melodyLevel, progression } = opts;
  const bassNotes = opts.bassNotes ?? [];

  const sixteenthsPerBar = getSixteenthsPerBar(timeSig);
  const barCount = measures - 1; // exclude cadence bar
  const strong16 = strongBeatOffsetsSixteenths0(timeSig);

  const bassMaps = ctx.hasBass
    ? buildBassSoundingMap(bassNotes, barCount, sixteenthsPerBar, ctx.keySignature)
    : null;

  const allNotes: ScoreNote[] = [];

  const pool = getDurationPoolForMelodyLevel(melodyLevel);
  const rhythmParams = getTrebleRhythmParamsForMelodyLevel(melodyLevel);
  let tripletBudget = rhythmParams.tripletBudget[0] +
    Math.floor(
      Math.random() * (rhythmParams.tripletBudget[1] - rhythmParams.tripletBudget[0] + 1),
    );
  let lastTrebleDur: number | undefined;
  const beatSize = trebleBeatSizeSixteenths(timeSig);
  const tieProbEff = rhythmParams.tieProb * (/^[57]\/8$/.test(timeSig) ? 0.5 : 1.0);
  const oddMeterFactor = /^[57]\/8$/.test(timeSig) ? 0.55 : 1.0;

  let prevNN = 0;
  let stepwiseCount = 0;
  let totalMoves = 0;
  let isFirstNote = true;

  // ── 1성부 전용 상태 ──
  let prevDir = 0;
  let prevInterval = 0;
  let consecutiveSameDir = 0;
  let prevFinalNn = -1;
  let consecutiveSame = 0;
  let consecutiveLeapNotes: number[] = [];

  const PHRASE_LEN = 4;

  for (let bar = 0; bar < barCount; bar++) {
    const bassMap = bassMaps ? (bassMaps[bar] || new Map<number, number>()) : new Map<number, number>();
    const bassStartMidi = ctx.hasBass
      ? (() => {
          const a = bassMap.get(0);
          if (a !== undefined) return a;
          for (const v of bassMap.values()) return v;
          return 48;
        })()
      : 0;
    const chordDegree = ctx.hasBass
      ? inferChordDegreeFromBassMidi(bassStartMidi, ctx.scale, ctx.keySignature, progression[bar] ?? 0)
      : ((progression[bar] ?? 0) % 7 + 7) % 7;

    // 중급3(lvl6) 이상: 마디당 최대 음표 수 제한으로 과밀 방지
    // 4/4(16) → 7개, 3/4(12) → 5개, 6/8(12) → 5개, 비례 계산
    const maxNotesForBar = melodyLevel >= 6
      ? Math.max(4, Math.floor(sixteenthsPerBar * 0.44))
      : undefined;
    const rhythm = fillRhythm(sixteenthsPerBar, pool, {
      timeSignature: timeSig,
      lastDur: lastTrebleDur,
      syncopationProb: rhythmParams.syncopationProb,
      dottedProb: rhythmParams.dottedProb,
      allowTies: melodyLevel >= 5,
      maxNotes: maxNotesForBar,
    });
    if (rhythm.length > 0) {
      lastTrebleDur = rhythm[rhythm.length - 1];
    }

    const barCells: BarRhythmCell[] = [];
    let barPos = 0;

    for (let i = 0; i < rhythm.length; i++) {
      const dur = rhythm[i];
      const bassMidi = ctx.hasBass ? (bassMap.get(barPos) ?? bassMap.get(0) ?? 48) : 0;
      const isStrongBeat = strong16.has(barPos);

      let nn: number;

      if (isFirstNote) {
        // 시작: 으뜸3화음 위주
        const startCandidates = [0, 2, 4, 5, 7].filter(n => n >= ctx.nnLow && n <= ctx.nnHigh);
        nn = startCandidates.length > 0 ? rand(startCandidates) : 0;
        if (ctx.hasBass && !isConsonant(nnToMidiCtx(nn, ctx), bassMidi)) {
          nn = selectConsonantPitch(bassMidi, 0, chordDegree, ctx);
        }
      } else if (bar === barCount - 1 && i === rhythm.length - 1) {
        // 마지막 음: approach note
        const approachCandidates = [1, -1, 6];
        let bestApproach = 1;
        let bestDist = Infinity;
        for (const c of approachCandidates) {
          for (let octOff = -1; octOff <= 1; octOff++) {
            const cnn = c + octOff * 7;
            if (!isInRange(cnn, ctx)) continue;
            if (ctx.hasBass && !isConsonant(nnToMidiCtx(cnn, ctx), bassMidi)) continue;
            const dist = Math.abs(cnn - prevNN);
            if (dist < bestDist) {
              bestDist = dist;
              bestApproach = cnn;
            }
          }
        }
        nn = bestApproach;
      } else if (ctx.hasBass) {
        // ── 2성부 모드: 베이스 협화 기반 ──
        if (isStrongBeat) {
          nn = selectConsonantPitch(bassMidi, prevNN, chordDegree, ctx);
          const oddWeak = timeSig === '9/8' || timeSig === '12/8' ? 0.92 : 1;
          if (Math.random() < ctx.constraints.chordSnapStrong * 0.35 * oddWeak) {
            nn = snapNnTowardChordTones(nn, prevNN, chordDegree, ctx);
            if (!isConsonant(nnToMidiCtx(nn, ctx), bassMidi)) {
              nn = selectConsonantPitch(bassMidi, prevNN, chordDegree, ctx);
            }
          }
        } else {
          nn = selectWeakBeatPitch(bassMidi, prevNN, ctx, stepwiseCount, totalMoves, chordDegree);
        }
      } else {
        // ── 1성부 모드: interval 기반 ──
        nn = selectPitchWithoutBass(prevNN, ctx, prevDir, prevInterval, consecutiveSameDir, chordDegree, barPos, beatSize);

        // 금지 음정 보정
        const semiDist = Math.abs(nnToMidiCtx(nn, ctx) - nnToMidiCtx(prevNN, ctx));
        const nnDist = Math.abs(nn - prevNN);
        if (isForbiddenMelodicInterval(semiDist, nnDist)) {
          const dir = nn > prevNN ? 1 : -1;
          nn = prevNN + dir;
          nn = clampNN(nn, ctx);
        }

        // 트라이어드 체인 검증 (lvl 7+)
        if (ctx.level >= 7) {
          const leapResult = checkConsecutiveLeapTriad(nn, prevNN, nn - prevNN, consecutiveLeapNotes);
          nn = leapResult.nn;
          consecutiveLeapNotes = leapResult.leapNotes;
        } else {
          if (Math.abs(nn - prevNN) >= 2) {
            if (consecutiveLeapNotes.length === 0) consecutiveLeapNotes = [prevNN, nn];
            else consecutiveLeapNotes.push(nn);
          } else {
            consecutiveLeapNotes = [nn];
          }
        }

        // 경향음 해결 (lvl 4+)
        if (ctx.level >= 4) {
          const isCadence = bar === barCount - 2 && i >= rhythm.length - 2;
          nn = applyTendencyResolution(nn, prevNN, isCadence);
          nn = clampNN(nn, ctx);
        }
      }

      if (!isFirstNote) {
        totalMoves++;
        if (Math.abs(nn - prevNN) <= 1) stepwiseCount++;
      } else {
        isFirstNote = false;
      }

      // maxLeap 제한
      let leapSize = Math.abs(nn - prevNN);
      if (leapSize > ctx.constraints.maxLeap) {
        const dir = nn > prevNN ? 1 : -1;
        nn = prevNN + dir * ctx.constraints.maxLeap;
        nn = clampNN(nn, ctx);
        if (ctx.hasBass && isStrongBeat && !isConsonant(nnToMidiCtx(nn, ctx), bassMidi)) {
          for (const shift of [1, -1, 2, -2, 3, -3]) {
            const cand = nn + shift;
            if (!isInRange(cand, ctx)) continue;
            if (Math.abs(cand - prevNN) > ctx.constraints.maxLeap + 1) continue;
            if (isConsonant(nnToMidiCtx(cand, ctx), bassMidi)) { nn = cand; break; }
          }
        }
      }

      // ── 정점 강제 (lvl 4+) ──
      if (ctx.phrasePeaks.length > 0 && !isFirstNote) {
        const phraseIdx = Math.min(Math.floor(bar / PHRASE_LEN), ctx.phrasePeaks.length - 1);
        nn = enforcePeakNote(nn, bar, barPos, ctx.phrasePeaks[phraseIdx]);
        nn = clampNN(nn, ctx);
      }

      // ── 연속 반복음 방지 ──
      if (!isFirstNote) {
        if (nn === prevFinalNn) {
          consecutiveSame++;
          if (consecutiveSame >= 1) {
            const nudge = prevDir > 0 ? -1 : 1;
            nn = clampNN(nn + nudge, ctx);
            if (nn === prevFinalNn) {
              nn = clampNN(nn - nudge * 2, ctx);
            }
            consecutiveSame = 0;
          }
        } else {
          consecutiveSame = 0;
        }
        prevFinalNn = nn;

        // 방향 추적
        const newDir = nn > prevNN ? 1 : nn < prevNN ? -1 : 0;
        prevInterval = nn - prevNN;
        if (newDir !== 0 && newDir === prevDir) consecutiveSameDir++;
        else if (newDir !== 0) consecutiveSameDir = 1;
        prevDir = newDir !== 0 ? newDir : prevDir;
        if (nn >= ctx.nnHigh) prevDir = -1;
        if (nn <= ctx.nnLow) prevDir = 1;
      }

      // 셋잇단
      const useTriplet =
        tripletBudget > 0 &&
        dur === 4 &&
        melodyLevel >= 4 &&
        barPos % (beatSize * 2) === 0 &&
        Math.random() < rhythmParams.tripletProb;

      if (useTriplet) {
        const tripNNs = generateTripletNotes(nn, prevNN, ctx);
        barCells.push({ dur16: 4, nns: [...tripNNs] });
        tripletBudget--;
        prevNN = tripNNs[2];
        prevFinalNn = tripNNs[2];
        for (let t = 0; t < 2; t++) {
          totalMoves++;
          if (Math.abs(tripNNs[t + 1] - tripNNs[t]) <= 1) stepwiseCount++;
        }
      } else {
        barCells.push({ dur16: dur, nns: [nn] });
        prevNN = nn;
      }

      barPos += dur;
    }

    // ── 마디별 후처리 ──
    const flatBar = barCells.flatMap(c => c.nns);
    if (flatBar.length > 1) {
      limitConsecutiveSame(flatBar, ctx);
      if (ctx.mode === 'harmonic_minor') {
        avoidAugmentedSeconds(flatBar, ctx);
      }
      fixForbiddenIntervals(flatBar, ctx);
      let w = 0;
      for (const cell of barCells) {
        for (let j = 0; j < cell.nns.length; j++) {
          cell.nns[j] = flatBar[w++];
        }
      }
    }

    // ── ScoreNote 변환 ──
    let cellIdx = 0;
    let emitBarPos = 0;
    for (const cell of barCells) {
      const durLabel = SIXTEENTHS_TO_DUR[cell.dur16] || '4';

      if (cell.nns.length === 3) {
        const spanDur = '4' as NoteDuration;
        const spanSixteenths = durationToSixteenths(spanDur); // 4
        const tnd = getTupletNoteDuration('3', spanDur);       // 2 (written eighth)
        const innerDur = sixteenthsToDuration(tnd);
        const first = nnToScoreNote(cell.nns[0], innerDur, ctx);
        first.tuplet = '3';
        first.tupletSpan = spanDur;
        first.tupletNoteDur = tnd;
        const rem = spanSixteenths - tnd;              // 2
        const perRem = Math.floor(rem / 2);            // 1
        const second = nnToScoreNote(cell.nns[1], innerDur, ctx);
        second.tupletNoteDur = perRem;
        const third = nnToScoreNote(cell.nns[2], innerDur, ctx);
        third.tupletNoteDur = rem - perRem;
        allNotes.push(first);
        allNotes.push(second);
        allNotes.push(third);
      } else {
        const nn = cell.nns[0];
        const { pitch, octave } = noteNumToNote(nn, ctx.scale, ctx.baseOctave);

        // 타이 삽입
        const prevMel = lastNonRestMelody(allNotes);
        if (
          prevMel &&
          samePitchHeightForTie(prevMel, pitch, octave, '' as Accidental) &&
          Math.random() < tieProbEff &&
          cellIdx > 0 &&
          cellIdx < barCells.length - 1 &&
          emitBarPos > 0
        ) {
          prevMel.tie = true;
        }
        allNotes.push(nnToScoreNote(nn, durLabel, ctx));
      }
      emitBarPos += cell.dur16;
      cellIdx++;
    }
  }

  // ── 전체 후처리 ──
  const allPitchedNNs = extractPitchedNNs(allNotes, ctx);
  if (allPitchedNNs.length > 2) {
    applyGapFill(allPitchedNNs, ctx);
    if (ctx.mode === 'harmonic_minor') {
      resolveLeadingTones(allPitchedNNs, ctx);
    }
    fixForbiddenIntervals(allPitchedNNs, ctx);
    writePitchedNNsBack(allNotes, allPitchedNNs, ctx);
  }

  // ── 임시표 삽입 (고급 2단계 이상: 알고리즘 기반) ──
  if (ctx.level >= 8) {
    const bassMapsForAccidentals = bassMaps ?? [];
    applyMelodyAccidentals(
      allNotes, bassMapsForAccidentals, ctx.keySignature, ctx.mode,
      ctx.level, sixteenthsPerBar, strong16,
    );
  }

  return allNotes;
}

// ────────────────────────────────────────────────────────────────
// Triplet helper (Level 9)
// ────────────────────────────────────────────────────────────────

function generateTripletNotes(
  startNN: number,
  prevNN: number,
  ctx: MelodyGenContext,
): [number, number, number] {
  // Generate 3 stepwise notes forming a passing figure
  const dir = Math.random() < 0.5 ? 1 : -1;
  const n1 = startNN;
  let n2 = clampNN(n1 + dir, ctx);
  let n3 = clampNN(n2 + dir, ctx);
  // If we can't move stepwise, oscillate
  if (n2 === n1) {
    n2 = clampNN(n1 - dir, ctx);
    n3 = n1;
  }
  return [n1, n2, n3];
}

// ────────────────────────────────────────────────────────────────
// NN extraction / write-back for global post-processing
// ────────────────────────────────────────────────────────────────

function extractPitchedNNs(notes: ScoreNote[], ctx: MelodyGenContext): number[] {
  const nns: number[] = [];
  for (const n of notes) {
    if (n.pitch !== 'rest') {
      // Reverse-compute nn from pitch+octave
      const rootIdx = PITCH_ORDER.indexOf(ctx.scale[0]);
      const pitchIdx = PITCH_ORDER.indexOf(n.pitch);
      const degIdx = ctx.scale.indexOf(n.pitch);
      if (degIdx < 0) {
        nns.push(0); // fallback
        continue;
      }
      const wrap = pitchIdx < rootIdx ? 1 : 0;
      const octOff = n.octave - ctx.baseOctave - wrap;
      nns.push(octOff * 7 + degIdx);
    }
  }
  return nns;
}

function writePitchedNNsBack(
  notes: ScoreNote[],
  nns: number[],
  ctx: MelodyGenContext,
): void {
  let j = 0;
  for (let i = 0; i < notes.length && j < nns.length; i++) {
    if (notes[i].pitch !== 'rest') {
      const { pitch, octave } = noteNumToNote(nns[j], ctx.scale, ctx.baseOctave);
      notes[i].pitch = pitch;
      notes[i].octave = octave;
      j++;
    }
  }
}
