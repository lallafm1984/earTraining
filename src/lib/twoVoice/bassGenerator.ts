// ────────────────────────────────────────────────────────────────
// Two-Voice Bass Generator — L1/L2/L3 (temp/ear_training_bass_prompt_v4.md)
// ────────────────────────────────────────────────────────────────

import type { BassLevel, BassNote, BassPatternDef, TwoVoiceBassOptions } from './types';
import { getScaleInfo, BASS_DURATION_MAP, MEASURE_TOTAL, BASS_RANGE } from './scales';
import { getPatternById, selectRandomPattern } from './bassPatterns';
import {
  generateProgression,
  CHORD_TONES,
  nnToMidi,
  getMidiInterval,
  getScaleDegrees,
  getBassBaseOctave,
  PitchName,
} from '../scoreUtils';

// ────────────────────────────────────────────────────────────────
// Internal context passed through generation functions
// ────────────────────────────────────────────────────────────────

interface BassGenContext {
  scale: PitchName[];
  baseOctave: number;
  keySignature: string;
}

function buildContext(key: string, mode: 'major' | 'harmonic_minor'): BassGenContext {
  const keySignature = mode === 'harmonic_minor'
    ? (key.endsWith('m') ? key : key + 'm')
    : key;
  const scale = getScaleDegrees(keySignature);
  const baseOctave = getBassBaseOctave(scale);
  return { scale, baseOctave, keySignature };
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function noteNumToMidi(noteNum: number, ctx: BassGenContext): number {
  return nnToMidi(noteNum, ctx.scale, ctx.baseOctave, ctx.keySignature);
}

function getSemitoneInterval(from: number, to: number, ctx: BassGenContext): number {
  return getMidiInterval(from, to, ctx.scale, ctx.baseOctave, ctx.keySignature);
}

function isInRange(noteNum: number, level: BassLevel, ctx: BassGenContext): boolean {
  const midi = noteNumToMidi(noteNum, ctx);
  const range = BASS_RANGE[level];
  return midi >= range.low && midi <= range.high;
}

function clampToRange(noteNum: number, level: BassLevel, ctx: BassGenContext): number {
  if (isInRange(noteNum, level, ctx)) return noteNum;
  // 옥타브 단위 시프트 시도
  for (const shift of [-7, 7, -14, 14]) {
    if (isInRange(noteNum + shift, level, ctx)) return noteNum + shift;
  }
  // 옥타브 시프트 실패 시 가장 가까운 범위 내 nn 탐색
  for (let d = 1; d <= 14; d++) {
    if (isInRange(noteNum - d, level, ctx)) return noteNum - d;
    if (isInRange(noteNum + d, level, ctx)) return noteNum + d;
  }
  return noteNum;
}

function getScaleInterval(from: number, to: number): number {
  return Math.abs(to - from);
}

/**
 * 베이스 선율 도약 규칙: 3도 이내(음계도 차이 1~2)가 기본, 도약 시에는 4도(차이 3)만.
 * 즉 인접 음 nn 차이는 최대 3(5도·옥타브 등 금지).
 */
const MAX_BASS_SCALE_STEP = 3;

/**
 * Forbidden leap for Level 3 (and sanity for all levels).
 * Span cap: MAX_BASS_SCALE_STEP; also 7th/9th+, tritone, aug5 when applicable.
 */
function isForbiddenLeap(fromNN: number, toNN: number, ctx: BassGenContext): boolean {
  const interval = Math.abs(toNN - fromNN);
  if (interval <= 1) return false;
  if (interval > MAX_BASS_SCALE_STEP) return true;

  const semitones = getSemitoneInterval(fromNN, toNN, ctx);
  if (semitones === 6) return true;  // tritone
  if (semitones === 8) return true;  // augmented 5th
  return false;
}

/**
 * Augmented 2nd check (harmonic minor: degree 5 -> degree 6 ascending).
 * Uses scale degree indices directly since nnToMidi uses natural minor
 * and can't detect the raised 7th.
 */
/** 현재 마디 코드 근음(구조도)에 가장 가까운 허용 nn (옥타브 시프트) */
function nearestChordRootNn(rootDeg: number, nearNN: number, ctx: BassGenContext): number {
  let best = rootDeg;
  let bestDist = Infinity;
  for (const off of [-21, -14, -7, 0, 7, 14, 21]) {
    const nn = rootDeg + off;
    if (!isInRange(nn, 2, ctx)) continue;
    const d = Math.abs(nn - nearNN);
    if (d < bestDist) {
      bestDist = d;
      best = nn;
    }
  }
  return clampToRange(best, 2, ctx);
}

function isAugmentedSecond(fromNN: number, toNN: number, _ctx: BassGenContext): boolean {
  const degFrom = ((fromNN % 7) + 7) % 7;
  const degTo = ((toNN % 7) + 7) % 7;
  // Ascending: degree 5 -> degree 6 (6th -> raised 7th in harmonic minor)
  if (degFrom === 5 && degTo === 6 && toNN > fromNN) return true;
  // Descending: degree 6 -> degree 5 (raised 7th -> 6th)
  if (degFrom === 6 && degTo === 5 && toNN < fromNN) return true;
  return false;
}

/**
 * 증2도 회피: 같은 방향으로 2도 건너뛰거나, 반대 방향으로 1도 이동.
 * prevNN에 머무는(같은음 반복) 대신 항상 이동을 보장한다.
 */
function resolveAugSecond(
  prevNN: number, currentNN: number, level: BassLevel, ctx: BassGenContext,
): number {
  const dir = currentNN > prevNN ? 1 : -1;
  // Option 1: 같은 방향 2도 건너뛰기 (예: deg5→deg0′, deg6→deg4)
  const skipNN = prevNN + dir * 2;
  if (isInRange(skipNN, level, ctx) && !isAugmentedSecond(prevNN, skipNN, ctx)) {
    return skipNN;
  }
  // Option 2: 반대 방향 1도
  const revNN = prevNN - dir;
  if (isInRange(revNN, level, ctx)) {
    return revNN;
  }
  // Option 3: 같은 방향 3도 (4도 도약)
  const skip3 = prevNN + dir * 3;
  if (isInRange(skip3, level, ctx) && !isForbiddenLeap(prevNN, skip3, ctx)) {
    return skip3;
  }
  return prevNN;
}

// ────────────────────────────────────────────────────────────────
// Half cadence helpers (반종지)
// ────────────────────────────────────────────────────────────────

/** 반종지 마디 인덱스: 4마디 프레이즈 경계마다 V (마지막 마디 제외) */
function getHalfCadenceBars(measures: number): number[] {
  if (measures < 8) return [];
  const bars: number[] = [];
  for (let i = 3; i < measures - 1; i += 4) {
    bars.push(i);
  }
  return bars;
}

/** 가장 가까운 딸림음(V, 음계도 4) 찾기 */
function nearestDominant(from: number, level: BassLevel, ctx: BassGenContext): number {
  const candidates = [-10, -3, 4, 11, 18];
  let best = 4;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (isInRange(c, level, ctx)) {
      const d = Math.abs(from - c);
      if (d < bestDist) { bestDist = d; best = c; }
    }
  }
  return best;
}

// ────────────────────────────────────────────────────────────────
// Harmonic structure generation
// ────────────────────────────────────────────────────────────────

function generateBassStructure(measures: 4 | 8 | 12 | 16, isMinor: boolean): number[] {
  return generateProgression(measures, isMinor);
}

/** I / IV / V 근음 (0 / 3 / 4) — ear_training_bass_prompt_v4.md L1 “60% 이상” */
function isPrimaryBassRootDegree(noteNum: number): boolean {
  const d = ((noteNum % 7) + 7) % 7;
  return d === 0 || d === 3 || d === 4;
}

/**
 * Adjust interior bars so at least 60% of measures use I/IV/V roots,
 * without breaking L1 max-leap (5th) between adjacent bars.
 */
/**
 * 인접 마디 |Δ|≤3. `upTo` = 마지막으로 수정할 인덱스(포함).
 */
