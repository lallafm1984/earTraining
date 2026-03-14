export type NoteDuration = '1' | '2' | '4' | '8' | '16' | '2.' | '4.' | '8.';
export type Accidental = '#' | 'b' | 'n' | '';
export type PitchName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B' | 'rest';

export type TupletType = '' | '3' | '5' | '6' | '7';

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
}

/**
 * Parses duration to the number of 16th notes.
 */
export function durationToSixteenths(dur: NoteDuration): number {
  switch (dur) {
    case '1': return 16;
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
 * 규칙:
 * - 3연음(Triplet): spanDur안에 3개 음표 → 각 음표 = span / 2 (한 단계 짧은 음표)
 *   예) 4분음표 span → 각 음표가 8분음표(2)로 표시
 * - 5연음(Quintuplet): spanDur안에 5개 음표 → 각 음표 = span / 4
 *   예) 4분음표 span → 각 음표가 16분음표(1)로 표시
 * - 6연음(Sextuplet): spanDur안에 6개 음표 → 각 음표 = span / 4 (관습적 표기)
 * - 7연음(Septuplet): spanDur안에 7개 음표 → 각 음표 = span / 4
 */
export function getTupletNoteDuration(tupletType: TupletType, spanDuration: NoteDuration): number {
  const spanSixteenths = durationToSixteenths(spanDuration);
  
  switch (tupletType) {
    case '3':
      // 3연음: 각 음표 = span / 2 (3개가 2개 자리에 들어감)
      return Math.max(1, Math.floor(spanSixteenths / 2));
    case '5':
      // 5연음: 각 음표 = span / 4 (5개가 4개 자리에 들어감)
      return Math.max(1, Math.floor(spanSixteenths / 4));
    case '6':
      // 6연음: 각 음표 = span / 4 (관습적으로 16분음표 표기)
      return Math.max(1, Math.floor(spanSixteenths / 4));
    case '7':
      // 7연음: 각 음표 = span / 4
      return Math.max(1, Math.floor(spanSixteenths / 4));
    default:
      return spanSixteenths;
  }
}

/**
 * 잇단음표의 실제 차지하는 시간(16분음표 기준)을 계산합니다.
 */
export function getTupletActualSixteenths(tupletType: TupletType, spanDuration: NoteDuration): number {
  return durationToSixteenths(spanDuration);
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

/**
 * ABC format uses specific ASCII characters to represent notes.
 * L:1/16 is used as the base length.
 */
export function generateAbc(state: ScoreState): string {
  const header = [
    `X: 1`,
    `T: ${state.title || 'Score'}`,
    `M: ${state.timeSignature}`,
    `L: 1/16`,
    `Q: 1/4=${state.tempo}`,
    `K: ${state.keySignature}`
  ].join('\n');

  if (state.notes.length === 0) {
    return header + '\n|]';
  }

  const sixteenthsPerBar = getSixteenthsPerBar(state.timeSignature);
  const beamGroupSize = getBeamGroupSixteenths(state.timeSignature);
  let currentBarSixteenths = 0;
  let abcNotes = '';
  let tupletRemaining = 0;
  let currentTupletNoteDur = 0;
  let currentTupletSpanSixteenths = 0;

  state.notes.forEach((note, index) => {
    // Handle tuplet start marker
    if (note.tuplet && tupletRemaining === 0) {
      const p = parseInt(note.tuplet, 10);
      const q = note.tuplet === '3' ? 2 : 4; // 3:2 or p:4
      abcNotes += `(${p}:${q}:${p}`;
      tupletRemaining = p;
      currentTupletNoteDur = note.tupletNoteDur || getTupletNoteDuration(note.tuplet, note.tupletSpan || note.duration);
      currentTupletSpanSixteenths = getTupletActualSixteenths(note.tuplet, note.tupletSpan || note.duration);
    }

    let abcPitch = '';
    
    // 1. Accidental
    if (note.pitch !== 'rest') {
      if (note.accidental === '#') abcPitch += '^';
      else if (note.accidental === 'b') abcPitch += '_';
      else if (note.accidental === 'n') abcPitch += '=';

      // 2. Pitch and Octave
      const p = note.pitch;
      if (note.octave === 3) {
        abcPitch += p + ',';
      } else if (note.octave === 4) {
        abcPitch += p;
      } else if (note.octave === 5) {
        abcPitch += p.toLowerCase();
      } else if (note.octave === 6) {
        abcPitch += p.toLowerCase() + "'";
      } else {
        abcPitch += p;
      }
    } else {
      abcPitch = 'z'; // Rest
    }

    // 3. Duration
    let dur16ths: number;
    if (tupletRemaining > 0) {
      dur16ths = currentTupletNoteDur;
    } else {
      dur16ths = durationToSixteenths(note.duration);
    }
    const durStr = dur16ths === 1 ? '' : dur16ths.toString();
    
    abcNotes += abcPitch + durStr;
    if (note.tie) {
      abcNotes += '-';
    }

    // 4. Track positions and apply beaming rules
    if (tupletRemaining > 0) {
      tupletRemaining--;
      if (tupletRemaining === 0) {
        currentBarSixteenths += currentTupletSpanSixteenths;
      }
      if (tupletRemaining > 0) {
        // Still inside tuplet group — no space (beam connected)
      } else {
        abcNotes += ' ';
      }
    } else {
      currentBarSixteenths += dur16ths;
      const isBeamable = dur16ths <= 3; // 8th, dotted 8th, 16th
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

  // End the score
  if (!abcNotes.endsWith('| ')) {
    abcNotes += '|]';
  } else {
    abcNotes = abcNotes.slice(0, -2) + ' |]';
  }

  return header + '\n' + abcNotes.trim();
}
