export type NoteDuration = '1' | '1.' | '2' | '4' | '8' | '16' | '2.' | '4.' | '8.';
export type Accidental = '#' | 'b' | 'n' | '';
export type PitchName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B' | 'rest';

export type TupletType = '' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

export interface ScoreNote {
  pitch: PitchName;
  octave: number;
  accidental: Accidental;
  duration: NoteDuration;
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
}

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

/** 16분음표 수 → NoteDuration (잇단음표용 쉼표 생성 등) */
const SIXTEENTHS_TO_DURATION: [number, NoteDuration][] = [
  [24, '1.'], [16, '1'], [12, '2.'], [8, '2'], [6, '4.'], [4, '4'], [3, '8.'], [2, '8'], [1, '16'],
];

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
 * 잇단음표 법칙에 따라 개별 음표의 시각적 길이(16분음표 단위)를 계산합니다.
 *
 * ABC 표기법 (p:q:r): 각 음표 표기 길이 = span/q
 *
 * ── 일반음표 (span이 2^n) ──────────────────
 * 3연: (3:2:3) q=2, written=span/2
 * 5연: (5:4:5) q=4, written=span/4
 * 6연: (6:4:6) q=4, written=span/4
 * 7연: (7:4:7) q=4, written=span/4
 *
 * ── 점음표 (span이 3×2^n) ─────────────────
 * 2연: (2:3:2) q=3, written=span/3   예) 점4분(6)→8분 2개, 점2분(12)→4분 2개
 * 4연: (4:6:4) q=6, written=span/6   예) 점4분(6)→16분 4개, 점2분(12)→8분 4개
 * 5연: (5:6:5) q=6, written=span/6   예) 점2분(12)→8분 5개
 * 7연: (7:6:7) q=6, written=span/6
 * 8연: (8:6:8) q=6, written=span/6
 */
export function getTupletNoteDuration(tupletType: TupletType, spanDuration: NoteDuration): number {
  const spanSixteenths = durationToSixteenths(spanDuration);
  const isDotted = (spanDuration as string).includes('.');

  switch (tupletType) {
    case '2': return Math.max(1, Math.floor(spanSixteenths / 3));  // (2:3:2) dotted only
    case '3': return Math.max(1, Math.floor(spanSixteenths / 2));  // (3:2:3) normal only
    case '4': return Math.max(1, Math.floor(spanSixteenths / 6));  // (4:6:4) dotted only
    case '5': return isDotted
      ? Math.max(1, Math.floor(spanSixteenths / 6))  // (5:6:5)
      : Math.max(1, Math.floor(spanSixteenths / 4)); // (5:4:5)
    case '6': return Math.max(1, Math.floor(spanSixteenths / 4));  // (6:4:6) normal only
    case '7': return isDotted
      ? Math.max(1, Math.floor(spanSixteenths / 6))  // (7:6:7)
      : Math.max(1, Math.floor(spanSixteenths / 4)); // (7:4:7)
    case '8': return Math.max(1, Math.floor(spanSixteenths / 6));  // (8:6:8) dotted only
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
    const result: TupletType[] = ['2'];          // 점8(3) 이상 모두
    if (span >= 6) result.push('4', '5', '7', '8'); // 점4분(6) 이상
    return result;
  } else {
    const result: TupletType[] = [];
    if (span >= 2) result.push('3');
    if (span >= 4) result.push('5', '6', '7');
    return result;
  }
}