function fixL1AdjacentSpansUpTo(
  notes: BassNote[],
  ctx: BassGenContext,
  upTo: number,
): void {
  const maxPass = notes.length + 2;
  for (let pass = 0; pass < maxPass; pass++) {
    let changed = false;
    for (let i = 1; i <= upTo && i < notes.length; i++) {
      const prev = notes[i - 1].noteNum;
      let nn = notes[i].noteNum;
      if (getScaleInterval(prev, nn) <= MAX_BASS_SCALE_STEP) continue;
      const sign = nn > prev ? 1 : -1;
      let best = prev + sign * MAX_BASS_SCALE_STEP;
      if (!isInRange(best, 1, ctx)) best = prev - sign * MAX_BASS_SCALE_STEP;
      if (!isInRange(best, 1, ctx)) best = clampToRange(nn, 1, ctx);
      notes[i].noteNum = best;
      changed = true;
    }
    if (!changed) break;
  }
}

/**
 * 마지막 마디 으뜸음과 직전 마디 사이 |Δ|≤3 이 되도록 직전 근음을 조정.
 * (항상 noteNum=0만 쓰면 이전 마디가 높은 옥타브일 때 5도 이상 벌어질 수 있음)
 */
function fixL1CadenceLeap(
  notes: BassNote[],
  ctx: BassGenContext,
): void {
  if (notes.length < 2) return;
  const li = notes.length - 1;
  const pi = li - 1;
  const prevBeforePen = pi > 0 ? notes[pi - 1].noteNum : notes[pi].noteNum;

  const tonicCandidates: number[] = [];
  for (let k = -4; k <= 4; k++) {
    const t = k * 7;
    if (!isInRange(t, 1, ctx)) continue;
    if (((t % 7) + 7) % 7 !== 0) continue;
    tonicCandidates.push(t);
  }
  tonicCandidates.sort((a, b) => Math.abs(a) - Math.abs(b));

  for (const t of tonicCandidates) {
    for (let s = 1; s <= MAX_BASS_SCALE_STEP; s++) {
      for (const sg of [-1, 1] as const) {
        const newPen = t - sg * s;
        if (Math.abs(t - newPen) > MAX_BASS_SCALE_STEP) continue;
        if (!isInRange(newPen, 1, ctx)) continue;
        if (pi > 0 && getScaleInterval(prevBeforePen, newPen) > MAX_BASS_SCALE_STEP) continue;
        notes[pi].noteNum = newPen;
        notes[li].noteNum = t;
        return;
      }
    }
  }
}

