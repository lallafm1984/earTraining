export type NoteDuration = '1' | '1.' | '2' | '4' | '8' | '16' | '2.' | '4.' | '8.';
export type Accidental = '#' | 'b' | 'n' | '';
export type PitchName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B' | 'rest';

export type TupletType = '' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

export interface ScoreNote {
  pitch: PitchName;
  octave: number;
  accidental: Accidental;
  duration: NoteDuration;
  /** 붙임줄(타이): 직전 음표와 음높이가 같을 때 ABC `-`로 연결. 이음줄(슬러·다른 음)과 구분 */
  tie?: boolean;
  /**
   * Tuplet information — only set on the FIRST note of a tuplet group.
   * 'tuplet' = the tuplet count (3, 5, 6, 7)
   * 'tupletSpan' = the total duration the group occupies (e.g. '4' = quarter note)
   * 'tupletNoteDur' = the calculated visual duration for each note in the group (in 16ths)
   */
  tuplet?: TupletType;
  tupletSpan?: NoteDuration;
  tupletNoteDur?: number;
  id: string;
}

export interface ScoreState {
  title: string;
  keySignature: string;
  timeSignature: string;
  tempo: number;
  notes: ScoreNote[];
  bassNotes?: ScoreNote[];
  useGrandStaff?: boolean;
  /** 못갖춘마디(anacrusis) 박수, 16분음표 단위. 0 또는 미정의 = 없음 */
  pickupSixteenths?: number;
  /** 붙임줄 비활성화 — 중급 2단계 미만 난이도에서 박 경계 분할·타이 생성 금지 */
  disableTies?: boolean;
  /** 한 줄(시스템)당 마디 수. 미정의면 ABC 생성 시 밀도 기준 2~4마디, WebView는 ABCJS 자동 줄바꿈 */
  barsPerStaff?: number;
}

// ────────────────────────────────────────────────────────────────
// Duration utilities
// ────────────────────────────────────────────────────────────────

/**
 * Parses duration to the number of 16th notes.
 */
export function durationToSixteenths(dur: NoteDuration): number {
  switch (dur) {
    case '1': return 16;
    case '1.': return 24;
    case '2': return 8;
    case '2.': return 12;
    case '4': return 4;
    case '4.': return 6;
    case '8': return 2;
    case '8.': return 3;
    case '16': return 1;
    default: return 4;
  }
}

/** 16분음표 수 -> NoteDuration (잇단음표용 쉼표 생성 등) */
export const SIXTEENTHS_TO_DURATION: [number, NoteDuration][] = [
  [24, '1.'], [16, '1'], [12, '2.'], [8, '2'], [6, '4.'], [4, '4'], [3, '8.'], [2, '8'], [1, '16'],
];

/** 16분음표 수 → NoteDuration Record (빠른 조회용) */
export const SIXTEENTHS_TO_DUR: Record<number, NoteDuration> = {
  24: '1.', 16: '1', 12: '2.', 8: '2', 6: '4.', 4: '4', 3: '8.', 2: '8', 1: '16',
};

export function sixteenthsToDuration(sixteenths: number): NoteDuration {
  const found = SIXTEENTHS_TO_DURATION.find(([s]) => s <= sixteenths);
  return found ? found[1] : '16';
}

/**
 * Returns the maximum 16th notes per bar based on time signature.
 */
export function getSixteenthsPerBar(timeSignature: string): number {
  const [topStr, bottomStr] = timeSignature.split('/');
  const top = parseInt(topStr, 10);
  const bottom = parseInt(bottomStr, 10);
  if (!top || !bottom) return 16;
  return top * (16 / bottom);
}

/**
 * 총 길이와 못갖춘마디(P)로 각 마디의 16분음표 길이를 구한다.
 * - P=0: 전부 B(완전마디)씩, 마지막만 remainder.
 * - P>0, total%B===0: 약동 상쇄 — 첫 마디 P, 마지막은 B-P, 가운데는 B.
 * - P>0, total%B===P: 약동 후 정수 마디로 끝 — 첫 P, 이후 모두 완전마디.
 * - 그 외: 첫 마디 P 후 균등 분할.
 */
function computeBarLengthsFromTotal(
  totalSixteenths: number,
  sixteenthsPerBar: number,
  pickupSixteenths: number,
): number[] {
  if (totalSixteenths <= 0) return [];
  const B = sixteenthsPerBar;
  const P = pickupSixteenths;

  if (P <= 0) {
    const lengths: number[] = [];
    let rem = totalSixteenths;
    while (rem > 0) {
      const len = rem >= B ? B : rem;
      lengths.push(len);
      rem -= len;
    }
    return lengths;
  }

  if (totalSixteenths <= P) {
    return [totalSixteenths];
  }

  const remClass = totalSixteenths % B;

  if (remClass === P) {
    const lengths: number[] = [];
    let pos = 0;
    lengths.push(P);
    pos = P;
    while (pos < totalSixteenths) {
      const r = totalSixteenths - pos;
      const next = r >= B ? B : r;
      lengths.push(next);
      pos += next;
    }
    return lengths;
  }

  if (remClass === 0) {
    const lengths: number[] = [];
    let pos = 0;
    lengths.push(P);
    pos += P;
    while (pos < totalSixteenths) {
      const remaining = totalSixteenths - pos;
      if (remaining <= B - P) {
        lengths.push(remaining);
        break;
      }
      lengths.push(B);
      pos += B;
    }
    return lengths;
  }

  const lengths: number[] = [];
  let pos = 0;
  lengths.push(P);
  pos += P;
  while (pos < totalSixteenths) {
    const r = totalSixteenths - pos;
    const next = r >= B ? B : r;
    lengths.push(next);
    pos += next;
  }
  return lengths;
}

function barGlobalStarts(barLengths: number[]): number[] {
  const s: number[] = [];
  let acc = 0;
  for (let i = 0; i < barLengths.length; i++) {
    s.push(acc);
    acc += barLengths[i];
  }
  return s;
}

function getBarIndexAndLocal(globalPos: number, barLengths: number[]): { bi: number; local: number } {
  let g = 0;
  for (let i = 0; i < barLengths.length; i++) {
    const L = barLengths[i];
    if (globalPos < g + L) {
      return { bi: i, local: globalPos - g };
    }
    g += L;
  }
  const last = barLengths.length - 1;
  return { bi: last, local: barLengths[last] };
}

// ────────────────────────────────────────────────────────────────
// Tuplet utilities
// ────────────────────────────────────────────────────────────────

/**
 * 잇단음표 법칙에 따라 개별 음표의 시각적 길이(16분음표 단위)를 계산합니다.
 *
 * ABC 표기법 (p:q:r): 각 음표 표기 길이 = span/q
 *
 * -- 일반음표 (span이 2^n) --
 * 3연: (3:2:3) q=2, written=span/2
 * 5연: (5:4:5) q=4, written=span/4
 * 6연: (6:4:6) q=4, written=span/4
 * 7연: (7:4:7) q=4, written=span/4
 *
 * -- 점음표 (span이 3x2^n) --
 * 2연: (2:3:2) q=3, written=span/3
 * 4연: (4:6:4) q=6, written=span/6
 * 5연: (5:6:5) q=6, written=span/6
 * 7연: (7:6:7) q=6, written=span/6
 * 8연: (8:6:8) q=6, written=span/6
 */
export function getTupletNoteDuration(tupletType: TupletType, spanDuration: NoteDuration): number {
  const spanSixteenths = durationToSixteenths(spanDuration);
  const isDotted = (spanDuration as string).includes('.');

  switch (tupletType) {
    case '2': return Math.max(1, Math.floor(spanSixteenths / 3));
    case '3': return Math.max(1, Math.floor(spanSixteenths / 2));
    case '4': return Math.max(1, Math.floor(spanSixteenths / 6));
    case '5': return isDotted
      ? Math.max(1, Math.floor(spanSixteenths / 6))
      : Math.max(1, Math.floor(spanSixteenths / 4));
    case '6': return Math.max(1, Math.floor(spanSixteenths / 4));
    case '7': return isDotted
      ? Math.max(1, Math.floor(spanSixteenths / 6))
      : Math.max(1, Math.floor(spanSixteenths / 4));
    case '8': return Math.max(1, Math.floor(spanSixteenths / 6));
    default:  return spanSixteenths;
  }
}

/**
 * 잇단음표의 실제 차지하는 시간(16분음표 기준)을 계산합니다.
 */
export function getTupletActualSixteenths(tupletType: TupletType, spanDuration: NoteDuration): number {
  return durationToSixteenths(spanDuration);
}

/**
 * 해당 음표 길이(span)에 적용 가능한 잇단음표 종류를 반환합니다.
 *
 * 일반음표: 3연, 5연, 6연, 7연
 * 점음표:   2연, 4연, 5연, 7연, 8연  (4연부터는 점4분(6) 이상)
 */
export function getValidTupletTypesForDuration(spanDuration: NoteDuration): TupletType[] {
  const span = durationToSixteenths(spanDuration);
  const isDotted = (spanDuration as string).includes('.');

  if (isDotted) {
    const result: TupletType[] = ['2'];
    if (span >= 6) result.push('4', '5', '7', '8');
    return result;
  } else {
    const result: TupletType[] = [];
    if (span >= 2) result.push('3');
    if (span >= 4) result.push('5', '6', '7');
    return result;
  }
}

// ────────────────────────────────────────────────────────────────
// Beam group utilities
// ────────────────────────────────────────────────────────────────

/**
 * 박자표에 따른 beam(꼬리 묶음) 그룹 크기를 16분음표 단위로 반환.
 * 6/8, 9/8, 12/8 등 복합 박자는 점4분(3x8분) 단위로,
 * 단순 박자는 한 박 단위로 묶는다.
 */
export function getBeamGroupSixteenths(timeSignature: string): number {
  const [topStr, bottomStr] = timeSignature.split('/');
  const top = parseInt(topStr, 10);
  const bottom = parseInt(bottomStr, 10);
  if (bottom === 8 && top % 3 === 0 && top >= 6) {
    return 6;
  }
  return 16 / bottom;
}

