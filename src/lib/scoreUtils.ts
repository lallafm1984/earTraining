export type NoteDuration = '1' | '2' | '4' | '8' | '16' | '2.' | '4.' | '8.';
export type Accidental = '#' | 'b' | 'n' | '';
export type PitchName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B' | 'rest';

export type TupletType = '' | '3' | '5' | '6' | '7';

export interface ScoreNote {
  pitch: PitchName;
  octave: number; // e.g. 4 for Middle C
  accidental: Accidental;
  duration: NoteDuration;
  tie?: boolean;
  tuplet?: TupletType; // '3' = triplet, '5' = quintuplet, etc.
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
 * Used for bar calculation.
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
 * e.g., '4/4' = 16. '3/4' = 12. '6/8' = 12.
 */
export function getSixteenthsPerBar(timeSignature: string): number {
  const [topStr, bottomStr] = timeSignature.split('/');
  const top = parseInt(topStr, 10);
  const bottom = parseInt(bottomStr, 10);
  if (!top || !bottom) return 16;
  return top * (16 / bottom);
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
  let currentBarSixteenths = 0;
  let abcNotes = '';
  let tupletRemaining = 0; // how many notes remain in current tuplet group

  state.notes.forEach((note, index) => {
    // Handle tuplet start marker
    if (note.tuplet && tupletRemaining === 0) {
      const p = parseInt(note.tuplet, 10); // number of notes in group
      // Common tuplet ratios: (3 = 3 in the time of 2, (5 = 5:4, (6 = 6:4, (7 = 7:4
      const q = note.tuplet === '3' ? 2 : note.tuplet === '5' ? 4 : note.tuplet === '6' ? 4 : 4;
      abcNotes += `(${p}:${q}:${p}`;
      tupletRemaining = p;
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

    // 3. Duration relative to L:1/16
    const dur16ths = durationToSixteenths(note.duration);
    const durStr = dur16ths === 1 ? '' : dur16ths.toString();
    
    abcNotes += abcPitch + durStr;
    if (note.tie) {
      abcNotes += '-';
    }
    abcNotes += ' ';

    if (tupletRemaining > 0) tupletRemaining--;

    // 4. Bar lines
    currentBarSixteenths += dur16ths;
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
