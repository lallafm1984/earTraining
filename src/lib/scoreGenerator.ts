import {
  ScoreNote, NoteDuration, PitchName, Accidental,
  getSixteenthsPerBar,
} from './scoreUtils';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type Difficulty = 'beginner' | 'intermediate';

export interface GeneratorOptions {
  keySignature: string;
  timeSignature: string;
  difficulty: Difficulty;
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

const PITCH_ORDER: PitchName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const SCALE_DEGREES: Record<string, PitchName[]> = {
  'C':   ['C','D','E','F','G','A','B'],
  'G':   ['G','A','B','C','D','E','F'],
  'D':   ['D','E','F','G','A','B','C'],
  'A':   ['A','B','C','D','E','F','G'],
  'F':   ['F','G','A','B','C','D','E'],
  'Bb':  ['B','C','D','E','F','G','A'],
  'Eb':  ['E','F','G','A','B','C','D'],
  'Am':  ['A','B','C','D','E','F','G'],
  'Em':  ['E','F','G','A','B','C','D'],
  'Bm':  ['B','C','D','E','F','G','A'],
  'F#m': ['F','G','A','B','C','D','E'],
  'Dm':  ['D','E','F','G','A','B','C'],
  'Gm':  ['G','A','B','C','D','E','F'],
  'Cm':  ['C','D','E','F','G','A','B'],
};

// chord root (0-indexed degree) → triad tones (0-indexed degrees)
const CHORD_TONES: Record<number, number[]> = {
  0: [0, 2, 4],
  1: [1, 3, 5],
  2: [2, 4, 6],
  3: [3, 5, 0],
  4: [4, 6, 1],
  5: [5, 0, 2],
  6: [6, 1, 3],
};

// Rhythm pools in sixteenths
const DURATION_POOL: Record<Difficulty, number[]> = {
  beginner:     [16, 8, 4],
  intermediate: [8, 6, 4, 2],
};

const SIXTEENTHS_TO_DUR: Record<number, NoteDuration> = {
  16: '1', 12: '2.', 8: '2', 6: '4.', 4: '4', 3: '8.', 2: '8', 1: '16',
};

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uid(): string {
  return Math.random().toString(36).substr(2, 9);
}

function makeNote(pitch: PitchName, octave: number, dur: NoteDuration): ScoreNote {
  return { id: uid(), pitch, octave, accidental: '' as Accidental, duration: dur, tie: false };
}

/**
 * noteNum(0 = tonic at baseOctave) → { pitch, octave }
 * 양수 = 위, 음수 = 아래
 */
function noteNumToNote(
  noteNum: number,
  scale: PitchName[],
  baseOctave: number,
): { pitch: PitchName; octave: number } {
  const deg = ((noteNum % 7) + 7) % 7;
  const octOff = Math.floor(noteNum / 7);
  const pitch = scale[deg];
  const rootIdx = PITCH_ORDER.indexOf(scale[0]);
  const pitchIdx = PITCH_ORDER.indexOf(pitch);
  const wrap = pitchIdx < rootIdx ? 1 : 0;
  return { pitch, octave: baseOctave + octOff + wrap };
}

/** 리듬 분할: 총 sixteenths를 pool 안의 값들로 랜덤 분할 */
function fillRhythm(total: number, pool: number[]): number[] {
  const sorted = [...pool].sort((a, b) => b - a);
  const result: number[] = [];
  let rem = total;
  while (rem > 0) {
    const avail = sorted.filter(d => d <= rem);
    if (avail.length === 0) {
      const fallback = Object.keys(SIXTEENTHS_TO_DUR)
        .map(Number)
        .filter(d => d <= rem)
        .sort((a, b) => b - a);
      if (fallback.length) { result.push(fallback[0]); rem -= fallback[0]; }
      else { result.push(rem); break; }
    } else {
      const d = rand(avail);
      result.push(d);
      rem -= d;
    }
  }
  return result;
}

/** 화음 진행 생성 (마디별 chord root degree) */
function generateProgression(measures: number): number[] {
  const patterns = [
    [0, 3, 4, 0],
    [0, 4, 5, 3],
    [0, 3, 0, 4],
  ];
  const result: number[] = [];
  while (result.length < measures) {
    for (const c of rand(patterns)) {
      if (result.length < measures) result.push(c);
    }
  }
  // V → I 종지
  if (measures >= 2) {
    result[measures - 2] = 4;
    result[measures - 1] = 0;
  }
  return result;
}

// ────────────────────────────────────────────────────────────────
// Main generator
// ────────────────────────────────────────────────────────────────

export function generateScore(opts: GeneratorOptions): GeneratedScore {
  const { keySignature, timeSignature, difficulty, measures, useGrandStaff } = opts;
  const scale = SCALE_DEGREES[keySignature] || SCALE_DEGREES['C'];
  const sixteenthsPerBar = getSixteenthsPerBar(timeSignature);
  const pool = DURATION_POOL[difficulty];
  const progression = generateProgression(measures);

  const trebleNotes: ScoreNote[] = [];
  const bassNotes: ScoreNote[] = [];

  // ── Treble (melody) ─────────────────────────────────────────
  let nn = rand([0, 2, 4]); // 1도 / 3도 / 5도
  let prevDir = 0;
  let prevInterval = 0;
  const TREBLE_BASE = 4;

  for (let bar = 0; bar < measures; bar++) {
    const isLast = bar === measures - 1;
    const tones = CHORD_TONES[progression[bar]];

    // --- rhythm ---
    let rhythm: number[];
    if (isLast) {
      const endDur = 8; // half note
      const before = sixteenthsPerBar - endDur;
      rhythm = before >= 2 ? [...fillRhythm(before, pool), endDur] : [sixteenthsPerBar];
    } else {
      rhythm = fillRhythm(sixteenthsPerBar, pool);
    }

    // --- pitch ---
    for (let i = 0; i < rhythm.length; i++) {
      const dur = rhythm[i];
      const durLabel = SIXTEENTHS_TO_DUR[dur] || '4';

      if (isLast && i === rhythm.length - 1) {
        // ▸ 마지막 음: tonic
        nn = Math.round(nn / 7) * 7;
      } else if (isLast && rhythm.length >= 2 && i === rhythm.length - 2) {
        // ▸ 종지 직전: 2도(+1) 또는 7도(-1 = leading tone)
        const t = Math.round(nn / 7) * 7;
        nn = rand([t + 1, t - 1]);
      } else if (bar === 0 && i === 0) {
        // first note already set
      } else {
        // normal interval logic
        let interval: number;

        // 도약 후 반대 진행 보정
        if (Math.abs(prevInterval) >= 3) {
          interval = prevDir > 0 ? -1 : 1;
        } else if (difficulty === 'beginner') {
          interval = Math.random() < 0.8 ? rand([1, -1]) : rand([2, -2]);
        } else {
          interval = rand([1, -1, 2, -2, 3, -3, 4, -4]);
        }

        const prev = nn;
        nn += interval;
        nn = Math.max(-2, Math.min(9, nn)); // treble range clamp

        // 40 % 확률로 가장 가까운 chord tone에 snap
        if (Math.random() < 0.4) {
          let best = nn;
          let bestDist = Infinity;
          for (const t of tones) {
            for (const base of [Math.floor(nn / 7) * 7 + t, Math.floor(nn / 7) * 7 + t - 7, Math.floor(nn / 7) * 7 + t + 7]) {
              const d = Math.abs(base - nn);
              if (d < bestDist) { bestDist = d; best = base; }
            }
          }
          nn = Math.max(-2, Math.min(9, best));
        }

        prevInterval = nn - prev;
        prevDir = prevInterval > 0 ? 1 : prevInterval < 0 ? -1 : prevDir;
      }

      const { pitch, octave } = noteNumToNote(nn, scale, TREBLE_BASE);
      trebleNotes.push(makeNote(pitch, octave, durLabel));
    }

    // ── Bass (if grand staff) ───────────────────────────────────
    if (useGrandStaff) {
      const BASS_BASE = 3;
      const chordRoot = progression[bar];
      const bTones = CHORD_TONES[chordRoot];

      // 리듬 상호보완: treble이 짧으면 bass는 길게
      const trebleHasShort = rhythm.some(d => d <= 2);
      const bassPool = trebleHasShort ? [16, 8] : [8, 4];
      const bassRhythm = fillRhythm(sixteenthsPerBar, bassPool);

      let bnn = chordRoot;
      if (bnn > 4) bnn -= 7; // keep in low range

      for (let j = 0; j < bassRhythm.length; j++) {
        const dur = bassRhythm[j];
        const durLabel = SIXTEENTHS_TO_DUR[dur] || '4';

        if (j === 0) {
          // 첫 박: 코드 근음
        } else {
          bnn = rand(bTones);
          if (bnn > 4) bnn -= 7;
        }
        bnn = Math.max(-5, Math.min(4, bnn));

        const { pitch, octave } = noteNumToNote(bnn, scale, BASS_BASE);
        bassNotes.push(makeNote(pitch, Math.max(2, Math.min(4, octave)), durLabel));
      }
    }
  }

  return { trebleNotes, bassNotes };
}