/** 복합 박자 판별 (6/8, 9/8, 12/8 등) */
function isCompoundMeter(timeSignature: string): boolean {
  const [topStr, bottomStr] = timeSignature.split('/');
  const top = parseInt(topStr, 10);
  const bottom = parseInt(bottomStr, 10);
  return bottom === 8 && top % 3 === 0 && top >= 6;
}

/**
 * 마디 내에서 beam이 끊어져야 하는 위치들을 16분음표 단위로 반환.
 * - 홑박자: 각 박 경계
 * - 겹박자: 점4분 박 경계
 * - 비대칭 박자(5/8, 7/8): 그룹 패턴에 따라
 */
function getBeamBreakPoints(timeSignature: string): number[] {
  const sixteenthsPerBar = getSixteenthsPerBar(timeSignature);
  const [topStr, bottomStr] = timeSignature.split('/');
  const top = parseInt(topStr, 10);
  const bottom = parseInt(bottomStr, 10);

  if (isCompoundMeter(timeSignature)) {
    // 겹박자: 점4분(6 sixteenths) 단위로 끊기
    const points: number[] = [];
    for (let i = 6; i < sixteenthsPerBar; i += 6) points.push(i);
    return points;
  }

  // 비대칭 박자 (5/8 = 3+2, 7/8 = 2+2+3)
  if (bottom === 8 && top === 5) {
    return [6]; // 3+2 = 6 sixteenths + 4 sixteenths
  }
  if (bottom === 8 && top === 7) {
    return [4, 8]; // 2+2+3 = 4+4+6 sixteenths
  }

  // 홑박자: 한 박 단위로 끊기
  const beatSize = 16 / bottom;
  const points: number[] = [];
  for (let i = beatSize; i < sixteenthsPerBar; i += beatSize) points.push(i);
  return points;
}

// ────────────────────────────────────────────────────────────────
// Scale degree utilities
// ────────────────────────────────────────────────────────────────