/**
 * 박자표에 따른 beam(꼬리 묶음) 그룹 크기를 16분음표 단위로 반환.
 * 6/8, 9/8, 12/8 등 복합 박자는 점4분(3×8분) 단위로,
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

function pitchToAbc(pitch: string, octave: number, accidental: Accidental): string {
  if (pitch === 'rest') return 'z';
  let s = '';
  if (accidental === '#') s += '^';
  else if (accidental === 'b') s += '_';
  else if (accidental === 'n') s += '=';

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

function generateNotesAbc(notes: ScoreNote[], timeSignature: string): string {
  if (notes.length === 0) return '|]';

  const sixteenthsPerBar = getSixteenthsPerBar(timeSignature);
  const beamGroupSize = getBeamGroupSixteenths(timeSignature);
  let currentBarSixteenths = 0;
  let abcNotes = '';
  let tupletRemaining = 0;
  let currentTupletNoteDur = 0;
  let currentTupletSpanSixteenths = 0;

  notes.forEach((note) => {
    if (note.tuplet && tupletRemaining === 0) {
      const p = parseInt(note.tuplet, 10);
      const spanDur = note.tupletSpan || note.duration;
      const isDotted = (spanDur as string).includes('.');
      let q: number;
      switch (note.tuplet) {
        case '2': q = 3; break;                               // (2:3:2) dotted
        case '3': q = 2; break;                               // (3:2:3) normal
        case '4': q = 6; break;                               // (4:6:4) dotted
        case '5': q = isDotted ? 6 : 4; break;                // (5:6:5) or (5:4:5)
        case '6': q = 4; break;                               // (6:4:6) normal
        case '7': q = isDotted ? 6 : 4; break;                // (7:6:7) or (7:4:7)
        case '8': q = 6; break;                               // (8:6:8) dotted
        default:  q = 2;
      }
      abcNotes += `(${p}:${q}:${p}`;
      tupletRemaining = p;
      currentTupletNoteDur = note.tupletNoteDur || getTupletNoteDuration(note.tuplet, note.tupletSpan || note.duration);
      currentTupletSpanSixteenths = getTupletActualSixteenths(note.tuplet, note.tupletSpan || note.duration);
    }

    const abcPitch = pitchToAbc(note.pitch, note.octave, note.pitch === 'rest' ? '' : note.accidental);

    let dur16ths: number;
    if (tupletRemaining > 0) {
      dur16ths = currentTupletNoteDur;
    } else {
      dur16ths = durationToSixteenths(note.duration);
    }
    const durStr = dur16ths === 1 ? '' : dur16ths.toString();

    abcNotes += abcPitch + durStr;
    if (note.tie) abcNotes += '-';

    if (tupletRemaining > 0) {
      tupletRemaining--;
      if (tupletRemaining === 0) {
        currentBarSixteenths += currentTupletSpanSixteenths;
      }
      if (tupletRemaining > 0) {
        // beam connected inside tuplet
      } else {
        abcNotes += ' ';
      }
    } else {
      currentBarSixteenths += dur16ths;
      const isBeamable = dur16ths <= 3;
      const isAtBeatBoundary = currentBarSixteenths % beamGroupSize === 0;
      if (!isBeamable || isAtBeatBoundary || currentBarSixteenths >= sixteenthsPerBar) {
        abcNotes += ' ';
      }
    }

    if (currentBarSixteenths >= sixteenthsPerBar) {
      abcNotes += '| ';
      currentBarSixteenths = 0;
    }
  });

  if (!abcNotes.endsWith('| ')) {
    abcNotes += '|]';
  } else {
    abcNotes = abcNotes.slice(0, -2) + ' |]';
  }
  return abcNotes.trim();
}

/**
 * Returns the number of measures in the score (based on treble part).
 */
export function getMeasureCount(state: ScoreState): number {
  const body = generateNotesAbc(state.notes, state.timeSignature);
  return (body.match(/\|/g) || []).length;
}

/**
 * ABC format uses specific ASCII characters to represent notes.
 * L:1/16 is used as the base length.
 */
export function generateAbc(state: ScoreState): string {
  const useGrandStaff = state.useGrandStaff ?? false;
  const bassNotes = state.bassNotes ?? [];

  const trebleBody = generateNotesAbc(state.notes, state.timeSignature);
  const measureCount = (trebleBody.match(/\|/g) || []).length;

  const directives: string[] = ['%%barsperstaff 4'];
  // 마디 수가 4의 배수일 때만(한 줄이 꽉 찼을 때) 우측 끝까지 늘림
  const shouldStretch = measureCount > 0 && measureCount % 4 === 0;
  directives.push(`%%stretchlast ${shouldStretch ? 'true' : 'false'}`);
  if (useGrandStaff) directives.push('%%staves {V1 V2}');

  const header = [
    `X: 1`,
    `T: ${state.title || 'Score'}`,
    `M: ${state.timeSignature}`,
    `L: 1/16`,
    `Q: 1/4=${state.tempo}`,
    ...directives,
    `K: ${state.keySignature}`
  ].join('\n');

  if (!useGrandStaff) {
    return header + '\n' + trebleBody;
  }

  const bass = generateNotesAbc(bassNotes, state.timeSignature);
  return header + '\nV:V1 clef=treble\n' + trebleBody + '\nV:V2 clef=bass\n' + bass;
}