function enforceBassL1PrimaryRootShare(
  notes: BassNote[],
  measures: number,
  mode: 'major' | 'harmonic_minor',
  ctx: BassGenContext,
): void {
  const countPrimary = () => notes.filter(n => isPrimaryBassRootDegree(n.noteNum)).length;
  let primary = countPrimary();
  const target = Math.ceil(0.6 * measures);
  if (primary >= target) return;

  const adjustable: number[] = [];
  for (let m = 0; m < measures; m++) {
    if (m === 0 || m === measures - 1) continue;
    if (mode === 'harmonic_minor' && m === measures - 2) continue;
    if (!isPrimaryBassRootDegree(notes[m].noteNum)) adjustable.push(m);
  }
  for (let i = adjustable.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [adjustable[i], adjustable[j]] = [adjustable[j], adjustable[i]];
  }

  const degs = [0, 3, 4];
  for (const m of adjustable) {
    if (primary >= target) break;
    const prev = notes[m - 1].noteNum;
    const next = notes[m + 1].noteNum;
    const order = [...degs].sort(() => Math.random() - 0.5);
    for (const deg of order) {
      let nn = deg;
      nn = clampToRange(nn, 1, ctx);
      if (getScaleInterval(prev, nn) > MAX_BASS_SCALE_STEP) continue;
      if (getScaleInterval(nn, next) > MAX_BASS_SCALE_STEP) continue;
      notes[m] = { ...notes[m], noteNum: nn };
      primary++;
      break;
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Level 1: One note per bar (sustained)
// ────────────────────────────────────────────────────────────────

function generateBassLevel1(opts: TwoVoiceBassOptions, structure: number[], ctx: BassGenContext): BassNote[] {
  const { timeSig, measures, mode } = opts;
  const duration = BASS_DURATION_MAP[timeSig].level1;
  const notes: BassNote[] = [];

  for (let m = 0; m < measures; m++) {
    let noteNum: number;

    if (m === 0 || m === measures - 1) {
      noteNum = 0; // tonic
    } else {
      noteNum = structure[m];
      if (mode === 'harmonic_minor' && m === measures - 2) {
        noteNum = 4; // V degree
      }
    }

    noteNum = clampToRange(noteNum, 1, ctx);

    // L1: 인접 마디 nn 차이 ≤ 3 (3도 이내 또는 4도 도약 한 번)
    if (notes.length > 0) {
      const prev = notes[notes.length - 1].noteNum;
      if (getScaleInterval(prev, noteNum) > MAX_BASS_SCALE_STEP) {
        for (const alt of [noteNum + 7, noteNum - 7]) {
          if (isInRange(alt, 1, ctx) && getScaleInterval(prev, alt) <= MAX_BASS_SCALE_STEP) {
            noteNum = alt;
            break;
          }
        }
      }
    }

    notes.push({ noteNum, duration, measure: m, beatPosition: 0 });
  }

  enforceBassL1PrimaryRootShare(notes, measures, mode, ctx);
  fixL1AdjacentSpansUpTo(notes, ctx, notes.length - 1);
  fixL1CadenceLeap(notes, ctx);
  fixL1AdjacentSpansUpTo(notes, ctx, notes.length - 2);

  return notes;
}

// ────────────────────────────────────────────────────────────────
// Level 2: Stepwise motion only
// ────────────────────────────────────────────────────────────────

function generateBassLevel2(
  opts: TwoVoiceBassOptions,
  structure: number[],
  pattern: BassPatternDef,
  ctx: BassGenContext,
): BassNote[] {
  const { timeSig, measures, mode } = opts;
  const durationInfo = BASS_DURATION_MAP[timeSig];
  const noteDuration = durationInfo.level2;
  const notesPerBar = durationInfo.notesPerBar.level2;
  const measureTotal = MEASURE_TOTAL[timeSig];
  const totalNotes = measures * notesPerBar;

  const notes: BassNote[] = [];
  let currentNN = 0;

  // ── Sweep 방식: 한 방향으로 끝까지 간 뒤 경계에서 반전 ──
  // 초기 방향은 패턴의 첫 non-hold contour에서 결정
  let direction: 1 | -1 = -1; // default: descending
  for (const c of pattern.contour) {
    if (c === 'asc') { direction = 1; break; }
    if (c === 'desc') { direction = -1; break; }
  }

  // 첫 마디 두 번째 음에서 도약할지 결정 (패턴 다양성)
  const useInitialLeap = Math.random() < 0.5;

  // ── 반종지 목표 (8마디 이상: 4마디 프레이즈 경계에서 V) ──
  const halfCadenceNotes = getHalfCadenceBars(measures).map(b => b * notesPerBar);

  // 가장 가까운 으뜸음 찾기
  function nearestTonic(from: number): number {
    const candidates = [0, 7, -7, 14, -14];
    let best = 0;
    let bestDist = Infinity;
    for (const c of candidates) {
      if (isInRange(c, 2, ctx)) {
        const d = Math.abs(from - c);
        if (d < bestDist) { bestDist = d; best = c; }
      }
    }
    return best;
  }

  for (let m = 0; m < measures; m++) {
    for (let n = 0; n < notesPerBar; n++) {
      const beatPos = n * noteDuration;
      const noteIndex = m * notesPerBar + n;
      const isFirst = noteIndex === 0;
      const isLast = noteIndex === totalNotes - 1;
      const notesRemaining = totalNotes - noteIndex - 1;
      let didLeap = false;

      if (isFirst) {
        currentNN = 0;
      } else if (noteIndex === 1 && useInitialLeap) {
        // ── 첫 마디 도약: IV(3·-4) / V(4·-3) 근음으로 점프 ──
        const leapTargets = [3, 4, -3, -4]
          .filter(t => isInRange(t, 2, ctx));
        if (leapTargets.length > 0) {
          currentNN = rand(leapTargets);
          // 도약 후 sweep 방향: 도약 방향과 같은 쪽으로 계속 진행
          direction = currentNN > 0 ? 1 : -1;
          didLeap = true;
        } else {
          // 도약 불가 시 순차 진행
          const nextNN = currentNN + direction;
          currentNN = isInRange(nextNN, 2, ctx) ? nextNN : currentNN - direction;
        }
      } else {
        // ── 프레이즈 목표: 반종지(V) 또는 종지(I) ──
        const targetTonic = nearestTonic(currentNN);
        const nextHCIdx = halfCadenceNotes.find(idx => idx >= noteIndex);
        let phraseTarget: number;
        let notesToTarget: number;

        if (nextHCIdx !== undefined) {
          phraseTarget = nearestDominant(currentNN, 2, ctx);
          notesToTarget = nextHCIdx - noteIndex;
        } else {
          phraseTarget = targetTonic;
          notesToTarget = notesRemaining;
        }

        const distToTarget = Math.abs(currentNN - phraseTarget);
        const dirToTarget = phraseTarget > currentNN ? 1 : phraseTarget < currentNN ? -1 : 0;

        if (isLast) {
          currentNN = targetTonic;
        } else if (notesToTarget === 0) {
          // 반종지 착지: V
          currentNN = phraseTarget;
        } else if (notesToTarget <= distToTarget + 1) {
          // 프레이즈 목표 접근 (+1 여유: 순차 제한으로 인한 도착 지연 방지)
          currentNN = currentNN + (dirToTarget || direction);
        } else {
          // ── 핵심: 현재 방향으로 한 칸 이동, 경계 도달 시 반전 ──
          const nextNN = currentNN + direction;
          if (isInRange(nextNN, 2, ctx)) {
            currentNN = nextNN;
          } else {
            // 경계 도달 → 방향 반전
            direction = -direction as 1 | -1;
            const reversed = currentNN + direction;
            currentNN = isInRange(reversed, 2, ctx) ? reversed : currentNN;
          }
        }
      }

      // 도약한 음은 순차 제한 건너뜀
      if (!didLeap) {
        // Harmonic minor: 증2도(6→#7) 회피
        if (mode === 'harmonic_minor' && notes.length > 0) {
          const prevNN = notes[notes.length - 1].noteNum;
          if (isAugmentedSecond(prevNN, currentNN, ctx)) {
            currentNN = resolveAugSecond(prevNN, currentNN, 2, ctx);
          }
        }

        // 연속 반음 3개 제한
        if (notes.length >= 2) {
          const prev1NN = notes[notes.length - 2].noteNum;
          const prev2NN = notes[notes.length - 1].noteNum;
          const semi1 = getSemitoneInterval(prev1NN, prev2NN, ctx) === 1;
          const semi2 = getSemitoneInterval(prev2NN, currentNN, ctx) === 1;
          if (semi1 && semi2) {
            currentNN = notes[notes.length - 1].noteNum;
          }
        }

        // 순차 보장: 이전 음과의 간격 ≤ 1
        if (notes.length > 0) {
          const prevNN = notes[notes.length - 1].noteNum;
          const interval = Math.abs(currentNN - prevNN);
          if (interval > 1) {
            const dir = currentNN > prevNN ? 1 : -1;
            currentNN = prevNN + dir;
          }
          if (mode === 'harmonic_minor' && isAugmentedSecond(prevNN, currentNN, ctx)) {
            currentNN = resolveAugSecond(prevNN, currentNN, 2, ctx);
          }
        }
      }

      // 마지막 음: 남은 박자 채우기
      if (isLast) {
        const usedDuration = n * noteDuration;
        notes.push({
          noteNum: currentNN,
          duration: measureTotal - usedDuration,
          measure: m,
          beatPosition: beatPos,
        });
        continue;
      }

      notes.push({ noteNum: currentNN, duration: noteDuration, measure: m, beatPosition: beatPos });
    }
  }

  return notes;
}

// ────────────────────────────────────────────────────────────────
// Level 3: Stepwise + leap mixed + occasional 5th (중급)
// ────────────────────────────────────────────────────────────────

/** 5도 도약 허용 최대 음계도 차이 (완전5도 = 4칸) */
const MAX_L3_SCALE_STEP = 4;

function isForbiddenLeapL3(fromNN: number, toNN: number, ctx: BassGenContext): boolean {
  const interval = Math.abs(toNN - fromNN);
  if (interval <= 1) return false;
  if (interval > MAX_L3_SCALE_STEP) return true;
  const semitones = getSemitoneInterval(fromNN, toNN, ctx);
  if (semitones === 6) return true;  // tritone (증4도)
  if (semitones === 8) return true;  // augmented 5th
  return false;
}

/** 최근 음들의 같은 방향 연속 이동 횟수 (방향 무관, 실제 음 기준) */
function countConsecutiveSameDirection(notes: BassNote[]): number {
  if (notes.length < 2) return 0;
  const lastDiff = notes[notes.length - 1].noteNum - notes[notes.length - 2].noteNum;
  if (lastDiff === 0) return 0;
  const lastDir = lastDiff > 0 ? 1 : -1;
  let count = 1;
  for (let i = notes.length - 2; i >= 1; i--) {
    const diff = notes[i].noteNum - notes[i - 1].noteNum;
    if (diff === 0) break;
    const dir = diff > 0 ? 1 : -1;
    if (dir === lastDir) count++;
    else break;
  }
  return count;
}

function generateBassLevel3(
  opts: TwoVoiceBassOptions,
  structure: number[],
  pattern: BassPatternDef,
  ctx: BassGenContext,
): BassNote[] {
  const { timeSig, measures, mode } = opts;
  const durationInfo = BASS_DURATION_MAP[timeSig];
  const noteDuration = durationInfo.level2;
  const notesPerBar = durationInfo.notesPerBar.level3;
  const measureTotal = MEASURE_TOTAL[timeSig];
  const totalNotes = measures * notesPerBar;
  const notes: BassNote[] = [];

  // ── 초기 음 선택: 범위 중심 근처의 으뜸음 옥타브 ──
  const rangeMidMidi3 = (BASS_RANGE[3].low + BASS_RANGE[3].high) / 2;
  let currentNN = 0;
  for (const off of [-14, -7, 0, 7, 14]) {
    if (!isInRange(off, 3, ctx)) continue;
    const midi = noteNumToMidi(off, ctx);
    if (Math.abs(midi - rangeMidMidi3) < Math.abs(noteNumToMidi(currentNN, ctx) - rangeMidMidi3)) {
      currentNN = off;
    }
  }

  let sameDirCount = 0;   // 같은 방향 연속 이동 카운터
  let lastMoveDir = 0;    // 직전 이동 방향 (1=상행, -1=하행, 0=동음)
  // 방향 전환 임계값을 2~4로 랜덤화 → 마디 경계와 불일치시켜 기계적 지그재그 방지
  let sameDirLimit = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4

  // ── Sweep 방향 (50% 확률로 상행/하행) ──
  let direction: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  for (const c of pattern.contour) {
    if (c === 'asc') { direction = 1; break; }
    if (c === 'desc') { direction = -1; break; }
  }

  // ── 4마디당 일반 도약(3도/4도) 1회 위치 + 5도 도약 최대 1회 위치 결정 ──
  const leapPositions = new Set<number>();
  const fifthLeapPositions = new Set<number>();
  const groupSize = 4 * notesPerBar;

  for (let g = 0; g * groupSize < totalNotes; g++) {
    const groupStart = g * groupSize;
    const groupEnd = Math.min(groupStart + groupSize, totalNotes);
    const candidates: number[] = [];
    for (let idx = groupStart + 1; idx < groupEnd - 1; idx++) {
      candidates.push(idx);
    }
    if (candidates.length > 0) {
      // 5도 도약 위치 (4마디당 0~1회, 확률 ~60%)
      if (Math.random() < 0.6) {
        const fifthIdx = rand(candidates);
        fifthLeapPositions.add(fifthIdx);
        const remaining = candidates.filter(c => c !== fifthIdx);
        if (remaining.length > 0) {
          leapPositions.add(rand(remaining));
        }
      } else {
        leapPositions.add(rand(candidates));
      }
    }
  }

  function nearestTonic(from: number): number {
    const candidates = [0, 7, -7, 14, -14];
    let best = 0;
    let bestScore = Infinity;
    for (const c of candidates) {
      if (!isInRange(c, 3, ctx)) continue;
      const distFromPrev = Math.abs(from - c);
      const midi = noteNumToMidi(c, ctx);
      const distFromCenter = Math.abs(midi - rangeMidMidi3);
      const score = distFromPrev + distFromCenter * 0.3;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  /** structure[m] 코드 근음을 prevNN 근처 옥타브에 배치 (중심 선호) */
  function nearestRootInRange(rootDeg: number, nearNN: number): number {
    let best = rootDeg;
    let bestScore = Infinity;
    for (const off of [-14, -7, 0, 7, 14]) {
      const nn = rootDeg + off;
      if (!isInRange(nn, 3, ctx)) continue;
      const distFromPrev = Math.abs(nn - nearNN);
      // 범위 중심(MIDI 기준)에서의 거리 — 극단 배치 페널티
      const midi = noteNumToMidi(nn, ctx);
      const distFromCenter = Math.abs(midi - rangeMidMidi3);
      const score = distFromPrev + distFromCenter * 0.3;
      if (score < bestScore) { bestScore = score; best = nn; }
    }
    return isInRange(best, 3, ctx) ? best : clampToRange(best, 3, ctx);
  }

  // ── 반종지 목표 (8마디 이상: 4마디 프레이즈 경계에서 V) ──
  const halfCadenceNotes = getHalfCadenceBars(measures).map(b => b * notesPerBar);

  for (let m = 0; m < measures; m++) {
    for (let n = 0; n < notesPerBar; n++) {
      const beatPos = n * noteDuration;
      const noteIndex = m * notesPerBar + n;
      const isFirstNote = noteIndex === 0;
      const isLastNote = noteIndex === totalNotes - 1;
      const notesRemaining = totalNotes - noteIndex - 1;
      let didLeap = false;

      if (isFirstNote) {
        // ── 첫 음: structure[0] 코드 근음 ──
        currentNN = nearestRootInRange(structure[0], currentNN);
        didLeap = true;
      } else if (isLastNote) {
        // 종지: 으뜸음 복귀 (5도 이내 접근 보장)
        const tonic = nearestTonic(currentNN);
        if (Math.abs(tonic - currentNN) <= MAX_BASS_SCALE_STEP) {
          currentNN = tonic;
        } else {
          // 대도약 방지: 으뜸음 방향으로 3도 이내 접근
          const dir = tonic > currentNN ? 1 : -1;
          const approach = currentNN + dir * Math.min(3, Math.abs(tonic - currentNN));
          currentNN = isInRange(approach, 3, ctx) ? approach : tonic;
        }
        didLeap = true;
      } else if (n === 0) {
        // ── 마디 첫 박 (downbeat): 코드 근음 또는 전위음 ──
        const isHalfCadenceBar = halfCadenceNotes.includes(noteIndex);
        const rootDeg = isHalfCadenceBar ? 4 : structure[m]; // 4 = V도
        const chordRoot = nearestRootInRange(rootDeg, currentNN);

        // 근음 대도약 방지: 이전 음에서 6도(5칸) 이상이면 접근 제한
        const leapFromPrev = notes.length > 0 ? Math.abs(chordRoot - currentNN) : 0;
        if (leapFromPrev >= 5) {
          // 코드 근음 방향으로 4도(3칸) 이내 접근
          const dir = chordRoot > currentNN ? 1 : -1;
          // 4도, 3도, 2도 순으로 시도
          let placed = false;
          for (const step of [4, 3, 2]) {
            const nn = currentNN + dir * step;
            if (isInRange(nn, 3, ctx)) {
              currentNN = nn;
              placed = true;
              break;
            }
          }
          if (!placed) currentNN = chordRoot;
        } else {
          currentNN = chordRoot;
        }

        // 20% 확률로 코드 3도(+2) 또는 5도(+4)로 전위 (첫/마지막 마디 제외)
        if (!isHalfCadenceBar && m > 0 && m < measures - 1 && Math.random() < 0.20) {
          const inversionOffset = Math.random() < 0.6 ? 2 : 4; // 3도 60%, 5도 40%
          const invNN = chordRoot + inversionOffset;
          const invNNdown = chordRoot - (7 - inversionOffset); // 아래 전위
          if (isInRange(invNN, 3, ctx) && invNN !== currentNN) {
            currentNN = invNN;
          } else if (isInRange(invNNdown, 3, ctx) && invNNdown !== currentNN) {
            currentNN = invNNdown;
          } else {
            currentNN = chordRoot;
          }
        } else {
          currentNN = chordRoot;
        }
        // 다운비트가 이전 마디 마지막 음과 동음이면 다른 옥타브 근음 시도
        if (notes.length > 0 && currentNN === notes[notes.length - 1].noteNum) {
          const prevNN = notes[notes.length - 1].noteNum;
          // chordRoot가 동음이 아니면 사용
          if (chordRoot !== prevNN) {
            currentNN = chordRoot;
          } else {
            // 다른 옥타브의 근음 시도 (±7)
            for (const offset of [7, -7]) {
              const altRoot = chordRoot + offset;
              if (isInRange(altRoot, 3, ctx) && altRoot !== prevNN) {
                currentNN = altRoot;
                break;
              }
            }
            // 그래도 안 되면 현재값 유지 (희귀 케이스)
          }
        }
        didLeap = true;
      } else {
        // ── 마디 둘째 박 (upbeat): 다양한 경과음 전략 ──
        const root = notes[notes.length - 1].noteNum; // 이 마디의 근음
        // 다음 마디 근음의 음계 도수 (0~6) — 옥타브 무관 비교용
        // 반종지 마디인 경우 structure 대신 V도(4) 사용
        const nextNoteIndex = noteIndex + 1;
        const nextIsHalfCadence = halfCadenceNotes.includes(nextNoteIndex);
        const nextStructDeg = (m + 1 < measures)
          ? (nextIsHalfCadence ? 4 : structure[m + 1])
          : 0;
        const nextRootDeg = ((nextStructDeg % 7) + 7) % 7;

        // 경과음 유효성 검사 (동음 및 다음 근음 도달 방지)
        const isValidPassing = (nn: number) => {
          if (nn === root || !isInRange(nn, 3, ctx) || isForbiddenLeap(root, nn, ctx)) return false;
          // 음계 도수 비교로 다음 마디 근음과의 동음 방지 (옥타브 무관)
          const nnDeg = ((nn % 7) + 7) % 7;
          return nnDeg !== nextRootDeg;
        };

        // 방향 계산용: 다음 마디 근음의 대략적 위치
        const approxNextRoot = (m + 1 < measures)
          ? nearestRootInRange(structure[m + 1], root)
          : nearestTonic(root);

        // 경과음 전략을 랜덤 선택
        const strategy = Math.random();
        const passingOptions: number[] = [];

        if (strategy < 0.40) {
          // 전략1 (40%): 다음 근음 방향 순차/도약
          const dirToNext = approxNextRoot > root ? 1 : approxNextRoot < root ? -1 : (Math.random() < 0.5 ? 1 : -1);
          for (const size of [1, 2, 3]) {
            const nn = root + dirToNext * size;
            if (isValidPassing(nn)) {
              passingOptions.push(nn);
            }
          }
        } else if (strategy < 0.70) {
          // 전략2 (30%): 현재 코드의 3도/5도 음 (화성음)
          for (const offset of [2, 4, -2, -3]) {
            const nn = root + offset;
            if (isValidPassing(nn)) passingOptions.push(nn);
          }
        } else if (strategy < 0.90) {
          // 전략3 (20%): 반대 방향 이웃음 (neighbor tone)
          const dirToNext = approxNextRoot > root ? 1 : approxNextRoot < root ? -1 : (Math.random() < 0.5 ? 1 : -1);
          for (const size of [1, 2]) {
            const nn = root - dirToNext * size;
            if (isValidPassing(nn)) passingOptions.push(nn);
          }
        } else {
          // 전략4 (10%): 넓은 도약 (4도/5도)
          for (const offset of [3, -3, 4, -4]) {
            const nn = root + offset;
            if (isValidPassing(nn)) passingOptions.push(nn);
          }
        }

        if (passingOptions.length > 0) {
          currentNN = rand(passingOptions);
          didLeap = Math.abs(currentNN - root) >= 2;
        } else {
          // 폴백: ±1~3 전체에서 선택 (다음 근음 동음은 여전히 회피)
          const allOptions = [1, -1, 2, -2, 3, -3]
            .map(d => root + d)
            .filter(nn => isValidPassing(nn));
          if (allOptions.length > 0) {
            currentNN = rand(allOptions);
            didLeap = Math.abs(currentNN - root) >= 2;
          } else {
            // 최후 폴백: ±1 중 유효한 것 선택
            const stepUp = root + 1;
            const stepDown = root - 1;
            const lastOptions = [stepUp, stepDown].filter(nn => isValidPassing(nn));
            if (lastOptions.length > 0) {
              currentNN = rand(lastOptions);
            } else {
              const step = root + (Math.random() < 0.5 ? 1 : -1);
              currentNN = isInRange(step, 3, ctx) ? step : root;
            }
          }
        }
      }

      // ── 증2도 회피 (harmonic minor) ──
      if (mode === 'harmonic_minor' && notes.length > 0) {
        const prevNN = notes[notes.length - 1].noteNum;
        if (isAugmentedSecond(prevNN, currentNN, ctx)) {
          currentNN = resolveAugSecond(prevNN, currentNN, 3, ctx);
        }
      }

      if (isLastNote) {
        const usedDuration = n * noteDuration;
        notes.push({
          noteNum: currentNN,
          duration: measureTotal - usedDuration,
          measure: m,
          beatPosition: beatPos,
        });
        continue;
      }

      notes.push({ noteNum: currentNN, duration: noteDuration, measure: m, beatPosition: beatPos });

      // ── 같은 방향 연속 이동 추적 ──
      if (notes.length >= 2) {
        const diff = notes[notes.length - 1].noteNum - notes[notes.length - 2].noteNum;
        const moveDir = diff > 0 ? 1 : diff < 0 ? -1 : 0;
        if (moveDir !== 0 && moveDir === lastMoveDir) {
          sameDirCount++;
        } else if (moveDir !== 0) {
          sameDirCount = 1;
          lastMoveDir = moveDir;
        } else {
          sameDirCount = 0;
          lastMoveDir = 0;
        }
      }
    }
  }

  if (mode === 'harmonic_minor') {
    const scaleInfo = getScaleInfo(opts.key, mode);
    applyLeadingToneResolution(notes, scaleInfo.leadingToneIndex);
  }

  // ── 같은 방향 연속 이동 후처리 보정 (최대 3회) ──
  fixConsecutiveSameDirection(notes, 2, ctx);

  // ── 연속 동음 후처리 (MIDI 기준) ──
  // noteNum이 달라도 같은 MIDI(=같은 ABC 표기)이면 해소
  for (let i = 1; i < notes.length; i++) {
    const prevMidi = noteNumToMidi(notes[i - 1].noteNum, ctx);
    const curMidi = noteNumToMidi(notes[i].noteNum, ctx);
    if (curMidi === prevMidi) {
      for (const sh of [1, -1, 2, -2]) {
        const shifted = notes[i].noteNum + sh;
        if (isInRange(shifted, 3, ctx) && noteNumToMidi(shifted, ctx) !== prevMidi) {
          notes[i] = { ...notes[i], noteNum: shifted };
          break;
        }
      }
    }
  }

  return notes;
}

// ────────────────────────────────────────────────────────────────
// Level 4: Mixed rhythm + leap up to 5th (중급2)
// ────────────────────────────────────────────────────────────────

/**
 * 박자별 혼합 리듬 패턴 정의.
 * 각 패턴은 { id, durations } 형태. durations 합 = 마디 총 단위.
 * 홑박자: 점음가 금지, 8분 쌍 원칙.
 * 겹박자: 점4분(=1박)은 허용, 3분할 그룹 유지.
 */
interface RhythmPattern {
  id: string;
  durations: number[];
}

const RHYTHM_PATTERNS_4_4: RhythmPattern[] = [
  // Pattern 'A' [4,4] 제거: L4 혼합리듬에 2분+2분만은 부적절
  { id: 'B', durations: [4, 2, 2] },
  { id: 'C', durations: [2, 2, 4] },
  { id: 'D', durations: [2, 2, 2, 2] },
  { id: 'E', durations: [4, 2, 1, 1] },
  { id: 'F', durations: [1, 1, 2, 4] },
  { id: 'G', durations: [2, 1, 1, 4] },
  { id: 'H', durations: [1, 1, 2, 2, 2] },
  { id: 'I', durations: [2, 2, 1, 1, 2] },
  { id: 'J', durations: [2, 2, 2, 1, 1] },
  { id: 'K', durations: [1, 1, 1, 1, 4] },
  { id: 'L', durations: [4, 1, 1, 1, 1] },
  { id: 'M', durations: [4, 1, 1, 2] },
  { id: 'N', durations: [2, 4, 1, 1] },
  { id: 'O', durations: [2, 1, 1, 2, 2] },
];

const RHYTHM_PATTERNS_3_4: RhythmPattern[] = [
  { id: 'A', durations: [2, 2, 2] },
  { id: 'B', durations: [4, 2] },
  { id: 'C', durations: [2, 4] },
  { id: 'D', durations: [2, 1, 1, 2] },
  { id: 'E', durations: [1, 1, 2, 2] },
  { id: 'F', durations: [2, 2, 1, 1] },
  { id: 'G', durations: [1, 1, 4] },
  { id: 'H', durations: [4, 1, 1] },
];

const RHYTHM_PATTERNS_2_4: RhythmPattern[] = [
  { id: 'A', durations: [2, 2] },
  { id: 'B', durations: [2, 1, 1] },
  { id: 'C', durations: [1, 1, 2] },
  { id: 'D', durations: [1, 1, 1, 1] },
];

const RHYTHM_PATTERNS_6_8: RhythmPattern[] = [
  { id: 'A', durations: [3, 3] },
  { id: 'B', durations: [3, 2, 1] },
  { id: 'C', durations: [2, 1, 3] },
  { id: 'D', durations: [3, 1, 1, 1] },
  { id: 'E', durations: [1, 1, 1, 3] },
  { id: 'F', durations: [1, 1, 1, 1, 1, 1] },
];

const RHYTHM_PATTERNS_9_8: RhythmPattern[] = [
  { id: 'A', durations: [3, 3, 3] },
  { id: 'B', durations: [3, 3, 2, 1] },
  { id: 'C', durations: [3, 2, 1, 3] },
  { id: 'D', durations: [2, 1, 3, 3] },
  { id: 'E', durations: [3, 1, 1, 1, 3] },
];

const RHYTHM_PATTERNS_12_8: RhythmPattern[] = [
  { id: 'A', durations: [3, 3, 3, 3] },
  { id: 'B', durations: [3, 3, 3, 2, 1] },
  { id: 'C', durations: [3, 2, 1, 3, 3] },
  { id: 'D', durations: [2, 1, 3, 2, 1, 3] },
  { id: 'E', durations: [3, 1, 1, 1, 3, 3] },
];

type TimeSignature = '2/4' | '3/4' | '4/4' | '2/2' | '6/8' | '9/8' | '12/8';

const RHYTHM_PATTERNS_MAP: Record<TimeSignature, RhythmPattern[]> = {
  '2/4': RHYTHM_PATTERNS_2_4,
  '3/4': RHYTHM_PATTERNS_3_4,
  '4/4': RHYTHM_PATTERNS_4_4,
  '2/2': RHYTHM_PATTERNS_4_4,
  '6/8': RHYTHM_PATTERNS_6_8,
  '9/8': RHYTHM_PATTERNS_9_8,
  '12/8': RHYTHM_PATTERNS_12_8,
};

/** 마디 첫 박이 긴 음가(2분=4 이상)로 시작하는 패턴인지 */
function startsWithLongNote(pattern: RhythmPattern, isCompound: boolean): boolean {
  // 겹박자: 점4분(3) 이상이 긴 음가
  const threshold = isCompound ? 3 : 4;
  return pattern.durations[0] >= threshold;
}

/** 마지막 음가가 긴 음가(2분=4 이상)로 끝나는 패턴인지 */
function endsWithLongNote(pattern: RhythmPattern, isCompound: boolean): boolean {
  const threshold = isCompound ? 3 : 4;
  return pattern.durations[pattern.durations.length - 1] >= threshold;
}

function isCompoundMeter(timeSig: TimeSignature): boolean {
  return timeSig === '6/8' || timeSig === '9/8' || timeSig === '12/8';
}

/**
 * 리듬 모티브 반복 기반 패턴 선택.
 *
 * 음악성 규칙:
 * 1. primary(주) + secondary(부) + contrast(대비) + cadence(종지) 패턴 선택
 * 2. 4마디 프레이즈: [primary, secondary, primary, contrast] — 리듬 모티브 재현
 * 3. 8분 시작 마디 8마디 내 최대 2회
 * 4. 마지막 마디는 긴 음가로 마무리
 * 5. 8마디당 최소 3종류 패턴
 * 6. 8분음표 4연속 이상인 패턴은 primary에서 제외 (동음 반복 방지)
 */
function selectRhythmPatterns(
  measures: number,
  timeSig: TimeSignature,
): RhythmPattern[] {
  const allPatterns = RHYTHM_PATTERNS_MAP[timeSig];
  const compound = isCompoundMeter(timeSig);
  const result: RhythmPattern[] = [];

  // 패턴 분류
  const cadencePatterns = allPatterns.filter(p => endsWithLongNote(p, compound));
  const longStartPatterns = allPatterns.filter(p => startsWithLongNote(p, compound));

  // 8분 연속 4개 이상인 패턴 제외 (동음 반복 방지)
  const countConsecutiveEighths = (p: RhythmPattern): number => {
    let max = 0, cur = 0;
    for (const d of p.durations) {
      if (d === 1) { cur++; max = Math.max(max, cur); }
      else cur = 0;
    }
    return max;
  };

  // primary: 강박 안정 + 3음 이상(혼합리듬 보장) + 8분 연속 2개 이하
  const mixedLongStart = longStartPatterns.filter(p =>
    p.durations.length >= 3 && countConsecutiveEighths(p) <= 2,
  );
  const primaryPool = mixedLongStart.length > 0 ? mixedLongStart
    : longStartPatterns.filter(p => p.durations.length >= 3);
  const primary = primaryPool.length > 0 ? rand(primaryPool)
    : longStartPatterns.length > 0 ? rand(longStartPatterns)
    : rand(allPatterns);

  // secondary: primary와 다른 것 + 시작 음가와 노트 수 모두 달라야 함
  const secondaryPool = allPatterns.filter(p =>
    p.id !== primary.id &&
    p.durations.length !== primary.durations.length &&
    p.durations[0] !== primary.durations[0],
  );
  const secondaryFallback = allPatterns.filter(p =>
    p.id !== primary.id && p.durations.length !== primary.durations.length,
  );
  const secondary = secondaryPool.length > 0 ? rand(secondaryPool)
    : secondaryFallback.length > 0 ? rand(secondaryFallback)
    : rand(allPatterns.filter(p => p.id !== primary.id)) || primary;

  // contrast: primary, secondary 모두 아닌 것
  const contrastPool = allPatterns.filter(p => p.id !== primary.id && p.id !== secondary.id);
  const contrast = contrastPool.length > 0 ? rand(contrastPool) : secondary;

  // cadence: 긴 음가로 끝나는 것 (primary와 다른 것 우선)
  const cadencePool = cadencePatterns.filter(p => p.id !== primary.id);
  const cadence = cadencePool.length > 0 ? rand(cadencePool)
    : cadencePatterns.length > 0 ? rand(cadencePatterns)
    : primary;

  // ── 4마디 프레이즈 단위 모티브 배치 ──
  // [primary, secondary, primary, contrast] → 리듬 모티브 재현(1=3마디)이면서 다양성 확보
  for (let m = 0; m < measures; m++) {
    const isLastMeasure = m === measures - 1;
    const phrasePos = m % 4;

    // 첫 프레이즈(0-3): [primary, secondary, primary, contrast]
    // 둘째 프레이즈(4-7): [secondary, contrast, secondary, cadence]
    // → 프레이즈 간 리듬 복사 방지 + 모티브 재현(Sequence) 유지
    const isSecondPhrase = m >= 4;
    if (isLastMeasure) {
      result.push(cadence);
    } else if (!isSecondPhrase) {
      if (phrasePos === 0) result.push(primary);
      else if (phrasePos === 1) result.push(secondary);
      else if (phrasePos === 2) result.push(primary);
      else result.push(contrast);
    } else {
      if (phrasePos === 0) result.push(secondary);
      else if (phrasePos === 1) result.push(contrast);
      else if (phrasePos === 2) result.push(secondary);
      else result.push(contrast);
    }
  }

  // ── 8분 시작 제한 (8마디당 최대 2회) ──
  for (let blockStart = 0; blockStart < measures; blockStart += 8) {
    const blockEnd = Math.min(blockStart + 8, measures);
    let eighthStartCount = 0;
    for (let m = blockStart; m < blockEnd; m++) {
      if (result[m].durations[0] === 1) eighthStartCount++;
    }
    if (eighthStartCount > 2) {
      for (let m = blockStart; m < blockEnd && eighthStartCount > 2; m++) {
        if (result[m].durations[0] === 1 && m !== measures - 1) {
          result[m] = primaryPool.length > 0 ? rand(primaryPool) : primary;
          eighthStartCount--;
        }
      }
    }
  }

  return result;
}

/**
 * L4 음악성 강화 규칙:
 * 1. 화성적 뼈대: 마디 첫 강박 = 화성(I,IV,V,vi 등) 근음
 * 2. 5도 도약 자유: I-V, I-IV 등 화성 도약 자유 허용 (6도 이상만 금지)
 * 3. 리듬 모티브 반복: selectRhythmPatterns에서 프레이즈 단위 반복 적용
 * 4. 8분음표 순차만: duration=1 위치에서는 ±1 순차 경과음만 허용
 * 5. 동음 3연속 금지: 같은 음 반복은 최대 2회까지
 */

/** 화성 근음 목록 (음계도): I=0, ii=1, iii=2, IV=3, V=4, vi=5, vii°=6 */
const PRIMARY_CHORD_ROOTS = [0, 3, 4];     // I, IV, V
const SECONDARY_CHORD_ROOTS = [5, 1, 2];   // vi, ii, iii

/**
 * 주어진 코드 근음(음계도)에 가장 가까운 범위 내 nn 반환.
 * 음역 중앙을 선호하여 너무 낮거나 높은 근음을 방지.
 */
function nearestChordRoot(rootDeg: number, nearNN: number, ctx: BassGenContext): number {
  const range = BASS_RANGE[4];
  const rangeMidMidi = (range.low + range.high) / 2;

  let best = rootDeg;
  let bestScore = Infinity;
  for (const off of [-21, -14, -7, 0, 7, 14, 21]) {
    const nn = rootDeg + off;
    if (!isInRange(nn, 4, ctx)) continue;
    const midi = noteNumToMidi(nn, ctx);
    const distFromPrev = Math.abs(nn - nearNN);
    const distFromCenter = Math.abs(midi - rangeMidMidi);
    const score = distFromPrev + distFromCenter * 1.5;
    if (score < bestScore) { bestScore = score; best = nn; }
  }
  return clampToRange(best, 4, ctx);
}

/** 6도 이상 금지 체크 (L4: 최대 5도 = 음계도 4칸) */
function isForbiddenLeapL4(fromNN: number, toNN: number, ctx: BassGenContext): boolean {
  const interval = Math.abs(toNN - fromNN);
  if (interval <= 1) return false;
  if (interval > MAX_L3_SCALE_STEP) return true;
  const semitones = getSemitoneInterval(fromNN, toNN, ctx);
  if (semitones === 6) return true;
  if (semitones === 8) return true;
  return false;
}

/** 직전 N음이 모두 같은 음인지 확인 */
function isRepeatedNote(notes: BassNote[], count: number): boolean {
  if (notes.length < count) return false;
  const last = notes[notes.length - 1].noteNum;
  for (let i = 1; i < count; i++) {
    if (notes[notes.length - 1 - i].noteNum !== last) return false;
  }
  return true;
}

function generateBassLevel4(
  opts: TwoVoiceBassOptions,
  structure: number[],
  pattern: BassPatternDef,
  ctx: BassGenContext,
): BassNote[] {
  const { timeSig, measures, mode } = opts;
  const measureTotal = MEASURE_TOTAL[timeSig];
  const notes: BassNote[] = [];

  // ── 1. 리듬 패턴 선택 (모티브 반복 기반) ──
  const rhythmPatterns = selectRhythmPatterns(measures, timeSig);

  // ── 2. 마디별 강박 근음 결정 (화성적 뼈대) ──
  const measureRoots: number[] = [];
  // 초기 근음을 음역 중앙에 가까운 으뜸음으로 설정 (하한 집중 방지)
  const rangeMidMidi = (BASS_RANGE[4].low + BASS_RANGE[4].high) / 2;
  let prevRoot = 0;
  for (const off of [-14, -7, 0, 7, 14]) {
    if (!isInRange(off, 4, ctx)) continue;
    const midi = noteNumToMidi(off, ctx);
    if (Math.abs(midi - rangeMidMidi) < Math.abs(noteNumToMidi(prevRoot, ctx) - rangeMidMidi)) {
      prevRoot = off;
    }
  }
  for (let m = 0; m < measures; m++) {
    let rootDeg: number;
    if (m === 0 || m === measures - 1) {
      rootDeg = 0;
    } else if (mode === 'harmonic_minor' && m === measures - 2) {
      rootDeg = 4;
    } else {
      rootDeg = structure[m];
    }
    const nn = nearestChordRoot(rootDeg, prevRoot, ctx);
    measureRoots.push(nn);
    prevRoot = nn;
  }

  // ── 3. 총 음 수 계산 및 매핑 ──
  const noteCountPerMeasure = rhythmPatterns.map(rp => rp.durations.length);
  const totalNotes = noteCountPerMeasure.reduce((s, c) => s + c, 0);

  const noteMap: { measure: number; inMeasureIdx: number }[] = [];
  for (let m = 0; m < measures; m++) {
    for (let n = 0; n < noteCountPerMeasure[m]; n++) {
      noteMap.push({ measure: m, inMeasureIdx: n });
    }
  }

  // ── 4. Sweep 방향 ──
  let direction: 1 | -1 = -1;
  for (const c of pattern.contour) {
    if (c === 'asc') { direction = 1; break; }
    if (c === 'desc') { direction = -1; break; }
  }

  let currentNN = 0;

  // ── 5. 음 생성 (화성 뼈대 + 경과음) ──
  for (let noteIndex = 0; noteIndex < totalNotes; noteIndex++) {
    const { measure: m, inMeasureIdx: n } = noteMap[noteIndex];
    const rp = rhythmPatterns[m];
    const duration = rp.durations[n];
    const isFirstNote = noteIndex === 0;
    const isLastNote = noteIndex === totalNotes - 1;
    const isEighthNote = duration === 1;
    const isMeasureFirstBeat = n === 0;

    // beatPosition 계산
    let beatPos = 0;
    for (let k = 0; k < n; k++) beatPos += rp.durations[k];

    // 다음 마디 근음 (경과음 방향 결정용)
    const nextMeasureRoot = m + 1 < measures ? measureRoots[m + 1] : measureRoots[m];
    // 이 마디의 남은 8분음표 수 → 다음 강박까지의 거리
    const notesLeftInMeasure = noteCountPerMeasure[m] - n - 1;

    if (isFirstNote) {
      currentNN = measureRoots[0];
    } else if (isLastNote) {
      currentNN = measureRoots[measures - 1];
    } else if (isMeasureFirstBeat) {
      // ── 규칙1: 마디 첫 강박 = 화성 근음 ──
      currentNN = measureRoots[m];
    } else if (isEighthNote) {
      // ── 규칙4: 8분음표 = 순차 경과음만 (±1) ──
      // 목표: 다음 강박(다음 마디 근음 또는 마디 내 다음 긴 음)
      let target: number;

      // 마디 내 다음 긴 음가(>=2) 찾기
      let nextLongNoteIdx = -1;
      for (let k = n + 1; k < noteCountPerMeasure[m]; k++) {
        if (rp.durations[k] >= 2) { nextLongNoteIdx = k; break; }
      }

      if (notesLeftInMeasure === 0 && m + 1 < measures) {
        // 마디 마지막 음 → 다음 마디 근음 향해
        target = nextMeasureRoot;
      } else if (nextLongNoteIdx >= 0) {
        // 마디 내 다음 긴 음 = 코드톤 방향
        target = nextMeasureRoot;
      } else {
        target = nextMeasureRoot;
      }

      const dirToTarget = target > currentNN ? 1 : target < currentNN ? -1 : direction;
      let nextNN = currentNN + dirToTarget;

      // 동음 반복 방지: 이미 2회 반복이면 반드시 이동
      if (nextNN === currentNN && isRepeatedNote(notes, 1)) {
        nextNN = currentNN + direction;
      }

      // 왕복(X-Y-X) 패턴 방지: 직전2음이 A-B이면 A로 되돌아가지 않음
      if (notes.length >= 2) {
        const twoBack = notes[notes.length - 2].noteNum;
        if (nextNN === twoBack && nextNN !== currentNN) {
          // 같은 방향으로 계속 진행
          const contNN = currentNN + (currentNN > twoBack ? 1 : -1);
          if (isInRange(contNN, 4, ctx)) nextNN = contNN;
        }
      }

      if (isInRange(nextNN, 4, ctx)) {
        currentNN = nextNN;
      } else {
        // 반대 방향 시도
        const altNN = currentNN - dirToTarget;
        if (isInRange(altNN, 4, ctx)) currentNN = altNN;
      }
    } else {
      // ── 규칙2: 긴 음가(4분/2분) = 화성 도약 자유 (5도까지) ──
      const prevNN = notes.length > 0 ? notes[notes.length - 1].noteNum : currentNN;

      // 동음 반복 방지: step=0 제외 + 이미 2연속이면 같은음 후보 제거
      const mustMove = isRepeatedNote(notes, 2);

      // 후보 수집: ±1 ~ ±4 (순차 ~ 5도)
      const candidates: number[] = [];
      for (let step = -MAX_L3_SCALE_STEP; step <= MAX_L3_SCALE_STEP; step++) {
        if (step === 0) continue;
        const nn = prevNN + step;
        if (!isInRange(nn, 4, ctx)) continue;
        if (isForbiddenLeapL4(prevNN, nn, ctx)) continue;
        candidates.push(nn);
      }

      if (candidates.length > 0) {
        const dirToNext = nextMeasureRoot > currentNN ? 1 : nextMeasureRoot < currentNN ? -1 : 0;

        // 1차: 화성음 후보 (I, IV, V, vi, ii, iii)
        const chordTones = candidates.filter(nn => {
          const deg = ((nn % 7) + 7) % 7;
          return PRIMARY_CHORD_ROOTS.includes(deg) || SECONDARY_CHORD_ROOTS.includes(deg);
        });

        // 2차: 다음 근음 방향에 맞는 후보
        const filterByDir = (pool: number[]) => pool.filter(nn => {
          if (dirToNext === 0) return true;
          return (nn > prevNN ? 1 : -1) === dirToNext;
        });

        const directedChord = filterByDir(chordTones);
        const directedAll = filterByDir(candidates);

        // 우선순위: 방향+화성 > 화성 > 방향 > 전체
        const pool = directedChord.length > 0 ? directedChord
          : chordTones.length > 0 ? chordTones
          : directedAll.length > 0 ? directedAll
          : candidates;

        // 왕복(A-B-A) 패턴 방지
        let finalPool = pool;
        if (notes.length >= 2) {
          const twoBack = notes[notes.length - 2].noteNum;
          const filtered = pool.filter(nn => nn !== twoBack);
          if (filtered.length > 0) finalPool = filtered;
        }
        currentNN = rand(finalPool);
      } else if (mustMove) {
        // 후보 없지만 이동 필수 → 순차
        const nextNN = prevNN + direction;
        currentNN = isInRange(nextNN, 4, ctx) ? nextNN : prevNN - direction;
      } else {
        const nextNN = currentNN + direction;
        currentNN = isInRange(nextNN, 4, ctx) ? nextNN : currentNN;
      }
    }

    // ── 증2도 보정 ──
    if (mode === 'harmonic_minor' && notes.length > 0) {
      const prevNN = notes[notes.length - 1].noteNum;
      if (isAugmentedSecond(prevNN, currentNN, ctx)) {
        currentNN = resolveAugSecond(prevNN, currentNN, 4, ctx);
      }
    }

    // ── 6도 이상 도약 최종 안전장치 ──
    if (notes.length > 0) {
      const prevNN = notes[notes.length - 1].noteNum;
      if (isForbiddenLeapL4(prevNN, currentNN, ctx)) {
        const dir = currentNN > prevNN ? 1 : -1;
        currentNN = prevNN + dir;
      }
    }

    // ── 동음 3연속 최종 안전장치 ──
    if (notes.length >= 2 && isRepeatedNote(notes, 2) && currentNN === notes[notes.length - 1].noteNum) {
      const step = isInRange(currentNN + 1, 4, ctx) ? 1 : -1;
      currentNN = currentNN + step;
    }

    // 마지막 음: 남은 박자 채우기
    if (isLastNote) {
      notes.push({
        noteNum: currentNN,
        duration: measureTotal - beatPos,
        measure: m,
        beatPosition: beatPos,
      });
    } else {
      notes.push({ noteNum: currentNN, duration, measure: m, beatPosition: beatPos });
    }

    // sweep 방향 갱신
    if (notes.length >= 2) {
      const diff = notes[notes.length - 1].noteNum - notes[notes.length - 2].noteNum;
      if (diff > 0) direction = 1;
      else if (diff < 0) direction = -1;
    }
  }

  if (mode === 'harmonic_minor') {
    const scaleInfo = getScaleInfo(opts.key, mode);
    applyLeadingToneResolution(notes, scaleInfo.leadingToneIndex);
  }

  fixConsecutiveSameDirection(notes, 3, ctx);

  // ── 동음 8분음표 쌍 보정 ──
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].duration === 1 && notes[i - 1].duration === 1 &&
        notes[i].noteNum === notes[i - 1].noteNum) {
      // 다음 음 방향으로 순차 이동
      const target = i + 1 < notes.length ? notes[i + 1].noteNum : notes[i].noteNum + 1;
      const dir = target > notes[i].noteNum ? 1 : target < notes[i].noteNum ? -1 : 1;
      const newNN = notes[i].noteNum + dir;
      if (isInRange(newNN, 4, ctx)) {
        notes[i].noteNum = newNN;
      }
    }
  }

  return notes;
}

// ────────────────────────────────────────────────────────────────
// Post-processing: consecutive same-direction fix
// ────────────────────────────────────────────────────────────────

/**
 * 같은 방향 연속 이동이 maxMoves를 초과하면 중간 음을 보정.
 * 위반 지점의 음을 직전 음과 동일하게(유지) 설정하여 방향 체인을 끊는다.
 */
function fixConsecutiveSameDirection(
  notes: BassNote[], maxMoves: number, _ctx: BassGenContext,
): void {
  for (let pass = 0; pass < 3; pass++) {
    let fixed = false;
    let count = 0;
    let lastDir = 0;
    for (let i = 1; i < notes.length; i++) {
      const diff = notes[i].noteNum - notes[i - 1].noteNum;
      const dir = diff > 0 ? 1 : diff < 0 ? -1 : 0;
      if (dir !== 0 && dir === lastDir) {
        count++;
        if (count > maxMoves) {
          // 위반 지점: 반대 방향 1도 이동으로 체인 차단 (동음 반복 방지)
          const revDir = lastDir > 0 ? -1 : 1;
          notes[i].noteNum = notes[i - 1].noteNum + revDir;
          count = 0;
          lastDir = 0;
          fixed = true;
        }
      } else if (dir !== 0) {
        count = 1;
        lastDir = dir;
      } else {
        count = 0;
        lastDir = 0;
      }
    }
    if (!fixed) break;
  }
}

// ────────────────────────────────────────────────────────────────
// Leading tone resolution helper (harmonic minor)
// ────────────────────────────────────────────────────────────────

function applyLeadingToneResolution(notes: BassNote[], leadingToneIndex: number): void {
  for (let i = 0; i < notes.length - 1; i++) {
    const deg = ((notes[i].noteNum % 7) + 7) % 7;
    if (deg === leadingToneIndex) {
      const nextDeg = ((notes[i + 1].noteNum % 7) + 7) % 7;
      if (nextDeg !== 0) {
        const octBlock = Math.floor(notes[i].noteNum / 7);
        notes[i + 1].noteNum = (octBlock + 1) * 7; // tonic one step up
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────

export function generateTwoVoiceBass(opts: TwoVoiceBassOptions): BassNote[] {
  const { bassLevel, measures, bassDirection, mode } = opts;
  const isMinor = mode === 'harmonic_minor';
  const ctx = buildContext(opts.key, mode);

  // Step 1: Generate harmonic structure
  const structure = generateBassStructure(measures, isMinor);

  // Step 2: Resolve pattern (if applicable for L2/L3)
  let pattern: BassPatternDef | undefined;
  if (bassLevel >= 2) {
    if (bassDirection) {
      pattern = getPatternById(bassDirection);
      if (!pattern) {
        pattern = selectRandomPattern(measures, bassLevel);
      }
    } else {
      pattern = selectRandomPattern(measures, bassLevel);
    }
  }

  // Step 3: Generate bass notes per level
  let bassNotes: BassNote[];
  switch (bassLevel) {
    case 1:
      bassNotes = generateBassLevel1(opts, structure, ctx);
      break;
    case 2:
      bassNotes = generateBassLevel2(opts, structure, pattern!, ctx);
      break;
    case 3:
      bassNotes = generateBassLevel3(opts, structure, pattern!, ctx);
      break;
    case 4:
      bassNotes = generateBassLevel4(opts, structure, pattern!, ctx);
      break;
    default:
      throw new Error(`Invalid bass level: ${bassLevel}`);
  }

  // Step 4: Validate measure durations (self-check)
  validateDurations(bassNotes, opts);

  return bassNotes;
}

// ────────────────────────────────────────────────────────────────
// Internal duration validation
// ────────────────────────────────────────────────────────────────

function validateDurations(notes: BassNote[], opts: TwoVoiceBassOptions): void {
  const expectedTotal = MEASURE_TOTAL[opts.timeSig];
  const byMeasure = new Map<number, number>();

  for (const n of notes) {
    byMeasure.set(n.measure, (byMeasure.get(n.measure) || 0) + n.duration);
  }

  for (let m = 0; m < opts.measures; m++) {
    const total = byMeasure.get(m) || 0;
    if (total !== expectedTotal) {
      const measureNotes = notes.filter(n => n.measure === m);
      if (measureNotes.length > 0) {
        const last = measureNotes[measureNotes.length - 1];
        const others = measureNotes.slice(0, -1);
        const othersTotal = others.reduce((s, n) => s + n.duration, 0);
        last.duration = expectedTotal - othersTotal;
      }
    }
  }
}