const PITCH_NAMES_ORDER: PitchName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * 조표에서 음계 구성음(7도)을 자동 생성.
 * KEY_SIG_MAP에 의존하지 않고 루트 음이름만으로 순서를 결정.
 * 변화음(#/b)은 조표 엔진이 처리하므로 여기선 음이름만 반환.
 *
 * 예: 'E' → ['E','F','G','A','B','C','D']
 *     'Bb' → ['B','C','D','E','F','G','A']
 *     'F#m' → ['F','G','A','B','C','D','E']
 */
export function getScaleDegrees(keySignature: string): PitchName[] {
  const rootLetter = keySignature.charAt(0) as PitchName;
  const rootIdx = PITCH_NAMES_ORDER.indexOf(rootLetter);
  if (rootIdx === -1) return [...PITCH_NAMES_ORDER]; // fallback: C major
  const result: PitchName[] = [];
  for (let i = 0; i < 7; i++) {
    result.push(PITCH_NAMES_ORDER[(rootIdx + i) % 7]);
  }
  return result;
}

/**
 * 렌더러용 ABC 표기 음계 생성 (1옥타브 8음: 7도 + 상위 으뜸음).
 *
 * 시작 옥타브 선택:
 * - 장조: 루트 A 이상 → 옥타브 3 (콤마 표기), 그 외 → 옥타브 4
 * - 단조: 루트 F 이상 → 옥타브 3, 그 외 → 옥타브 4
 *
 * ABC 표기: 대문자=옥타브4, 소문자=옥타브5, 콤마(,)=옥타브3
 *
 * 예: 'C'  → ['C','D','E','F','G','A','B','c']
 *     'G'  → ['G','A','B','c','d','e','f','g']
 *     'Am' → ['A,','B,','C','D','E','F','G','A']
 *     'Gm' → ['G,','A,','B,','C','D','E','F','G']
 */
export function generateAbcScaleNotes(keySignature: string): string[] {
  const scale = getScaleDegrees(keySignature);
  const isMinor = keySignature.endsWith('m');
  const rootIdx = PITCH_NAMES_ORDER.indexOf(scale[0]);

  // 장조: A(idx 5) 이상 → 옥타브 3, 단조: F(idx 3) 이상 → 옥타브 3
  const lowThreshold = isMinor ? 3 : 5;
  let octave = rootIdx >= lowThreshold ? 3 : 4;

  // 화성단음계: 7번째 음(index 6) 올림 처리를 위한 접두사 결정
  let seventhPrefix = '';
  if (isMinor) {
    const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
    const FLAT_KEYS: Record<string, number> = {
      'Dm': 1, 'Gm': 2, 'Cm': 3, 'Fm': 4, 'Bbm': 5, 'Ebm': 6, 'Abm': 7
    };
    const numFlats = FLAT_KEYS[keySignature] || 0;
    const flattedNotes = FLAT_ORDER.slice(0, numFlats);
    const seventhDegree = scale[6];
    seventhPrefix = flattedNotes.includes(seventhDegree) ? '=' : '^';
  }

  const result: string[] = [];
  for (let i = 0; i <= 7; i++) {
    const pitch = scale[i % 7];
    if (i > 0) {
      const prev = scale[(i - 1) % 7];
      if (PITCH_NAMES_ORDER.indexOf(pitch) <= PITCH_NAMES_ORDER.indexOf(prev)) {
        octave++;
      }
    }
    // 화성단음계 7번째 음 접두사 추가
    const prefix = (isMinor && i === 6) ? seventhPrefix : '';
    // ABC 옥타브 표기: 3→콤마, 4→대문자, 5→소문자
    if (octave <= 3) {
      result.push(prefix + pitch + ','.repeat(4 - octave));
    } else if (octave === 4) {
      result.push(prefix + pitch);
    } else {
      result.push(prefix + pitch.toLowerCase() + "'".repeat(octave - 5));
    }
  }
  return result;
}

// ────────────────────────────────────────────────────────────────
// Key signature & accidental engine
// ────────────────────────────────────────────────────────────────

/**
 * 조표별 기본 변화음 맵.
 * K:G -> { F: '#' } (모든 F는 기본 F#)
 * K:F -> { B: 'b' } (모든 B는 기본 Bb)
 */
/**
 * 조표별 기본 변화음 맵 (샤프 추가 순서: F C G D A E B / 플랫 추가 순서: B E A D G C F)
 *
 * 자연단음계는 같은 조표를 가진 장조와 동일:
 *   Am=C, Em=G, Bm=D, F#m=A, C#m=E, G#m=B, D#m=F#
 *   Dm=F, Gm=Bb, Cm=Eb, Fm=Ab, Bbm=Db, Ebm=Gb
 */
const KEY_SIG_MAP: Record<string, Record<string, string>> = {
  // ── 샤프계 장조 ──────────────────────────────────────────────
  'C':  {},
  'G':  { F: '#' },
  'D':  { F: '#', C: '#' },
  'A':  { F: '#', C: '#', G: '#' },
  'E':  { F: '#', C: '#', G: '#', D: '#' },
  'B':  { F: '#', C: '#', G: '#', D: '#', A: '#' },
  'F#': { F: '#', C: '#', G: '#', D: '#', A: '#', E: '#' },
  'C#': { F: '#', C: '#', G: '#', D: '#', A: '#', E: '#', B: '#' },
  // ── 플랫계 장조 ──────────────────────────────────────────────
  'F':  { B: 'b' },
  'Bb': { B: 'b', E: 'b' },
  'Eb': { B: 'b', E: 'b', A: 'b' },
  'Ab': { B: 'b', E: 'b', A: 'b', D: 'b' },
  'Db': { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b' },
  'Gb': { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b', C: 'b' },
  'Cb': { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b', C: 'b', F: 'b' },
  // ── 샤프계 단조 (= 관계 장조와 동일 조표) ───────────────────
  'Am':  {},
  'Em':  { F: '#' },
  'Bm':  { F: '#', C: '#' },
  'F#m': { F: '#', C: '#', G: '#' },
  'C#m': { F: '#', C: '#', G: '#', D: '#' },
  'G#m': { F: '#', C: '#', G: '#', D: '#', A: '#' },
  'D#m': { F: '#', C: '#', G: '#', D: '#', A: '#', E: '#' },
  'A#m': { F: '#', C: '#', G: '#', D: '#', A: '#', E: '#', B: '#' },
  // ── 플랫계 단조 (= 관계 장조와 동일 조표) ───────────────────
  'Dm':  { B: 'b' },
  'Gm':  { B: 'b', E: 'b' },
  'Cm':  { B: 'b', E: 'b', A: 'b' },
  'Fm':  { B: 'b', E: 'b', A: 'b', D: 'b' },
  'Bbm': { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b' },
  'Ebm': { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b', C: 'b' },
  'Abm': { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b', C: 'b', F: 'b' },
};

/** 조표에서 특정 음이름의 기본 변화를 반환 ('' | '#' | 'b') */
export function getKeySigAlteration(keySignature: string, pitchName: string): string {
  const map = KEY_SIG_MAP[keySignature] || {};
  return map[pitchName] || '';
}

/** 조표에 표기되는 변화표 개수(난이도·임시표 밀도 보정용) */
export function getKeySignatureAccidentalCount(keySignature: string): number {
  const map = KEY_SIG_MAP[keySignature] || {};
  return Object.keys(map).length;
}

/**
 * 음표에 대해 실제 출력해야 할 ABC 임시표 접두사를 결정.
 *
 * - 조표에 의해 이미 변화된 음은 임시표 생략
 * - 같은 마디 내 이전 임시표에 의한 상태 추적
 * - 조표 기본값과 다른 변화가 필요하면 ^, _, = 출력
 *
 * 마디 상태는 음이름+옥타브별로 둔다(일반적인 엄격 조판: 임시표는 적힌 옥타브에만
 * 유효하고, 다른 옥타브의 동일 음이름에는 별도로 표기).
 *
 * @returns ABC 접두사 ('^', '_', '=', 또는 '')
 */
function resolveAbcAccidental(
  pitch: PitchName,
  octave: number,
  accidental: Accidental,
  keySignature: string,
  measureState: Map<string, string>,
): string {
  if (pitch === 'rest') return '';

  const keySigAlt = getKeySigAlteration(keySignature, pitch);
  const noteKey = `${pitch}${octave}`;

  // 이 음표가 원하는 실제 변화는?
  let desiredAlt: string;
  if (accidental === '') {
    // 명시 임시표 없음 -> 조표 기본값 사용
    desiredAlt = keySigAlt;
  } else if (accidental === 'n') {
    // 제자리표 -> 변화 없음
    desiredAlt = '';
  } else {
    // 명시 #/b
    desiredAlt = accidental;
  }

  // 현재 이 음높이의 유효 변화는? (마디 내 상태 > 조표 기본값)
  let currentAlt: string;
  if (measureState.has(noteKey)) {
    currentAlt = measureState.get(noteKey)!;
  } else {
    currentAlt = keySigAlt;
  }

  // 원하는 변화와 현재 상태가 같으면 임시표 불필요
  if (desiredAlt === currentAlt) {
    return '';
  }

  // 상태 갱신
  measureState.set(noteKey, desiredAlt);

  switch (desiredAlt) {
    case '#': return '^';
    case 'b': return '_';
    case '': return '='; // 제자리표 (조표 변화를 취소)
    default: return '';
  }
}


// ────────────────────────────────────────────────────────────────
// Enharmonic spelling
// ────────────────────────────────────────────────────────────────

/** MIDI 음높이 계산용 반음 오프셋 */
const PITCH_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

function pitchToMidi(note: ScoreNote): number {
  if (note.pitch === 'rest') return -1;
  const base = PITCH_SEMITONES[note.pitch] ?? 0;
  const accVal = note.accidental === '#' ? 1 : note.accidental === 'b' ? -1 : 0;
  return (note.octave + 1) * 12 + base + accVal;
}

// ── nn → MIDI 변환 (선율 규칙용) ──────────────────────────────
const PITCH_ORDER_UTILS: PitchName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** nn(스케일 디그리 인덱스) → MIDI 번호 변환 (조표 반영) */
export function nnToMidi(
  nn: number, scale: PitchName[], baseOctave: number, keySignature: string,
): number {
  const deg = ((nn % 7) + 7) % 7;
  const octOff = Math.floor(nn / 7);
  const pitch = scale[deg];
  const rootIdx = PITCH_ORDER_UTILS.indexOf(scale[0]);
  const pitchIdx = PITCH_ORDER_UTILS.indexOf(pitch);
  const wrap = pitchIdx < rootIdx ? 1 : 0;
  const octave = baseOctave + octOff + wrap;

  const base = PITCH_SEMITONES[pitch] ?? 0;
  const ka = getKeySigAlteration(keySignature, pitch);
  let accVal = 0;
  if (ka === '#') accVal = 1;
  else if (ka === 'b') accVal = -1;
  return (octave + 1) * 12 + base + accVal;
}

/** 두 nn 사이의 반음(semitone) 거리 (절대값) */
export function getMidiInterval(
  nn1: number, nn2: number,
  scale: PitchName[], baseOctave: number, keySignature: string,
): number {
  return Math.abs(nnToMidi(nn1, scale, baseOctave, keySignature) - nnToMidi(nn2, scale, baseOctave, keySignature));
}

/**
 * 금지 음정 여부 판별.
 * - 6반음 + 스케일 3~4도 간격 = 트라이톤/증4도/감5도
 * - 3반음 + 스케일 1도 간격 = 증2도 (화성 단음계 F-G# 등)
 */
export function isForbiddenMelodicInterval(semitoneDist: number, nnDist: number): boolean {
  // 트라이톤 (aug4 / dim5)
  if (semitoneDist === 6 && nnDist >= 3 && nnDist <= 4) return true;
  // 증2도 (harmonic minor의 6음→7음)
  if (semitoneDist === 3 && nnDist === 1) return true;
  return false;
}

/**
 * 조표를 반영한 실제 MIDI 음높이 (건반 비교·성부 충돌 검사용).
 * 명시 임시표가 없으면 조표의 #/b를 적용하고, 제자리표(n)는 조표를 무시한 자연음.
 */
export function noteToMidiWithKey(note: ScoreNote, keySignature: string): number {
  if (note.pitch === 'rest') return -1;
  const base = PITCH_SEMITONES[note.pitch] ?? 0;
  let accVal = 0;
  if (note.accidental === 'n') {
    accVal = 0;
  } else if (note.accidental === '#') {
    accVal = 1;
  } else if (note.accidental === 'b') {
    accVal = -1;
  } else {
    const ka = getKeySigAlteration(keySignature, note.pitch);
    if (ka === '#') accVal = 1;
    else if (ka === 'b') accVal = -1;
  }
  return (note.octave + 1) * 12 + base + accVal;
}

/** 조표가 샤프계열인지 플랫계열인지 반환 */
const SHARP_KEYS = new Set(['G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m']);
const FLAT_KEYS  = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm']);

function getKeySigType(keySignature: string): 'sharp' | 'flat' | 'none' {
  if (SHARP_KEYS.has(keySignature)) return 'sharp';
  if (FLAT_KEYS.has(keySignature))  return 'flat';
  return 'none';
}

/** 흑건 음 이명동음 변환표 (# → b) */
const ENHARMONIC_TO_FLAT: Partial<Record<PitchName, { pitch: PitchName; acc: Accidental }>> = {
  C: { pitch: 'D', acc: 'b' }, // C# → Db
  D: { pitch: 'E', acc: 'b' }, // D# → Eb
  F: { pitch: 'G', acc: 'b' }, // F# → Gb
  G: { pitch: 'A', acc: 'b' }, // G# → Ab
  A: { pitch: 'B', acc: 'b' }, // A# → Bb
};

/** 흑건 음 이명동음 변환표 (b → #) */
const ENHARMONIC_TO_SHARP: Partial<Record<PitchName, { pitch: PitchName; acc: Accidental }>> = {
  D: { pitch: 'C', acc: '#' }, // Db → C#
  E: { pitch: 'D', acc: '#' }, // Eb → D#
  G: { pitch: 'F', acc: '#' }, // Gb → F#
  A: { pitch: 'G', acc: '#' }, // Ab → G#
  B: { pitch: 'A', acc: '#' }, // Bb → A#
};

/** 단일 음표의 이명동음 표기를 preferFlat에 따라 변환 */
function normalizeEnharmonic(note: ScoreNote, preferFlat: boolean): ScoreNote {
  if (note.pitch === 'rest') return note;
  if (note.accidental === '#' && preferFlat) {
    const flat = ENHARMONIC_TO_FLAT[note.pitch];
    if (flat) return { ...note, pitch: flat.pitch, accidental: flat.acc };
  } else if (note.accidental === 'b' && !preferFlat) {
    const sharp = ENHARMONIC_TO_SHARP[note.pitch];
    if (sharp) return { ...note, pitch: sharp.pitch, accidental: sharp.acc };
  }
  return note;
}

/**
 * 이명동음 선택 전처리.
 * 우선순위: 조표 방향 > 선율 방향 > 기본값(♯ 선호)
 * 조표에 이미 포함된 변화음은 변환하지 않음.
 */
function applyEnharmonicSpelling(notes: ScoreNote[], keySignature: string): ScoreNote[] {
  const keySigType = getKeySigType(keySignature);

  return notes.map((note, i) => {
    if (note.pitch === 'rest') return note;
    if (note.accidental !== '#' && note.accidental !== 'b') return note;

    // 조표에 이미 포함된 변화음은 그대로 유지
    const keySigMap = KEY_SIG_MAP[keySignature] || {};
    if (keySigMap[note.pitch] === note.accidental) return note;

    // 선율 방향 판별 (다음 비-쉼표 음 기준)
    const prevNote = (() => {
      for (let j = i - 1; j >= 0; j--) {
        if (notes[j].pitch !== 'rest') return notes[j];
      }
      return null;
    })();
    const nextNote = (() => {
      for (let j = i + 1; j < notes.length; j++) {
        if (notes[j].pitch !== 'rest') return notes[j];
      }
      return null;
    })();

    let direction: 'up' | 'down' | 'none' = 'none';
    const currMidi = pitchToMidi(note);
    if (nextNote) {
      const nextMidi = pitchToMidi(nextNote);
      direction = nextMidi > currMidi ? 'up' : nextMidi < currMidi ? 'down' : 'none';
    } else if (prevNote) {
      const prevMidi = pitchToMidi(prevNote);
      direction = currMidi > prevMidi ? 'up' : currMidi < prevMidi ? 'down' : 'none';
    }

    // 조표 방향 우선, 없으면 선율 방향, 그것도 없으면 ♯ 선호
    let preferFlat: boolean;
    if (keySigType === 'flat') {
      preferFlat = true;
    } else if (keySigType === 'sharp') {
      preferFlat = false;
    } else {
      preferFlat = direction === 'down';
    }

    return normalizeEnharmonic(note, preferFlat);
  });
}

// ────────────────────────────────────────────────────────────────
// Beat visibility: 필수 박 경계에서 음표 분할
// ────────────────────────────────────────────────────────────────

/**
 * 4/4에서 필수 경계: 마디 중앙(beat 3 = 8 sixteenths)
 * 3/4에서 필수 경계: 각 박 (길이가 1박 초과인 경우만)
 * 6/8에서 필수 경계: 점4분 박 경계
 */
function getMandatoryBoundaries(timeSignature: string): number[] {
  const sixteenthsPerBar = getSixteenthsPerBar(timeSignature);
  const [topStr, bottomStr] = timeSignature.split('/');
  const top = parseInt(topStr, 10);
  const bottom = parseInt(bottomStr, 10);

  if (timeSignature === '4/4' || timeSignature === 'C') {
    return [8]; // 마디 중앙만 필수
  }

  // 3/4: 3박 시작점만 필수 — 1박(홀수 박)에서 시작하는 점4분 허용, 2박+3박 합치기만 금지
  if (timeSignature === '3/4') {
    return [8];
  }

  // 2박자(2/4, 2/2 등): 필수 경계 없음 — 마디 전체를 채우는 음가 허용
  if (top === 2) {
    return [];
  }

  if (isCompoundMeter(timeSignature)) {
    const points: number[] = [];
    for (let i = 6; i < sixteenthsPerBar; i += 6) points.push(i);
    return points;
  }

  // 홑박자: 각 박 경계
  const beatSize = 16 / bottom;
  const points: number[] = [];
  for (let i = beatSize; i < sixteenthsPerBar; i += beatSize) points.push(i);
  return points;
}

/**
 * 16분음표 수에 정확히 대응하는 NoteDuration을 찾는다.
 * 정확한 매치가 없으면 가장 큰 들어맞는 값을 반환.
 */
function findExactDuration(sixteenths: number): NoteDuration | null {
  for (const [s, d] of SIXTEENTHS_TO_DURATION) {
    if (s === sixteenths) return d;
  }
  return null;
}

/** 음표 스트림 총 길이(16분음표). 잇단음표는 span 기준. */
function sumScoreNotesSixteenths(notes: ScoreNote[]): number {
  let sum = 0;
  let tupletRemaining = 0;
  let tupletSpanAcc = 0;
  for (const note of notes) {
    if (note.tuplet && tupletRemaining === 0) {
      tupletRemaining = parseInt(note.tuplet, 10);
      tupletSpanAcc = getTupletActualSixteenths(
        note.tuplet, note.tupletSpan || note.duration,
      );
    }
    if (tupletRemaining > 0) {
      tupletRemaining--;
      if (tupletRemaining === 0) sum += tupletSpanAcc;
    } else {
      sum += durationToSixteenths(note.duration);
    }
  }
  return sum;
}

/**
 * 박 가시성 규칙에 따라 필수 박 경계를 넘는 음표를 분할.
 * 같은 음이 이어지는 조각은 붙임줄(타이)로 `tie: true` → ABC `-` 출력.
 *
 * 예: 4/4에서 2박~4박을 차지하는 점2분음표 →
 *     2분음표(beat 2-3) + 4분음표(beat 3-4) 로 분할, 조각 간 붙임줄
 *
 * 잇단음표 그룹 내부는 분할하지 않음.
 * pickupSixteenths>0 이면 마디 길이 배열로 경계를 잡는다(못갖춘마디).
 */
export function splitAtBeatBoundaries(
  notes: ScoreNote[],
  timeSignature: string,
  pickupSixteenths = 0,
): ScoreNote[] {
  const B = getSixteenthsPerBar(timeSignature);
  const total = sumScoreNotesSixteenths(notes);
  const barLengths = computeBarLengthsFromTotal(total, B, pickupSixteenths);
  if (barLengths.length === 0) return notes;

  const mandatoryAll = getMandatoryBoundaries(timeSignature);

  // 점음표용: 모든 박 경계 (§1.2 — 점음표는 박 경계를 가리면 안 됨)
  const [, _btm] = timeSignature.split('/');
  const _beatSize = isCompoundMeter(timeSignature) ? 6 : 16 / (parseInt(_btm, 10) || 4);
  const allBeatBounds: number[] = [];
  for (let i = _beatSize; i < B; i += _beatSize) allBeatBounds.push(i);

  if (mandatoryAll.length === 0 && allBeatBounds.length === 0) return notes;

  const barStarts = barGlobalStarts(barLengths);
  const result: ScoreNote[] = [];
  let globalPos = 0;
  let tupletRemaining = 0;
  let tupletSpanSixteenths = 0;

  for (const note of notes) {
    if (note.tuplet) {
      const p = parseInt(note.tuplet, 10);
      tupletRemaining = p;
      tupletSpanSixteenths = getTupletActualSixteenths(
        note.tuplet, note.tupletSpan || note.duration,
      );
    }

    if (tupletRemaining > 0) {
      result.push(note);
      tupletRemaining--;
      if (tupletRemaining === 0) {
        globalPos += tupletSpanSixteenths;
      }
      continue;
    }

    const dur = durationToSixteenths(note.duration);
    const noteStart = globalPos;
    const noteEnd = noteStart + dur;

    if (note.pitch === 'rest') {
      result.push(note);
      globalPos = noteEnd;
      continue;
    }

    const splitGlobals = new Set<number>();
    let traverse = noteStart;
    while (traverse < noteEnd) {
      const { bi, local: locStart } = getBarIndexAndLocal(traverse, barLengths);
      const barLen = barLengths[bi];
      const barGStart = barStarts[bi];
      const barGEnd = barGStart + barLen;
      const chunkEnd = Math.min(noteEnd, barGEnd);

      const locEnd = chunkEnd - barGStart;

      // 필수 경계 (모든 음표 공통)
      // 마디 전체를 채우는 음표(locStart=0, locEnd=barLen)는 면제 (3/4 점2분 등)
      if (!(locStart === 0 && locEnd === barLen)) {
        const mandInBar = mandatoryAll.filter(
          (b) => b < barLen && b > locStart && b < locEnd,
        );
        for (const b of mandInBar) {
          splitGlobals.add(barGStart + b);
        }
      }

      // 박 사이 시작: 모든 박 경계에서 분할 (§1 당김음 규칙 + §1.2 점음표)
      // 박 중간에서 시작해 다음 박으로 넘어가는 음은 붙임줄로 분할
      if (locStart % _beatSize !== 0) {
        const offBeatBounds = allBeatBounds.filter(
          (b) => b < barLen && b > locStart && b < locEnd,
        );
        for (const b of offBeatBounds) {
          splitGlobals.add(barGStart + b);
        }
      }

      // 정박 시작 점음표 분할 (§1.2 확장): 단순박자에서 한 박을 초과하는 점음표는
      // 박 경계에서 분할 — 4/4의 ♩.(6)→♩+♪, 3/4의 ♩.(6)→♩+♪ 등
      // ♩♩(half=8): 8%beatSize=0 이므로 조건 불충족 → 분할 안 됨
      if (locStart % _beatSize === 0) {
        const segLen = locEnd - locStart;
        if (segLen > _beatSize && segLen % _beatSize !== 0) {
          const onBeatDottedSplits = allBeatBounds.filter(
            (b) => b < barLen && b > locStart && b < locEnd,
          );
          for (const b of onBeatDottedSplits) {
            splitGlobals.add(barGStart + b);
          }
        }
      }

      if (chunkEnd < noteEnd) {
        splitGlobals.add(chunkEnd);
      }
      traverse = chunkEnd;
    }

    const sortedSplits = [...splitGlobals].sort((a, b) => a - b);

    if (sortedSplits.length === 0) {
      result.push(note);
      globalPos = noteEnd;
      continue;
    }

    let currentStart = noteStart;
    const splitPoints = [...sortedSplits, noteEnd];
    let segIndex = 0;
    const segments: ScoreNote[] = [];

    for (const segEnd of splitPoints) {
      if (segEnd <= currentStart) continue;
      const segDur = segEnd - currentStart;
      const segDuration = findExactDuration(segDur);
      if (!segDuration) {
        segments.length = 0;
        break;
      }
      const isLastSeg = segEnd >= noteEnd;
      const needsTie = !isLastSeg || (note.tie ?? false);
      segments.push({
        ...note,
        duration: segDuration,
        tie: needsTie,
        tuplet: undefined as unknown as TupletType,
        tupletSpan: undefined,
        tupletNoteDur: undefined,
        id: segIndex === 0 ? note.id : `${note.id}_s${segIndex}`,
      });
      segIndex++;
      currentStart = segEnd;
    }

    if (segments.length === 0) {
      result.push(note);
    } else {
      for (const s of segments) result.push(s);
    }

    globalPos = noteEnd;
  }

  return result;
}

// ────────────────────────────────────────────────────────────────
// Pitch -> ABC conversion
// ────────────────────────────────────────────────────────────────

/**
 * 음높이를 ABC 표기로 변환.
 * - 대문자 = C4~B4 옥타브
 * - 소문자 = c5~b5 옥타브
 * - 콤마(,) = 옥타브 아래, 어포스트로피(') = 옥타브 위
 *
 * accidentalPrefix는 외부에서 resolveAbcAccidental로 결정하여 전달.
 */
function pitchToAbc(pitch: string, octave: number, accidentalPrefix: string): string {
  if (pitch === 'rest') return 'z';
  let s = accidentalPrefix;

  if (octave <= 2) {
    s += pitch + ',' + ','.repeat(3 - octave);
  } else if (octave === 3) {
    s += pitch + ',';
  } else if (octave === 4) {
    s += pitch;
  } else if (octave === 5) {
    s += pitch.toLowerCase();
  } else if (octave >= 6) {
    s += pitch.toLowerCase() + "'".repeat(octave - 5);
  }
  return s;
}

// ────────────────────────────────────────────────────────────────
// Last-measure tie merge
// ────────────────────────────────────────────────────────────────

/**
 * 마지막 마디 내 연속된 동일 음표를 하나로 합산.
 * splitAtBeatBoundaries가 마지막 마디의 박 경계에서 분할한 조각들을 원본 음가로 복원.
 * (붙임줄·타이로 연결된 동일 음만 합산)
 * 연속 쉼표도 길이를 합쳐 한 덩어리로 두어, ABC에 z가 잇달아 나오는 것을 막는다.
 *
 * 예) 4/4에서 점2분음표 → C8- C4 ⟹ C12 (점2분)
 */
function mergeTiedNotesInLastMeasure(
  notes: ScoreNote[],
  timeSignature: string,
  pickupSixteenths = 0,
): ScoreNote[] {
  if (notes.length === 0) return notes;

  const B = getSixteenthsPerBar(timeSignature);
  const total = sumScoreNotesSixteenths(notes);
  const barLengths = computeBarLengthsFromTotal(total, B, pickupSixteenths);
  if (barLengths.length === 0) return notes;

  const lastBarLen = barLengths[barLengths.length - 1];
  const lastMeasureStartGlobal = total - lastBarLen;

  let cum = 0;
  let lastMeasureStartIdx = 0;
  let tupletRemaining = 0;
  let tupletSpanAcc = 0;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    let dur = 0;

    if (note.tuplet && tupletRemaining === 0) {
      tupletRemaining = parseInt(note.tuplet, 10);
      tupletSpanAcc = getTupletActualSixteenths(note.tuplet, note.tupletSpan || note.duration);
    }
    if (tupletRemaining > 0) {
      tupletRemaining--;
      if (tupletRemaining === 0) dur = tupletSpanAcc;
    } else {
      dur = durationToSixteenths(note.duration);
    }

    if (cum >= lastMeasureStartGlobal) {
      lastMeasureStartIdx = i;
      break;
    }
    cum += dur;
  }

  const beforeLast = notes.slice(0, lastMeasureStartIdx);
  const lastMeasure = notes.slice(lastMeasureStartIdx);

  // 마지막 마디에서 연속된 동일 음 합산 (붙임줄 여부 무관)
  const merged: ScoreNote[] = [];
  let i = 0;
  while (i < lastMeasure.length) {
    const note = lastMeasure[i];

    if (note.tuplet) {
      merged.push(note);
      i++;
      continue;
    }

    if (note.pitch === 'rest') {
      let totalDur = durationToSixteenths(note.duration);
      let j = i + 1;
      while (j < lastMeasure.length) {
        const next = lastMeasure[j];
        if (!next.tuplet && next.pitch === 'rest') {
          totalDur += durationToSixteenths(next.duration);
          j++;
        } else {
          break;
        }
      }
      const mergedDur = findExactDuration(totalDur) ?? sixteenthsToDuration(totalDur);
      merged.push({ ...note, duration: mergedDur, id: note.id });
      i = j;
      continue;
    }

    // 연속된 동일 음 탐색 (pitch + octave + accidental 일치)
    let totalDur = durationToSixteenths(note.duration);
    let j = i + 1;

    while (j < lastMeasure.length) {
      const next = lastMeasure[j];
      if (
        !next.tuplet &&
        next.pitch === note.pitch &&
        next.octave === note.octave &&
        next.accidental === note.accidental
      ) {
        totalDur += durationToSixteenths(next.duration);
        j++;
      } else {
        break;
      }
    }

    if (j > i + 1) {
      const mergedDur = findExactDuration(totalDur) ?? sixteenthsToDuration(totalDur);
      const lastTie = lastMeasure[j - 1].tie ?? false;
      merged.push({ ...note, duration: mergedDur, tie: lastTie });
      i = j;
    } else {
      merged.push(note);
      i++;
    }
  }

  return [...beforeLast, ...merged];
}

// ────────────────────────────────────────────────────────────────
// Intra-measure tied note merge
// ────────────────────────────────────────────────────────────────

/**
 * 마디 내 붙임줄(타이)로 연결된 동일 음을 하나의 음표로 합산.
 *
 * - 합산 후 음가가 표준 음가(SIXTEENTHS_TO_DUR)에 존재해야 함
 * - 합산 음표가 필수 박 경계(mandatory boundary)를 넘으면 병합 중단
 * - 음표 시작이 박 위(on-beat)이면 일반 박 경계를 넘어도 허용 (점음표 복원)
 * - 음표 시작이 박 사이(off-beat)이면 다음 박 경계를 넘으면 병합 중단 (엇박 보존)
 *
 * 예) 4/4에서 g4- g2 → g6 (점4분), g1- g1 → g2 (8분, 박 내 동일 위치)
 */
function mergeAdjacentTiedNotes(
  notes: ScoreNote[],
  timeSignature: string,
  pickupSixteenths = 0,
): ScoreNote[] {
  const B = getSixteenthsPerBar(timeSignature);
  const total = sumScoreNotesSixteenths(notes);
  const barLengths = computeBarLengthsFromTotal(total, B, pickupSixteenths);

  const beatSize = isCompoundMeter(timeSignature)
    ? 6
    : 16 / (parseInt(timeSignature.split('/')[1] ?? '4', 10) || 4);
  const mandatoryBounds = getMandatoryBoundaries(timeSignature);
  const allBeatBoundsInBar: number[] = [];
  for (let b = beatSize; b < B; b += beatSize) allBeatBoundsInBar.push(b);

  const result: ScoreNote[] = [];
  let globalPos = 0;
  let tupletRemaining = 0;
  let tupletSpanSixteenths = 0;
  let i = 0;

  while (i < notes.length) {
    const note = notes[i];

    if (note.tuplet && tupletRemaining === 0) {
      tupletRemaining = parseInt(note.tuplet, 10);
      tupletSpanSixteenths = getTupletActualSixteenths(note.tuplet, note.tupletSpan || note.duration);
    }
    if (tupletRemaining > 0) {
      result.push(note);
      tupletRemaining--;
      if (tupletRemaining === 0) globalPos += tupletSpanSixteenths;
      i++;
      continue;
    }

    const dur = durationToSixteenths(note.duration);

    // 붙임줄이 있고 쉼표가 아닐 때만 합산 시도
    if (note.tie && note.pitch !== 'rest' && i + 1 < notes.length) {
      const { bi, local: localPos } = getBarIndexAndLocal(globalPos, barLengths);
      const barLen = barLengths[bi] ?? B;
      const offBeat = localPos % beatSize !== 0;

      let accDur = dur;
      let lastTie: boolean = note.tie;
      let j = i + 1;

      while (j < notes.length && lastTie) {
        const next = notes[j];
        if (
          next.tuplet ||
          next.pitch !== note.pitch ||
          next.octave !== note.octave ||
          next.accidental !== note.accidental
        ) break;

        const nextDur = durationToSixteenths(next.duration);
        const totalDur = accDur + nextDur;
        const candidateDur = SIXTEENTHS_TO_DUR[totalDur];
        // 점음표로 합산되면 박자 위치가 불명확해져 귀 훈련에 불리 → 병합 중단
        if (!candidateDur || candidateDur.endsWith('.')) break;

        const mergeEnd = localPos + totalDur;
        if (mergeEnd > barLen) break;
        if (mandatoryBounds.some(mb => localPos < mb && mergeEnd > mb)) break;
        // 엇박 시작: 다음 박 경계를 넘으면 싱코페이션 → 병합 중단
        if (offBeat && allBeatBoundsInBar.some(bb => localPos < bb && mergeEnd > bb)) break;

        accDur = totalDur;
        lastTie = next.tie ?? false;
        j++;
      }

      if (j > i + 1) {
        result.push({ ...note, duration: SIXTEENTHS_TO_DUR[accDur], tie: lastTie });
        globalPos += accDur;
        i = j;
        continue;
      }
    }

    result.push(note);
    globalPos += dur;
    i++;
  }

  return result;
}

// ────────────────────────────────────────────────────────────────
// Rest decomposition
// ────────────────────────────────────────────────────────────────

/**
 * 쉼표 ABC 문자열 배열을 생성. 점쉼표 금지 규칙 적용.
 *
 * - 온마디 쉼표(barPosition=0, dur=bar): ['Z']
 * - 홑박자: 점쉼표 금지, 박 경계에서 분리 (사용 단위: 16,8,4,2,1)
 * - 겹박자: 점4분쉼표 허용, 점8분쉼표 금지 (사용 단위: 12,6,2,1) (§4)
 */
function generateRestAbc(
  durationSixteenths: number,
  timeSignature: string,
  barPosition: number,
): string[] {
  const sixteenthsPerBar = getSixteenthsPerBar(timeSignature);

  if (barPosition === 0 && durationSixteenths === sixteenthsPerBar) {
    return ['Z'];
  }

  const result: string[] = [];
  let remaining = durationSixteenths;
  let pos = barPosition;

  if (isCompoundMeter(timeSignature)) {
    // 겹박자: 점4분쉼표(6)만 허용, 점8분쉼표(3) 금지 → 8분+16분으로 분할 (§4)
    const units = [12, 6, 2, 1];
    while (remaining > 0) {
      let fitted = false;
      for (const u of units) {
        if (u <= remaining) {
          result.push(u === 1 ? 'z' : `z${u}`);
          remaining -= u;
          fitted = true;
          break;
        }
      }
      if (!fitted) break;
    }
  } else {
    // 홑박자: 점쉼표 금지, 박 경계 넘지 않도록 분리
    const [, bottomStr] = timeSignature.split('/');
    const bottom = parseInt(bottomStr, 10) || 4;
    const beatSize = 16 / bottom;
    const units = [16, 8, 4, 2, 1]; // 점음표 제외

    while (remaining > 0) {
      const posInBeat = pos % beatSize;
      let fitted = false;
      for (const u of units) {
        if (u > remaining) continue;
        // 박 경계에 있으면 어느 크기든 OK (음표는 모두 2^n)
        // 박 중간이면 현재 박 안에 들어맞아야 함
        if (posInBeat !== 0 && u > beatSize - posInBeat) continue;
        result.push(u === 1 ? 'z' : `z${u}`);
        remaining -= u;
        pos += u;
        fitted = true;
        break;
      }
      if (!fitted) break;
    }
  }

  return result;
}

// ────────────────────────────────────────────────────────────────
// Notes -> ABC string (핵심 파이프라인)
// ────────────────────────────────────────────────────────────────

/**
 * ScoreNote 배열을 ABC 문자열로 변환.
 *
 * 파이프라인:
 * 1. 박 가시성 규칙 적용 (splitAtBeatBoundaries)
 * 1.5. 엇박 아닌 붙임줄 합산 (mergeAdjacentTiedNotes)
 * 2. 임시표 자동 적용 (resolveAbcAccidental — 마디 내 상태 추적)
 * 3. beam 그룹 결정 (공백 배치)
 * 4. 온마디 쉼표 처리 (Z)
 */
function generateNotesAbc(
  notes: ScoreNote[],
  timeSignature: string,
  keySignature: string = 'C',
  pickupSixteenths = 0,
  disableTies = false,
  editorMode = false,
): string {
  if (notes.length === 0) return '|]';

  // 0단계: 이명동음 선택
  const spelledNotes = applyEnharmonicSpelling(notes, keySignature);

  // editorMode: 음표 분할/병합을 생략하여 state.notes[i] ↔ SVG 요소[i] 1:1 대응 보장
  // (수정 모드에서 클릭 인덱스와 state 인덱스가 일치해야 선택이 정확함)
  let mergedNotes: ScoreNote[];
  if (editorMode) {
    mergedNotes = spelledNotes;
  } else {
    // 1단계: 박 가시성 규칙 — 필수 경계에서 음표 분할
    const splitNotes = disableTies
      ? spelledNotes
      : splitAtBeatBoundaries(spelledNotes, timeSignature, pickupSixteenths);

    // 1.5단계: 엇박 아닌 붙임줄 합산 — 점음표 복원, 박 내 동일 음 병합 (엇박 타이 보존)
    const mergedAdjacentNotes = mergeAdjacentTiedNotes(splitNotes, timeSignature, pickupSixteenths);

    // 2단계: 마지막 마디 붙임줄 음표 합산 (박 분할 조각 → 원본 음가 복원)
    mergedNotes = mergeTiedNotesInLastMeasure(mergedAdjacentNotes, timeSignature, pickupSixteenths);
  }

  // 3단계: 끊어진 붙임줄 정리 — tie 뒤에 쉼표·다른 음이 오면 tie 제거
  const processedNotes = mergedNotes.map((note, idx) => {
    if (!note.tie || note.pitch === 'rest') return note;
    const next = mergedNotes[idx + 1];
    if (
      !next ||
      next.pitch === 'rest' ||
      next.pitch !== note.pitch ||
      next.octave !== note.octave ||
      next.accidental !== note.accidental
    ) {
      return { ...note, tie: false };
    }
    return note;
  });

  const sixteenthsPerBar = getSixteenthsPerBar(timeSignature);
  const totalProc = sumScoreNotesSixteenths(processedNotes);
  const barLengths = computeBarLengthsFromTotal(totalProc, sixteenthsPerBar, pickupSixteenths);
  let barIdx = 0;
  const currentBarCap = () => barLengths[barIdx] ?? sixteenthsPerBar;

  const beamBreaks = getBeamBreakPoints(timeSignature);
  const beamGroupSize = getBeamGroupSixteenths(timeSignature);
  let currentBarSixteenths = 0;
  let abcNotes = '';
  let tupletRemaining = 0;
  let currentTupletNoteDur = 0;
  let currentTupletSpanSixteenths = 0;

  // 임시표 상태 추적 (마디 단위 리셋)
  let measureAccState = new Map<string, string>();

  // 마디 내 음표들을 모아서 온마디 쉼표 판별
  let measureNoteBuffer: { note: ScoreNote; dur: number }[] = [];
  let measureAbcBuffer = '';

  function flushMeasure() {
    abcNotes += measureAbcBuffer;
    measureNoteBuffer = [];
    measureAbcBuffer = '';
  }

  processedNotes.forEach((note) => {
    if (note.tuplet && tupletRemaining === 0) {
      const p = parseInt(note.tuplet, 10);
      const spanDur = note.tupletSpan || note.duration;
      const isDotted = (spanDur as string).includes('.');
      let q: number;
      switch (note.tuplet) {
        case '2': q = 3; break;
        case '3': q = 2; break;
        case '4': q = 6; break;
        case '5': q = isDotted ? 6 : 4; break;
        case '6': q = 4; break;
        case '7': q = isDotted ? 6 : 4; break;
        case '8': q = 6; break;
        default:  q = 2;
      }
      // 잇단음표는 인접 음표와 beam 분리 (표준 조판 규칙)
      if (measureAbcBuffer.length > 0 && !measureAbcBuffer.endsWith(' ')) {
        measureAbcBuffer += ' ';
      }
      measureAbcBuffer += `(${p}:${q}:${p}`;
      tupletRemaining = p;
      currentTupletNoteDur = note.tupletNoteDur ||
        getTupletNoteDuration(note.tuplet, note.tupletSpan || note.duration);
      currentTupletSpanSixteenths = getTupletActualSixteenths(
        note.tuplet, note.tupletSpan || note.duration,
      );
    }

    // 쉼표: generateRestAbc로 분해 출력 (잇단음표 내부 쉼표는 일반 처리)
    if (note.pitch === 'rest' && tupletRemaining === 0) {
      const restDur = durationToSixteenths(note.duration);
      const restAbcs = generateRestAbc(restDur, timeSignature, currentBarSixteenths);
      for (const r of restAbcs) {
        measureAbcBuffer += r + ' ';
      }
      measureNoteBuffer.push({ note, dur: restDur });
      currentBarSixteenths += restDur;

      if (currentBarSixteenths >= currentBarCap()) {
        flushMeasure();
        abcNotes += '| ';
        currentBarSixteenths = 0;
        measureAccState = new Map();
        barIdx++;
      }
      return;
    }

    // 임시표 결정
    let accPrefix = '';
    if (note.pitch !== 'rest') {
      accPrefix = resolveAbcAccidental(
        note.pitch, note.octave, note.accidental,
        keySignature, measureAccState,
      );
    }

    const abcPitch = pitchToAbc(note.pitch, note.octave, accPrefix);

    let dur16ths: number;
    if (tupletRemaining > 0) {
      dur16ths = currentTupletNoteDur;
    } else {
      dur16ths = durationToSixteenths(note.duration);
    }
    const durStr = dur16ths === 1 ? '' : dur16ths.toString();

    measureAbcBuffer += abcPitch + durStr;
    if (note.tie) measureAbcBuffer += '-';

    // 마디 버퍼에 추가
    measureNoteBuffer.push({ note, dur: dur16ths });

    if (tupletRemaining > 0) {
      tupletRemaining--;
      if (tupletRemaining === 0) {
        currentBarSixteenths += currentTupletSpanSixteenths;
        if (currentBarSixteenths >= currentBarCap()) {
          flushMeasure();
          abcNotes += '| ';
          currentBarSixteenths = 0;
          measureAccState = new Map();
          barIdx++;
        }
      }
      if (tupletRemaining > 0) {
        // 잇단음표 내부: beam 연결 유지 (공백 없음)
      } else {
        measureAbcBuffer += ' ';
      }
    } else {
      currentBarSixteenths += dur16ths;

      // beam 그룹 경계 판별 (향상된 로직)
      const isBeamable = dur16ths <= 3; // 8분음표 이하만 beam 가능
      const isAtBeamBreak = beamBreaks.some(bp => currentBarSixteenths === bp);
      const isAtBeatBoundary = currentBarSixteenths % beamGroupSize === 0;
      const atBarEnd = currentBarSixteenths >= currentBarCap();

      if (!isBeamable || isAtBeamBreak || isAtBeatBoundary || atBarEnd) {
        measureAbcBuffer += ' ';
      }
    }

    // 마디 끝 처리
    if (currentBarSixteenths >= currentBarCap()) {
      flushMeasure();
      abcNotes += '| ';
      currentBarSixteenths = 0;
      measureAccState = new Map();
      barIdx++;
    }
  });

  // 마지막 마디 flush
  if (measureAbcBuffer) {
    flushMeasure();
  }

  if (!abcNotes.endsWith('| ')) {
    abcNotes += '|]';
  } else {
    abcNotes = abcNotes.slice(0, -2) + ' |]';
  }
  return abcNotes.trim();
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────

/**
 * Returns the number of measures in the score (based on treble part).
 */
export function getMeasureCount(state: ScoreState): number {
  const body = generateNotesAbc(
    state.notes,
    state.timeSignature,
    state.keySignature,
    state.pickupSixteenths ?? 0,
  );
  return (body.match(/\|/g) || []).length;
}

/**
 * ABC format uses specific ASCII characters to represent notes.
 * L:1/16 is used as the base length.
 *
 * 파이프라인:
 * 1. 헤더 생성 (X:, T:, M:, L:, Q:, K:)
 * 2. 보표 구성 (%%staves, %%barsperstaff)
 * 3. Voice별 ABC 생성 (임시표, 박 가시성, beam 그룹 모두 적용)
 */
/** 못갖춘마디 보상: 약동 상쇄(total가 한 마디의 정수배)일 때 마지막 마디가 (bar - pickup)가 되도록 쉼표 추가 */
function applyPickupFill(notes: ScoreNote[], timeSignature: string, pickupSixteenths: number): ScoreNote[] {
  if (pickupSixteenths <= 0 || notes.length === 0) return notes;
  const B = getSixteenthsPerBar(timeSignature);
  const P = pickupSixteenths;
  const totalSixteenths = sumScoreNotesSixteenths(notes);
  const lengths = computeBarLengthsFromTotal(totalSixteenths, B, P);
  const lastLen = lengths[lengths.length - 1] ?? 0;
  let needLast = lastLen;
  if (P > 0 && totalSixteenths % B === 0 && totalSixteenths > P) {
    needLast = B - P;
  }
  if (lastLen < needLast) {
    const diff = needLast - lastLen;
    const fillDur = findExactDuration(diff);
    if (fillDur) {
      return [...notes, { pitch: 'rest', octave: 4, accidental: '', duration: fillDur, id: '__pickup_fill__' }];
    }
  }
  return notes;
}

/** ABC 본문의 마디 수를 구한다 (| 개수) */
function countMeasures(abcBody: string): number {
  return (abcBody.match(/\|/g) || []).length;
}

/**
 * ABC 본문에 전마디 쉼표(Z)를 추가하여 목표 마디 수에 맞춘다.
 * 큰보표에서 두 보표의 마디 수를 일치시키는 데 사용.
 */
function padWithFullRests(abcBody: string, targetMeasures: number): string {
  const current = countMeasures(abcBody);
  if (current >= targetMeasures) return abcBody;
  const diff = targetMeasures - current;
  // '|]' 앞에 부족한 마디만큼 전마디 쉼표 삽입
  const withoutEnd = abcBody.endsWith('|]')
    ? abcBody.slice(0, -2)
    : abcBody;
  const padding = Array(diff).fill('Z').join(' | ');
  return withoutEnd + '| ' + padding + ' |]';
}

export function generateAbc(state: ScoreState, editorMode = false): string {
  const useGrandStaff = state.useGrandStaff ?? false;
  const bassNotes = state.bassNotes ?? [];
  const pickupSixteenths = state.pickupSixteenths ?? 0;

  const notesToProcess = applyPickupFill(state.notes, state.timeSignature, pickupSixteenths);
  const bassNotesToProcess = applyPickupFill(bassNotes, state.timeSignature, pickupSixteenths);

  let trebleBody = generateNotesAbc(
    notesToProcess,
    state.timeSignature,
    state.keySignature,
    pickupSixteenths,
    state.disableTies ?? false,
    editorMode,
  );
  const measureCount = countMeasures(trebleBody);

  const directives: string[] = [];
  if (useGrandStaff) directives.push('%%staves {V1 V2}');

  const header = [
    `X: 1`,
    `T: ${state.title || 'Score'}`,
    `M: ${state.timeSignature}`,
    `L: 1/16`,
    `Q: 1/4=${state.tempo}`,
    ...directives,
    `K: ${state.keySignature}`,
  ].join('\n');

  // ── 마디 단위로 쪼개기 (공통 헬퍼) ──
  const extractMeasures = (body: string) => {
    let cleanBody = body.trim();
    let endsWithEndBar = false;
    if (cleanBody.endsWith('|]')) {
      cleanBody = cleanBody.slice(0, -2) + '|';
      endsWithEndBar = true;
    }
    const arr = cleanBody.split('|').map(m => m.trim()).filter(m => m.length > 0);
    return { arr, endsWithEndBar };
  };

  if (!useGrandStaff) {
    const bps = state.barsPerStaff;
    if (bps !== undefined && bps > 0) {
      const tData = extractMeasures(trebleBody);
      const tArr = tData.arr;
      const numM = tArr.length;
      let finalAbc = header;
      let mIdx = 0;
      while (mIdx < numM) {
        const take = Math.min(bps, numM - mIdx);
        finalAbc += '\n';
        finalAbc += tArr.slice(mIdx, mIdx + take).join(' | ') + ((mIdx + take === numM && tData.endsWithEndBar) ? ' |]' : ' |');
        mIdx += take;
      }
      return finalAbc;
    }
    return header + '\n' + trebleBody;
  }

  let bassBody = generateNotesAbc(
    bassNotesToProcess,
    state.timeSignature,
    state.keySignature,
    pickupSixteenths,
    state.disableTies ?? false,
    editorMode,
  );

  // 큰보표: 두 보표의 마디 수를 일치시켜 정렬 보장
  if (useGrandStaff) {
    const trebleMeasures = countMeasures(trebleBody);
    const bassMeasures = countMeasures(bassBody);
    if (trebleMeasures > bassMeasures) {
      bassBody = padWithFullRests(bassBody, trebleMeasures);
    } else if (bassMeasures > trebleMeasures) {
      trebleBody = padWithFullRests(trebleBody, bassMeasures);
    }
  }

  const tData = extractMeasures(trebleBody);
  const tArr = tData.arr;
  const bData = useGrandStaff ? extractMeasures(bassBody) : { arr: [], endsWithEndBar: false };
  const bArr = bData.arr;
  const numM = tArr.length;

  let finalAbc = header;

  const bps = state.barsPerStaff;
  let mIdx = 0;
  while (mIdx < numM) {
    const remain = numM - mIdx;
    let take: number;

    if (bps !== undefined && bps > 0) {
      take = Math.min(bps, remain);
    } else {
      take = Math.min(2, remain);

      // ── 동적 개행(Word Wrap) 로직 ──
      // 남은 마디가 3개 이상이면 밀도를 검사하여 3마디 또는 4마디를 한 줄에 표시할 수 있는지 판단
      if (remain >= 3) {
        // 알파벳(음표)과 쉼표(Z, z) 문자의 개수를 세어 밀도를 대략 측정
        const countNotes = (ms: string[]) => ms.join('').replace(/[^a-gA-GzZ]/g, '').length;

        let bestTake = 2; // 기본 2마디
        for (let cand = 4; cand >= 3; cand--) {
          if (remain >= cand) {
            const notesT = countNotes(tArr.slice(mIdx, mIdx + cand));
            const notesB = useGrandStaff ? countNotes(bArr.slice(mIdx, mIdx + cand)) : 0;
            const maxNotes = Math.max(notesT, notesB);

            // 4마디 허용치 = 최대 22개, 3마디 허용치 = 최대 16개 (너무 촘촘해지지 않도록 조절)
            const threshold = cand === 4 ? 22 : 16;
            if (maxNotes <= threshold) {
              bestTake = cand;
              break;
            }
          }
        }
        take = bestTake;
      }
    }

    if (useGrandStaff) {
      finalAbc += '\nV:V1 clef=treble\n';
      finalAbc += tArr.slice(mIdx, mIdx + take).join(' | ') + ((mIdx + take === numM && tData.endsWithEndBar) ? ' |]' : ' |');
      finalAbc += '\nV:V2 clef=bass\n';
      finalAbc += bArr.slice(mIdx, mIdx + take).join(' | ') + ((mIdx + take === numM && bData.endsWithEndBar) ? ' |]' : ' |');
    } else {
      finalAbc += '\n';
      finalAbc += tArr.slice(mIdx, mIdx + take).join(' | ') + ((mIdx + take === numM && tData.endsWithEndBar) ? ' |]' : ' |');
    }

    mIdx += take;
  }

  return finalAbc;
}

// ────────────────────────────────────────────────────────────────
// Shared utilities (extracted from scoreGenerator.ts for reuse)
// ────────────────────────────────────────────────────────────────

export const PITCH_ORDER: PitchName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** 루트가 높은 조(G,A,B)에서 wrap 편향 보정용 베이스 옥타브 계산 */
export function getBassBaseOctave(scale: PitchName[]): number {
  const rootIdx = PITCH_ORDER.indexOf(scale[0]);
  return rootIdx >= 4 ? 2 : 3;
}

export const CHORD_TONES: Record<number, number[]> = {
  0: [0, 2, 4], 1: [1, 3, 5], 2: [2, 4, 6],
  3: [3, 5, 0], 4: [4, 6, 1], 5: [5, 0, 2], 6: [6, 1, 3],
};

/** 불협화 pitch-class 간격: m2, M2, P4, tritone, m7, M7 */
export const DISSONANT_PC = new Set([1, 2, 5, 6, 10, 11]);

/** 불완전 협화음 pitch-class 간격: m3, M3, m6, M6 */
export const IMPERFECT_CONSONANT_PC = new Set([3, 4, 8, 9]);

/** 낮은음자리표 §4: 두 성부 최소 간격 — 단 10도(= 15반음) */
export const MIN_TREBLE_BASS_SEMITONES = 15;

export function uid(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function makeNote(
  pitch: PitchName, octave: number, dur: NoteDuration,
  accidental: Accidental = '', tie = false,
): ScoreNote {
  return { id: uid(), pitch, octave, accidental, duration: dur, tie };
}

export function makeRest(dur: NoteDuration): ScoreNote {
  return makeNote('rest', 4, dur);
}

export function noteNumToNote(
  noteNum: number, scale: PitchName[], baseOctave: number,
): { pitch: PitchName; octave: number } {
  const deg = ((noteNum % 7) + 7) % 7;
  const octOff = Math.floor(noteNum / 7);
  const pitch = scale[deg];
  const rootIdx = PITCH_ORDER.indexOf(scale[0]);
  const pitchIdx = PITCH_ORDER.indexOf(pitch);
  const wrap = pitchIdx < rootIdx ? 1 : 0;
  return { pitch, octave: baseOctave + octOff + wrap };
}

/** nn 역산: pitch+octave → nn (noteNumToNote의 역함수) */
export function scaleNoteToNn(
  pitch: PitchName, octave: number, scale: PitchName[], baseOctave: number,
): number {
  const rootIdx = PITCH_ORDER.indexOf(scale[0]);
  const pitchIdx = PITCH_ORDER.indexOf(pitch);
  const degIdx = scale.indexOf(pitch);
  if (degIdx < 0) return 0; // fallback
  const wrap = pitchIdx < rootIdx ? 1 : 0;
  const octaveOffset = octave - baseOctave - wrap;
  return octaveOffset * 7 + degIdx;
}

/** 한 마디 트레블: 음 시작 offset(16분) → MIDI (조표 반영, 성부 동일 건반 회피용) */
export function buildTrebleAttackMidiMap(barSlice: ScoreNote[], keySignature: string): Map<number, number> {
  const map = new Map<number, number>();
  let off = 0;
  let i = 0;
  while (i < barSlice.length) {
    const n = barSlice[i];
    if (n.tuplet) {
      const p = parseInt(n.tuplet, 10);
      const span = getTupletActualSixteenths(n.tuplet, n.tupletSpan || n.duration);
      if (n.pitch !== 'rest') {
        map.set(off, noteToMidiWithKey(n, keySignature));
      }
      off += span;
      i += p;
    } else {
      if (n.pitch !== 'rest') {
        map.set(off, noteToMidiWithKey(n, keySignature));
      }
      off += durationToSixteenths(n.duration);
      i += 1;
    }
  }
  return map;
}

/** 트레블과 동시에 같은 건반이 아니고, §4 간격(단 10도 이상)을 만족하는지 */
export function passesBassSpacing(
  note: ScoreNote,
  bassOff: number,
  trebleAttackMap: Map<number, number>,
  keySignature: string,
): boolean {
  const clashMidi = trebleAttackMap.get(bassOff);
  if (clashMidi === undefined) return true;
  const bassMidi = noteToMidiWithKey(note, keySignature);
  if (bassMidi === clashMidi) return false;
  return clashMidi - bassMidi >= MIN_TREBLE_BASS_SEMITONES;
}

/** 현재 bnn과 같은 옥타브 블록에서 화음 구성음 후보 (snapToChordTone과 동일 그리드) */
export function chordToneBnnCandidates(n: number, bTones: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const t of bTones) {
    for (const base of [
      Math.floor(n / 7) * 7 + t,
      Math.floor(n / 7) * 7 + t - 7,
      Math.floor(n / 7) * 7 + t + 7,
    ]) {
      const c = Math.max(-5, Math.min(4, base));
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
  }
  return out;
}

/** 가장 가까운 화음 구성음으로 snap — 음역(-5~4) 밖 후보는 거리 비교에서 제외 */
export function snapToChordTone(nn: number, bTones: number[]): number {
  let best = nn, bestDist = Infinity;
  for (const t of bTones) {
    for (const base of [
      Math.floor(nn / 7) * 7 + t,
      Math.floor(nn / 7) * 7 + t - 7,
      Math.floor(nn / 7) * 7 + t + 7,
    ]) {
      if (base < -5 || base > 4) continue;
      const d = Math.abs(base - nn);
      if (d < bestDist) { bestDist = d; best = base; }
    }
  }
  return Math.max(-5, Math.min(4, best));
}

export function generateProgression(measures: number, isMinor: boolean = false): number[] {
  const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const majorPatterns = [[0,3,4,0],[0,4,5,3],[0,3,0,4]];
  const minorPatterns = [[0,3,4,0],[0,5,3,4],[0,3,5,4],[0,2,4,0]];
  const patterns = isMinor ? minorPatterns : majorPatterns;

  const result: number[] = [];
  while (result.length < measures) {
    for (const c of rand(patterns)) {
      if (result.length < measures) result.push(c);
    }
  }
  // 반종지: 4마디 프레이즈 경계에 V (8마디 이상)
  if (measures >= 8) {
    for (let i = 3; i < measures - 1; i += 4) {
      result[i] = 4; // V — half cadence
    }
  }
  if (measures >= 2) {
    result[measures - 2] = 4;   // V (dominant) — 종지 전
    result[measures - 1] = 0;   // I/i (tonic) — 종지
  } else if (measures === 1) {
    result[0] = 0;
  }
  return result;
}

// ────────────────────────────────────────────────────────────────
// [확장 화성 진행] classical_harmony_patterns.docx 기반 40종 패턴
// 활성화: generateProgression → generateProgressionExtended 로 교체
// QA 결과: 100샘플 45종 고유 패턴, 강박 협화 99.9%, 종지 100% (2026-04-01)
// ────────────────────────────────────────────────────────────────
// export function generateProgressionExtended(measures: number, isMinor: boolean = false): number[] {
//   const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
//
//   // 음계도: I=0, ii=1, iii=2, IV=3, V=4, vi=5, vii°=6
//
//   // ── 4마디 패턴 ──
//   const major4: number[][] = [
//     // Cat.1 다이아토닉 기능 진행
//     [0, 3, 4, 0],   // T–S–D–T 완전 기능 순환
//     [0, 1, 4, 0],   // ii 활용 서브도미넌트형
//     [0, 5, 1, 4],   // vi·ii 활용 토닉 확장 (→V 반종지)
//     [0, 5, 3, 4],   // I–vi–IV–V (하행 3도 시퀀스 단축)
//     [0, 4, 5, 3],   // I–V–vi–IV (위종지 포함)
//     [0, 3, 1, 4],   // I–IV–ii–V (서브도미넌트 변형)
//     [0, 3, 0, 4],   // I–IV–I–V (토닉 페달 효과)
//     [0, 2, 5, 4],   // I–iii–vi–V (3도 하행 시퀀스)
//     // Cat.2 토닉·도미넌트 확장
//     [0, 4, 6, 0],   // I–V–vii°–I (도미넌트 연장)
//     [0, 6, 4, 0],   // I–vii°–V–I (이끔음 → 도미넌트 해결)
//     // Cat.3 시퀀스 (순차 반복 진행)
//     [0, 5, 1, 4],   // 5도 하행 축약: I–vi–ii–V
//     [0, 1, 2, 3],   // 상행 2도 시퀀스: I–ii–iii–IV (빌드업)
//     [0, 5, 3, 1],   // 하행 3도 시퀀스: I–vi–IV–ii
//   ];
//
//   const minor4: number[][] = [
//     // Cat.1 다이아토닉 기능 진행
//     [0, 3, 4, 0],   // i–iv–V–i (기본 T–S–D–T)
//     [0, 1, 4, 0],   // i–ii°–V–i
//     [0, 5, 3, 4],   // i–VI–iv–V
//     [0, 3, 5, 4],   // i–iv–VI–V
//     [0, 2, 4, 0],   // i–III–V–i
//     [0, 5, 1, 4],   // i–VI–ii°–V (토닉 확장형)
//     // Cat.3 시퀀스
//     [0, 6, 2, 4],   // i–VII–III–V (3도 하행 시퀀스)
//     [0, 2, 5, 4],   // i–III–VI–V (3도 관계)
//     [0, 3, 6, 4],   // i–iv–VII–V
//     [0, 5, 2, 4],   // i–VI–III–V (5도 하행 축약)
//     // Cat.2 도미넌트 연장
//     [0, 6, 4, 0],   // i–vii°–V–i (이끔음 해결)
//     [0, 3, 0, 4],   // i–iv–i–V (토닉 페달)
//   ];
//
//   // ── 8마디 패턴 (measures ≥ 8 일 때 우선 사용) ──
//   const major8: number[][] = [
//     // Cat.1 완전 기능 순환 확장
//     [0, 5, 1, 4, 0, 3, 4, 0],     // I–vi–ii–V | I–IV–V–I (토닉 확장 → 정격 종지)
//     [0, 3, 4, 0, 0, 1, 4, 0],     // I–IV–V–I | I–ii–V–I (기본 → ii 변형)
//     [0, 2, 5, 4, 0, 3, 1, 4],     // I–iii–vi–V | I–IV–ii–V (3도 하행 → S 변형)
//     [0, 5, 3, 4, 0, 1, 4, 0],     // I–vi–IV–V | I–ii–V–I (하행 3도 → ii 종지)
//     // Cat.3 시퀀스 8마디
//     [0, 3, 6, 2, 5, 1, 4, 0],     // 5도 하행 시퀀스 (원형 5도권)
//     [0, 5, 3, 1, 0, 5, 4, 0],     // 하행 3도 시퀀스 → 종지
//     [0, 1, 2, 3, 4, 5, 4, 0],     // 상행 2도 시퀀스 → 클라이맥스 → 종지
//     // 위종지 포함
//     [0, 3, 4, 5, 0, 1, 4, 0],     // I–IV–V–vi(위종지) | I–ii–V–I
//     [0, 4, 5, 3, 0, 5, 4, 0],     // I–V–vi–IV | I–vi–V–I (위종지 확장)
//   ];
//
//   const minor8: number[][] = [
//     // 기본 확장
//     [0, 3, 4, 0, 0, 5, 4, 0],     // i–iv–V–i | i–VI–V–i
//     [0, 5, 1, 4, 0, 3, 4, 0],     // i–VI–ii°–V | i–iv–V–i (토닉 확장 → 기본)
//     [0, 2, 5, 4, 0, 3, 4, 0],     // i–III–VI–V | i–iv–V–i (3도 관계 → 기본)
//     // 시퀀스
//     [0, 3, 6, 2, 5, 1, 4, 0],     // 5도 하행 시퀀스 (단조)
//     [0, 6, 2, 5, 0, 3, 4, 0],     // i–VII–III–VI | i–iv–V–i (3도 하행)
//     // 위종지 포함
//     [0, 3, 4, 5, 0, 1, 4, 0],     // i–iv–V–VI(위종지) | i–ii°–V–i
//     [0, 5, 3, 4, 0, 6, 4, 0],     // i–VI–iv–V | i–VII–V–i
//   ];
//
//   const patterns4 = isMinor ? minor4 : major4;
//   const patterns8 = isMinor ? minor8 : major8;
//
//   const result: number[] = [];
//
//   if (measures >= 8 && Math.random() < 0.6) {
//     // 60% 확률로 8마디 패턴 우선 사용
//     const pat8 = rand(patterns8);
//     for (const c of pat8) {
//       if (result.length < measures) result.push(c);
//     }
//     // 남은 마디는 4마디 패턴으로 채움
//     while (result.length < measures) {
//       for (const c of rand(patterns4)) {
//         if (result.length < measures) result.push(c);
//       }
//     }
//   } else {
//     // 4마디 패턴 연결 (연속 동일 패턴 방지)
//     let lastPatIdx = -1;
//     while (result.length < measures) {
//       let patIdx: number;
//       do {
//         patIdx = Math.floor(Math.random() * patterns4.length);
//       } while (patIdx === lastPatIdx && patterns4.length > 1);
//       lastPatIdx = patIdx;
//       for (const c of patterns4[patIdx]) {
//         if (result.length < measures) result.push(c);
//       }
//     }
//   }
//
//   // 반종지: 4마디 프레이즈 경계에 V (8마디 이상)
//   if (measures >= 8) {
//     for (let i = 3; i < measures - 1; i += 4) {
//       result[i] = 4; // V — half cadence
//     }
//   }
//   if (measures >= 2) {
//     result[measures - 2] = 4;   // V (dominant) — 종지 전
//     result[measures - 1] = 0;   // I/i (tonic) — 종지
//   } else if (measures === 1) {
//     result[0] = 0;
//   }
//   return result;
// }

/**
 * 강박 16분음표 오프셋 집합 반환.
 * 2성부 가이드라인: 강박은 협화음 필수, 약박은 제어된 불협화 허용.
 */
export function getStrongBeatOffsets(timeSignature: string): Set<number> {
  const [topStr, botStr] = (timeSignature || '4/4').split('/');
  const top = parseInt(topStr, 10) || 4;
  const bot = parseInt(botStr, 10) || 4;
  const isCompound = bot === 8 && top % 3 === 0 && top >= 6;
  if (isCompound) {
    const groups = Math.round((top / 3) * (16 / bot) * 3 / 6);
    const s = new Set<number>();
    for (let g = 0; g < groups; g++) s.add(g * 6);
    return s;
  }
  if (top === 4 && bot === 4) return new Set([0, 8]);
  if (top === 3 && bot === 4) return new Set([0]);
  if (top === 2 && bot === 4) return new Set([0]);
  if (top === 2 && bot === 2) return new Set([0]);
  return new Set([0]);
}
