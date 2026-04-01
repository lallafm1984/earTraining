// ────────────────────────────────────────────────────────────────
// Two-Voice Chromatic Accidental Algorithm
// Spec: temp/chromatic_accidental_algorithm.md
// 멜로디 레벨 8(고급2) 이상에서 음악적으로 타당한 임시표 삽입
// ────────────────────────────────────────────────────────────────

import type { ScoreNote, PitchName, Accidental } from '../scoreUtils';
import {
  getKeySigAlteration,
  noteToMidiWithKey,
  durationToSixteenths,
  getScaleDegrees,
} from '../scoreUtils';

// ────────────────────────────────────────────────────────────────
// Types & Constants
// ────────────────────────────────────────────────────────────────

type AccidentalType =
  | 'SEC_DOM'    // 부속화음 (Secondary Dominant) — 이끔음
  | 'MODAL_MIX'  // 동주조 차용 (Modal Mixture)
  | 'CHR_PASS'   // 반음계 경과음 (Chromatic Passing)
  | 'CHR_NEIGH'  // 반음계 보조음 (Chromatic Neighbor)
  | 'STR_M6'     // 구조적 ♮6 (단조 전용)
  | 'STR_b7';    // 구조적 b7 (단조 전용)

const PITCH_SEMI: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** 장조 스케일 반음 오프셋 */
const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
/** 화성단음계 반음 오프셋 */
const HARM_MINOR_OFFSETS = [0, 2, 3, 5, 7, 8, 11];

/** 조성 → 으뜸음 피치클래스 */
const KEY_ROOT_PC: Record<string, number> = {
  'C': 0, 'G': 7, 'D': 2, 'A': 9, 'E': 4, 'B': 11, 'F#': 6, 'C#': 1,
  'F': 5, 'Bb': 10, 'Eb': 3, 'Ab': 8, 'Db': 1, 'Gb': 6, 'Cb': 11,
  'Am': 9, 'Em': 4, 'Bm': 11, 'F#m': 6, 'C#m': 1, 'G#m': 8, 'D#m': 3, 'A#m': 10,
  'Dm': 2, 'Gm': 7, 'Cm': 0, 'Fm': 5, 'Bbm': 10, 'Ebm': 3, 'Abm': 8,
};

/**
 * 난이도별 허용 임시표 유형 (문서 제8장 §8.4 기반)
 * L8: 부속화음 + 동주조 차용 + 구조적(♮6, b7) — 기본 유형
 * L9: + 반음계 경과음 + 반음계 보조음 — 전체 유형
 */
const LEVEL_TYPES: Record<number, Set<AccidentalType>> = {
  8: new Set<AccidentalType>(['SEC_DOM', 'MODAL_MIX', 'STR_M6', 'STR_b7']),
  9: new Set<AccidentalType>(['SEC_DOM', 'MODAL_MIX', 'STR_M6', 'STR_b7', 'CHR_PASS', 'CHR_NEIGH']),
};

/** 소프트 스코어 최소 임계값 — 이 미만이면 삽입하지 않음 */
const SCORE_THRESHOLD = 60;

/** 안전 음정 (피치클래스 거리) */
const SAFE_INTERVALS = new Set([0, 3, 4, 5, 7, 8, 9]);
/** 주의 음정 — 경과음 맥락에서만 허용 */
const CAUTION_INTERVALS = new Set([2, 10]);

// ────────────────────────────────────────────────────────────────
// Internal types
// ────────────────────────────────────────────────────────────────

interface Candidate {
  type: AccidentalType;
  accidental: Accidental;
  altMidi: number;
  direction: 'up' | 'down';
  compatBass: number[];   // 어울리는 베이스 피치클래스 목록
  priority: number;       // 1(최고) ~ 5(최저)
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function getRootPC(key: string): number {
  return KEY_ROOT_PC[key] ?? 0;
}

function getScalePCSet(key: string, mode: 'major' | 'harmonic_minor'): Set<number> {
  const r = getRootPC(key);
  const offs = mode === 'major' ? MAJOR_OFFSETS : HARM_MINOR_OFFSETS;
  return new Set(offs.map(o => (r + o) % 12));
}

/**
 * ScoreNote → 실제 발음 MIDI.
 * 화성단음계의 7음(이끔음)은 조표에 없으므로 별도 +1 보정 필요.
 */
function soundingMidi(
  note: ScoreNote,
  key: string,
  mode: 'major' | 'harmonic_minor',
  scale: PitchName[],
): number {
  const midi = noteToMidiWithKey(note, key);
  if (midi < 0) return midi;
  // 화성단음계: 명시 임시표 없는 7음은 올린 7음(이끔음)으로 발음
  if (mode === 'harmonic_minor' && !note.accidental) {
    if (note.pitch === scale[6]) return midi + 1;
  }
  return midi;
}

/** 명시 임시표에 의한 MIDI (조표 무시, 임시표만 적용) */
function getAlteredMidi(pitch: PitchName, octave: number, acc: Accidental): number {
  const base = PITCH_SEMI[pitch] ?? 0;
  const v = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
  return (octave + 1) * 12 + base + v;
}

/**
 * 해당 변화(acc)가 유효한 임시표(비스케일 음)를 생성하는지 검증.
 * - 이명동음 혼란 방지: E#, B#, Cb, Fb 차단
 * - 원래 발음과 동일하면 무의미 → 차단
 * - 스케일 음이면 다이어토닉 → 차단
 */
function isValidAlteration(
  pitch: PitchName,
  acc: Accidental,
  key: string,
  mode: 'major' | 'harmonic_minor',
  scale: PitchName[],
  scalePCs: Set<number>,
): boolean {
  if (pitch === 'rest') return false;
  // 이명동음 가드: E#=F, B#=C, Cb=B, Fb=E
  if (acc === '#' && (pitch === 'E' || pitch === 'B')) return false;
  if (acc === 'b' && (pitch === 'C' || pitch === 'F')) return false;

  const base = PITCH_SEMI[pitch] ?? 0;
  const ka = getKeySigAlteration(key, pitch);

  // 원래 발음 PC (조표 + 화성단음계 보정)
  let origPC = ka === '#' ? (base + 1) % 12 : ka === 'b' ? (base + 11) % 12 : base % 12;
  if (mode === 'harmonic_minor' && pitch === scale[6]) {
    origPC = (origPC + 1) % 12; // 7음 올림
  }

  // 변화 후 PC
  const altPC = acc === '#' ? (base + 1) % 12 : acc === 'b' ? (base + 11) % 12 : base % 12;

  if (altPC === origPC) return false;     // 변화 없음
  if (scalePCs.has(altPC)) return false;  // 여전히 스케일 음
  return true;
}

// ────────────────────────────────────────────────────────────────
// 절대 금지 규칙 (Hard Constraints — §2.1)
// ────────────────────────────────────────────────────────────────

/**
 * RULE_H1: 단2도(1반음) 금지
 * RULE_H2: 단9도(13반음) 금지
 * 장7도(11반음) 금지 (단2도 전위)
 * 증4도/감5도(6반음) — SEC_DOM 맥락 외 금지
 * RULE_H3: 해결 없이 도약 금지 (다음 음과 3반음 초과)
 * RULE_H5: 이전 음과 삼전음(6반음) 도약 금지
 */
function failsHardConstraint(
  altMidi: number,
  bassMidi: number,
  prevMidi: number | null,
  nextMidi: number | null,
  type: AccidentalType,
): boolean {
  if (bassMidi > 0) {
    const iv = ((altMidi - bassMidi) % 12 + 12) % 12;
    if (iv === 1 || iv === 11) return true;               // RULE_H1: m2 / M7
    if (Math.abs(altMidi - bassMidi) === 13) return true;  // RULE_H2: m9
    if (iv === 6 && type !== 'SEC_DOM') return true;       // 트라이톤 (비부속화음)
  }
  // RULE_H3: 해결(반음 상행/하행) 없이 도약 금지
  if (nextMidi !== null && nextMidi > 0) {
    if (Math.abs(altMidi - nextMidi) > 3) return true;
  }
  // RULE_H5: 이전 음과 삼전음(6반음) 도약 금지
  if (prevMidi !== null && prevMidi > 0) {
    if (Math.abs(altMidi - prevMidi) === 6) return true;
  }
  // RULE_H6: 이전 음과 단2도(1반음) 진입 금지 — 불협화 충돌
  if (prevMidi !== null && prevMidi > 0) {
    if (Math.abs(altMidi - prevMidi) === 1) return true;
  }
  // RULE_H7: 이전 음과 큰 도약(>7반음) 진입 금지
  if (prevMidi !== null && prevMidi > 0) {
    if (Math.abs(altMidi - prevMidi) > 7) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────
// 후보 분류 (Candidate Classification — §3~4장)
// ────────────────────────────────────────────────────────────────

function classifyCandidates(
  pitch: PitchName,
  octave: number,
  acc: Accidental,
  prevMidi: number | null,
  nextMidi: number | null,
  key: string,
  mode: 'major' | 'harmonic_minor',
  scalePCs: Set<number>,
): Candidate[] {
  const r = getRootPC(key);
  const altM = getAlteredMidi(pitch, octave, acc);
  const altPC = ((altM % 12) + 12) % 12;
  const out: Candidate[] = [];

  const nextPC = nextMidi !== null && nextMidi > 0 ? nextMidi % 12 : -1;
  const prevPC = prevMidi !== null && prevMidi > 0 ? prevMidi % 12 : -1;

  // ── SEC_DOM: 이끔음 (다음 음의 반음 아래) ──────────────────
  // 공식: 임시표음 = 해결 대상 - 1반음, 해결 방향 = 반음 상행
  if (nextPC >= 0 && ((nextPC - altPC + 12) % 12) === 1 && scalePCs.has(nextPC)) {
    out.push({
      type: 'SEC_DOM', accidental: acc, altMidi: altM, direction: 'up',
      // 적합 베이스: 도미넌트 근음(5도 아래), 해결 대상 자체, 장3도 아래
      compatBass: [(nextPC + 5) % 12, nextPC, (nextPC + 8) % 12],
      priority: 1,
    });
  }

  // ── STR_M6 (단조 전용): ♮6 → 7(이끔음) 상행 해결 ──────────
  // 선율단음계 상행: b6→♮6→7→1
  if (mode === 'harmonic_minor' && nextPC >= 0) {
    const nat6 = (r + 9) % 12;
    const lead = (r + 11) % 12;
    if (altPC === nat6 && nextPC === lead) {
      out.push({
        type: 'STR_M6', accidental: acc, altMidi: altM, direction: 'up',
        compatBass: [(r + 5) % 12, (r + 2) % 12, nat6],
        priority: 2,
      });
    }
  }

  // ── STR_b7 (단조 전용): b7 → b6 또는 5 하행 해결 ──────────
  // 자연단음계 하행: 1→b7→b6
  if (mode === 'harmonic_minor' && nextPC >= 0) {
    const b7 = (r + 10) % 12;
    const b6 = (r + 8) % 12;
    const fifth = (r + 7) % 12;
    if (altPC === b7 && (nextPC === b6 || nextPC === fifth)) {
      out.push({
        type: 'STR_b7', accidental: acc, altMidi: altM, direction: 'down',
        compatBass: [(r + 5) % 12, b7, (r + 3) % 12],
        priority: 3,
      });
    }
  }

  // ── MODAL_MIX: 동주조 차용 ────────────────────────────────
  if (mode === 'major') {
    // 장조 → 병행단조 차용: b3, b6, b7, b2(나폴리)
    const mixDefs: { pc: number; bass: number[]; prio: number }[] = [
      { pc: (r + 3) % 12,  bass: [r, (r + 5) % 12, (r + 8) % 12], prio: 3 },             // b3
      { pc: (r + 8) % 12,  bass: [(r + 5) % 12, (r + 8) % 12, (r + 2) % 12], prio: 2 },  // b6 ★★★★★
      { pc: (r + 10) % 12, bass: [(r + 5) % 12, (r + 10) % 12, r], prio: 3 },             // b7
      { pc: (r + 1) % 12,  bass: [(r + 1) % 12, (r + 5) % 12, (r + 8) % 12], prio: 5 },  // b2 (나폴리)
    ];
    for (const m of mixDefs) {
      if (altPC !== m.pc) continue;
      if (nextMidi === null || nextMidi <= 0) continue;
      // 해결: 하행 1~3반음
      const diff = altM - nextMidi;
      if (diff >= 1 && diff <= 3) {
        out.push({
          type: 'MODAL_MIX', accidental: acc, altMidi: altM, direction: 'down',
          compatBass: m.bass, priority: m.prio,
        });
      }
    }
  } else {
    // 단조(화성단음계) → 병행장조 차용: ♮3 (피카르디 3도)
    const nat3 = (r + 4) % 12;
    if (altPC === nat3 && !scalePCs.has(nat3)) {
      out.push({
        type: 'MODAL_MIX', accidental: acc, altMidi: altM, direction: 'up',
        compatBass: [r, (r + 7) % 12, nat3], priority: 2,
      });
    }
  }

  // ── CHR_PASS: 반음계 경과음 ────────────────────────────────
  if (prevMidi !== null && prevMidi > 0 && nextMidi !== null && nextMidi > 0) {
    const span = nextMidi - prevMidi;

    // 일반: 온음(2반음) 간격 사이 반음계 경과
    if (Math.abs(span) === 2) {
      const expected = prevMidi + (span > 0 ? 1 : -1);
      if (altM === expected) {
        out.push({
          type: 'CHR_PASS', accidental: acc, altMidi: altM,
          direction: span > 0 ? 'up' : 'down',
          compatBass: [prevPC], priority: 4,
        });
      }
    }

    // 단조 전용: 증2도(3반음) 구간 (b6↔7) 경과음
    if (mode === 'harmonic_minor' && Math.abs(span) === 3) {
      const b6 = (r + 8) % 12;
      const lead = (r + 11) % 12;
      if ((prevPC === b6 && nextPC === lead) || (prevPC === lead && nextPC === b6)) {
        const nat6 = (r + 9) % 12;
        const b7PC = (r + 10) % 12;
        if (altPC === nat6 || altPC === b7PC) {
          out.push({
            type: 'CHR_PASS', accidental: acc, altMidi: altM,
            direction: span > 0 ? 'up' : 'down',
            compatBass: [prevPC, (r + 5) % 12],
            // ♮6 경과음 최우선 (AUG2_RULE_1), b7은 보조적 (AUG2_RULE_2)
            priority: altPC === nat6 ? 2 : 4,
          });
        }
      }
    }
  }

  // ── CHR_NEIGH: 반음계 보조음 (prev == next, ±1반음) ────────
  if (prevMidi !== null && prevMidi > 0 && nextMidi !== null && nextMidi > 0 && prevMidi === nextMidi) {
    const diff = altM - prevMidi;
    if (Math.abs(diff) === 1) {
      // 단조 특수: b6 상행 보조음(♮6) 또는 7(이끔음) 하행 보조음(b7)은 우선순위 높임
      let prio = 5;
      if (mode === 'harmonic_minor') {
        const b6 = (r + 8) % 12;
        const leadPC = (r + 11) % 12;
        if (prevPC === b6 && diff === 1) prio = 3;    // b6→♮6→b6
        if (prevPC === leadPC && diff === -1) prio = 3; // 7→b7→7
      }
      out.push({
        type: 'CHR_NEIGH', accidental: acc, altMidi: altM,
        direction: diff > 0 ? 'up' : 'down',
        compatBass: [prevPC], priority: prio,
      });
    }
  }

  return out;
}

// ────────────────────────────────────────────────────────────────
// 소프트 스코어링 (Soft Scoring — §2.2, §5.9)
// ────────────────────────────────────────────────────────────────

function computeSoftScore(
  c: Candidate,
  bassMidi: number,
  isStrongBeat: boolean,
  dur16: number,
  prevDur16: number,
  measureAccCount: number,
  resolvedByNext: boolean,
): number {
  let s = 100;

  // ── 우선순위 보너스 (priority 1=+50, 5=+10) ──
  s += (6 - c.priority) * 10;

  // ── RULE_S3: 박자 위치 ──
  if (isStrongBeat) {
    s -= 10;
    // 부속화음은 강박도 허용
    if (c.type === 'SEC_DOM') s += 15;
    // 구조적 임시표는 강박 감점 완화
    if (c.type === 'STR_M6' || c.type === 'STR_b7') s += 10;
  } else {
    s += 15; // 약박 보너스
  }

  // ── 증2도 회피 보너스 (화성단음계 b6→7 경과음) ──
  if (c.type === 'CHR_PASS' && c.priority === 2) s += 15;

  // ── RULE_S4: 베이스 호환성 ──
  if (bassMidi > 0) {
    const bassPC = bassMidi % 12;
    if (c.compatBass.includes(bassPC)) {
      s += 30; // 추천 베이스 일치
    } else {
      const iv = ((c.altMidi - bassMidi) % 12 + 12) % 12;
      if (SAFE_INTERVALS.has(iv)) s += 10;
      else if (CAUTION_INTERVALS.has(iv)) s -= 10;
    }
  }

  // ── RULE_S6: 음가 — 주변 음보다 같거나 짧게 ──
  if (prevDur16 > 0) {
    if (dur16 <= prevDur16) s += 5;
    else s -= 15;
  }

  // ── RULE_S5: 마디당 임시표 최대 2회 권장 ──
  if (measureAccCount >= 2) s -= 30;

  // ── 해결 확실성 ──
  if (resolvedByNext) s += 25;
  else s -= 40;

  return s;
}

// ────────────────────────────────────────────────────────────────
// Main public function
// ────────────────────────────────────────────────────────────────

/**
 * 2성부 멜로디에 음악적으로 타당한 임시표를 삽입한다.
 * melodyLevel >= 8 (고급 2단계 이상)에서 호출.
 *
 * 알고리즘 흐름 (문서 §5.2):
 * 1. 후보 생성 (SEC_DOM, MODAL_MIX, CHR_PASS, CHR_NEIGH, STR_M6, STR_b7)
 * 2. 하드 필터링 (단2도/장7도/단9도 금지, 트라이톤 제한, 해결 필수)
 * 3. 소프트 스코어링 (우선순위, 박자, 베이스 호환, 음가, 밀도, 해결)
 * 4. 임계값 판정 (score ≥ 60 → 삽입, 아니면 패스)
 */
export function applyMelodyAccidentals(
  notes: ScoreNote[],
  bassMaps: Map<number, number>[] | null,
  keySignature: string,
  mode: 'major' | 'harmonic_minor',
  level: number,
  sixteenthsPerBar: number,
  strongBeats: Set<number>,
): void {
  if (level < 8 || notes.length < 4) return;

  const scale = getScaleDegrees(keySignature);
  const scalePCs = getScalePCSet(keySignature, mode);
  const allowed = LEVEL_TYPES[Math.min(level, 9)] ?? LEVEL_TYPES[9];

  // ── 예산 계산 ──
  const budgetRange: [number, number] = [2, 4];
  let budget = budgetRange[0] +
    Math.floor(Math.random() * (budgetRange[1] - budgetRange[0] + 1));

  // ── 노트 위치 계산 (마디 인덱스 + 마디 내 16분음표 위치) ──
  const positions: { bar: number; pos: number }[] = [];
  let totalPos = 0;
  for (const n of notes) {
    const bar = Math.floor(totalPos / sixteenthsPerBar);
    const pos = totalPos % sixteenthsPerBar;
    positions.push({ bar, pos });
    totalPos += n.tupletNoteDur ?? durationToSixteenths(n.duration);
  }

  // ── 삽입 적격 인덱스 수집 ──
  // 제외: 첫 음, 마디 첫/마지막 음, 쉼표, 기존 임시표 음
  const eligible: number[] = [];
  for (let i = 1; i < notes.length - 1; i++) {
    const n = notes[i];
    if (n.pitch === 'rest') continue;
    if (n.accidental) continue;
    const p = positions[i];
    if (!p) continue;
    if (p.pos === 0) continue; // 마디 첫 음 제외 (강박 협화 보정 충돌 방지)
    // 마디 마지막 음 제외
    const pNext = positions[i + 1];
    if (pNext && pNext.bar !== p.bar) continue;
    eligible.push(i);
  }

  // ── 랜덤 셔플 (위치 다양성 확보) ──
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  // ── 마디별 임시표 카운트 추적 ──
  const measureAccCount = new Map<number, number>();

  // ── 후보 평가 및 적용 ──
  for (const idx of eligible) {
    if (budget <= 0) break;

    const note = notes[idx];
    const p = positions[idx];
    if (!p) continue;

    // RULE_H4: 인접 음이 이미 임시표면 연속 삽입 회피 (적용 시점 체크)
    if (idx > 0 && notes[idx - 1].accidental) continue;
    if (idx < notes.length - 1 && notes[idx + 1].accidental) continue;

    // 베이스 MIDI 조회 (1성부 모드: bassMaps가 null이면 베이스 없음)
    const bassMap = bassMaps ? bassMaps[p.bar] : undefined;
    const bassMidi = bassMap?.get(p.pos) ?? bassMap?.get(0) ?? 0;
    const isStrong = strongBeats.has(p.pos);

    // 전후 음 MIDI (화성단음계 7음 보정 포함)
    const prev = findPitched(notes, idx, -1);
    const next = findPitched(notes, idx, 1);
    const prevMidi = prev ? soundingMidi(prev, keySignature, mode, scale) : null;
    const nextMidi = next ? soundingMidi(next, keySignature, mode, scale) : null;

    const mAccCnt = measureAccCount.get(p.bar) ?? 0;
    const dur16 = durationToSixteenths(note.duration);
    const prevDur16 = prev ? durationToSixteenths(prev.duration) : 0;

    // ── 모든 가능한 변화(#, b, n)에 대해 후보 생성·평가 ──
    let bestCand: Candidate | null = null;
    let bestScore = -Infinity;

    for (const acc of ['#', 'b', 'n'] as Accidental[]) {
      if (!isValidAlteration(note.pitch, acc, keySignature, mode, scale, scalePCs)) continue;

      const candidates = classifyCandidates(
        note.pitch, note.octave, acc,
        prevMidi, nextMidi,
        keySignature, mode, scalePCs,
      );

      for (const c of candidates) {
        // 레벨별 허용 유형 필터
        if (!allowed.has(c.type)) continue;
        // 하드 필터링
        if (failsHardConstraint(c.altMidi, bassMidi, prevMidi, nextMidi, c.type)) continue;

        // 소프트 스코어링
        const resolved = nextMidi !== null && nextMidi > 0 && Math.abs(c.altMidi - nextMidi) <= 2;
        const score = computeSoftScore(
          c, bassMidi, isStrong, dur16, prevDur16, mAccCnt, resolved,
        );

        if (score > bestScore) {
          bestScore = score;
          bestCand = c;
        }
      }
    }

    // ── 임계값 판정: score ≥ THRESHOLD → 삽입 ──
    if (bestCand && bestScore >= SCORE_THRESHOLD) {
      notes[idx] = { ...notes[idx], accidental: bestCand.accidental };
      budget--;
      measureAccCount.set(p.bar, mAccCnt + 1);
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Utility
// ────────────────────────────────────────────────────────────────

/** 주어진 방향(-1=이전, 1=다음)에서 가장 가까운 피치 음 찾기 */
function findPitched(notes: ScoreNote[], idx: number, dir: -1 | 1): ScoreNote | null {
  for (let i = idx + dir; i >= 0 && i < notes.length; i += dir) {
    if (notes[i].pitch !== 'rest') return notes[i];
  }
  return null;
}
