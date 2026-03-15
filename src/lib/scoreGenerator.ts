import {
  ScoreNote, NoteDuration, PitchName, Accidental,
  getSixteenthsPerBar,
} from './scoreUtils';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

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

const CHORD_TONES: Record<number, number[]> = {
  0: [0, 2, 4],
  1: [1, 3, 5],
  2: [2, 4, 6],
  3: [3, 5, 0],
  4: [4, 6, 1],
  5: [5, 0, 2],
  6: [6, 1, 3],
};

const DURATION_POOL: Record<Difficulty, number[]> = {
  beginner:     [16, 8, 4],
  intermediate: [8, 6, 4, 2],
  advanced:     [4, 3, 2, 1],  // 4분, 점8분, 8분, 16분
};

const SIXTEENTHS_TO_DUR: Record<number, NoteDuration> = {
  16: '1', 12: '2.', 8: '2', 6: '4.', 4: '4', 3: '8.', 2: '8', 1: '16',
};

// 크로매틱 반음 매핑 (각 PitchName의 반음 위 해결 음)
const CHROMATIC_RESOLUTION: Record<string, PitchName> = {
  'C': 'D', 'D': 'E', 'E': 'F', 'F': 'G', 'G': 'A', 'A': 'B', 'B': 'C',
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

function makeNote(
  pitch: PitchName, octave: number, dur: NoteDuration,
  accidental: Accidental = '', tie = false
): ScoreNote {
  return { id: uid(), pitch, octave, accidental, duration: dur, tie };
}

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
  if (measures >= 2) {
    result[measures - 2] = 4;
    result[measures - 1] = 0;
  }
  return result;
}

// ── 고급 전용: 당김음 삽입 ──
// 리듬 배열에서 약박→강박 경계에 타이를 걸 수 있는 위치를 찾아 15~20% 확률로 적용
function applySyncopation(
  rhythm: number[],
  sixteenthsPerBar: number,
): { rhythm: number[]; tieIndices: Set<number> } {
  const tieIndices = new Set<number>();
  // 4/4 기준 강박 위치: 0, 4, 8, 12 (16분음표 기준)
  const beatSize = 4;
  let pos = 0;
  for (let i = 0; i < rhythm.length; i++) {
    const noteEnd = pos + rhythm[i];
    // 이 음이 다음 강박을 걸쳐서 넘어가는지 확인
    const nextStrong = Math.ceil((pos + 1) / beatSize) * beatSize;
    if (nextStrong < noteEnd && nextStrong < sixteenthsPerBar) {
      // 약박에서 강박으로 넘어가는 위치 → 15~20% 확률로 당김음
      if (Math.random() < 0.18) {
        tieIndices.add(i);
      }
    }
    pos = noteEnd;
  }
  return { rhythm, tieIndices };
}

// ── 고급 전용: 강박 쉼표 삽입 ──
// 강박(1,3박) 위치에 있는 짧은 음을 쉼표로 교체할 확률
function maybeStrongBeatRest(pos: number, dur: number): boolean {
  const beatSize = 4;
  if (pos % (beatSize * 2) === 0 && dur <= 2) {
    return Math.random() < 0.12;
  }
  return false;
}

// ── 고급 전용: 임시표(비화성음) 생성 ──
function tryAccidental(
  scale: PitchName[],
  pitch: PitchName,
): { accidental: Accidental; needsResolution: boolean; resolutionPitch: PitchName } | null {
  if (Math.random() > 0.12) return null; // 10~15% 확률

  const isInScale = scale.includes(pitch);
  if (!isInScale) return null;

  // 반음 올림 (예: 다장조에서 F → F#)
  const acc: Accidental = '#';
  const resPitch = CHROMATIC_RESOLUTION[pitch];
  return { accidental: acc, needsResolution: true, resolutionPitch: resPitch };
}

// ── 중급 전용: 3잇단음표 삽입 ──
// 4분음표(4 sixteenths) 위치를 3연음 그룹(각 2 sixteenths 표기)으로 교체.
// 총 최대 2그룹. 반환: 노트를 push하는 함수
function tryInsertTriplet(
  notes: ScoreNote[],
  pitchFn: () => { pitch: PitchName; octave: number },
  maxRemaining: number,
): { inserted: boolean; consumed: number } {
  // 삽입 가능 조건: 남은 공간 4 sixteenths 이상, 25% 확률
  if (maxRemaining < 4 || Math.random() > 0.25) return { inserted: false, consumed: 0 };

  // 3연음 3개 음표: tuplet='3', tupletSpan='4', tupletNoteDur=2
  for (let k = 0; k < 3; k++) {
    const { pitch, octave } = pitchFn();
    const note: ScoreNote = {
      id: uid(), pitch, octave, accidental: '' as Accidental,
      duration: '8', tie: false,
      ...(k === 0 ? { tuplet: '3' as const, tupletSpan: '4' as NoteDuration, tupletNoteDur: 2 } : {}),
    };
    notes.push(note);
  }
  return { inserted: true, consumed: 4 };
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
  const isAdvanced = difficulty === 'advanced';
  const isIntermediate = difficulty === 'intermediate';

  // 중급: 임시표 전체 허용 개수 (0~2)
  let interAccidentalBudget = Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 1 : 2);
  // 중급: 3잇단음표 전체 허용 그룹 수 (0~2)
  let interTripletBudget = Math.random() < 0.4 ? 0 : (Math.random() < 0.5 ? 1 : 2);

  const trebleNotes: ScoreNote[] = [];
  const bassNotes: ScoreNote[] = [];

  // ── Treble (melody) ─────────────────────────────────────────
  let nn = rand([0, 2, 4]);
  let prevDir = 0;
  let prevInterval = 0;
  const TREBLE_BASE = 4;

  // 고급/중급: 임시표 해결 대기 상태
  let pendingResolution: PitchName | null = null;

  for (let bar = 0; bar < measures; bar++) {
    const isLast = bar === measures - 1;
    const tones = CHORD_TONES[progression[bar]];

    // --- rhythm ---
    let rhythm: number[];
    if (isLast) {
      const endDur = 8;
      const before = sixteenthsPerBar - endDur;
      rhythm = before >= 2 ? [...fillRhythm(before, pool), endDur] : [sixteenthsPerBar];
    } else {
      rhythm = fillRhythm(sixteenthsPerBar, pool);
    }

    // 고급: 당김음 적용
    let tieIndices = new Set<number>();
    if (isAdvanced && !isLast) {
      const synco = applySyncopation(rhythm, sixteenthsPerBar);
      rhythm = synco.rhythm;
      tieIndices = synco.tieIndices;
    }

    // --- pitch ---
    let barPos = 0;
    for (let i = 0; i < rhythm.length; i++) {
      const dur = rhythm[i];
      const durLabel = SIXTEENTHS_TO_DUR[dur] || '4';

      // 고급: 강박 쉼표
      if (isAdvanced && !isLast && bar > 0 && maybeStrongBeatRest(barPos, dur)) {
        trebleNotes.push(makeNote('rest' as PitchName, 4, durLabel));
        barPos += dur;
        continue;
      }

      // 고급/중급: 임시표 해결 강제
      if ((isAdvanced || isIntermediate) && pendingResolution) {
        const resolvedPitch = pendingResolution;
        pendingResolution = null;
        const degIdx = scale.indexOf(resolvedPitch);
        if (degIdx >= 0) {
          nn = Math.round(nn / 7) * 7 + degIdx;
        }
        const { pitch, octave } = noteNumToNote(nn, scale, TREBLE_BASE);
        trebleNotes.push(makeNote(pitch, octave, durLabel));
        barPos += dur;
        prevInterval = 0;
        continue;
      }

      if (isLast && i === rhythm.length - 1) {
        nn = Math.round(nn / 7) * 7;
      } else if (isLast && rhythm.length >= 2 && i === rhythm.length - 2) {
        const t = Math.round(nn / 7) * 7;
        nn = rand([t + 1, t - 1]);
      } else if (bar === 0 && i === 0) {
        // first note already set
      } else {
        let interval: number;

        if (Math.abs(prevInterval) >= 3) {
          // 도약 후 반대 진행 (고급: 100% 엄격)
          if (isAdvanced) {
            interval = prevDir > 0 ? rand([-1, -2]) : rand([1, 2]);
          } else {
            interval = prevDir > 0 ? -1 : 1;
          }
        } else if (difficulty === 'beginner') {
          interval = Math.random() < 0.8 ? rand([1, -1]) : rand([2, -2]);
        } else if (difficulty === 'intermediate') {
          interval = rand([1, -1, 2, -2, 3, -3, 4, -4]);
        } else {
          // 고급: 장/단 6도, 옥타브 도약 허용 (증4도, 7도 제외)
          const intervals = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 7, -7];
          interval = rand(intervals);
        }

        const prev = nn;
        nn += interval;
        nn = Math.max(-2, Math.min(9, nn));

        // chord tone snap (고급은 30%, 나머지 40%)
        const snapChance = isAdvanced ? 0.3 : 0.4;
        if (Math.random() < snapChance) {
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

      // ── 중급: 3잇단음표 삽입 시도 (4분음표 자리에서만) ──
      if (isIntermediate && !isLast && interTripletBudget > 0 && dur === 4) {
        const pitchFn = () => {
          // 잇단음표 내 음은 현재 nn 주변 ±1~2 이동으로 생성
          const step = rand([1, -1, 2, -2]);
          const newNn = Math.max(-2, Math.min(9, nn + step));
          return noteNumToNote(newNn, scale, TREBLE_BASE);
        };
        const { inserted } = tryInsertTriplet(trebleNotes, pitchFn, dur);
        if (inserted) {
          interTripletBudget--;
          barPos += dur;
          continue;
        }
      }

      const { pitch, octave } = noteNumToNote(nn, scale, TREBLE_BASE);
      const hasTie = tieIndices.has(i);

      // 고급: 임시표(비화성음)
      if (isAdvanced && !isLast && i < rhythm.length - 1) {
        const accResult = tryAccidental(scale, pitch);
        if (accResult) {
          trebleNotes.push(makeNote(pitch, octave, durLabel, accResult.accidental, hasTie));
          pendingResolution = accResult.resolutionPitch;
          barPos += dur;
          continue;
        }
      }

      // ── 중급: 임시표(#/b) 삽입 시도 ──
      if (isIntermediate && !isLast && interAccidentalBudget > 0 && i < rhythm.length - 1) {
        // 8~10% 확률, 단 마디 마지막 음 전에는 제한
        if (Math.random() < 0.09) {
          // # 또는 b 랜덤 선택
          const acc: Accidental = Math.random() < 0.5 ? '#' : 'b';
          const resPitch = acc === '#' ? CHROMATIC_RESOLUTION[pitch] : pitch;
          trebleNotes.push(makeNote(pitch, octave, durLabel, acc, hasTie));
          if (resPitch && resPitch !== pitch) pendingResolution = resPitch;
          interAccidentalBudget--;
          barPos += dur;
          continue;
        }
      }

      trebleNotes.push(makeNote(pitch, octave, durLabel, '', hasTie));
      barPos += dur;
    }

    // ── Bass (if grand staff) ───────────────────────────────────
    if (useGrandStaff) {
      if (isAdvanced) {
        generateAdvancedBass(
          bassNotes, bar, measures, rhythm, sixteenthsPerBar,
          progression, scale, trebleNotes, nn, prevDir
        );
      } else {
        generateBasicBass(
          bassNotes, rhythm, sixteenthsPerBar, progression[bar], scale
        );
      }
    }
  }

  return { trebleNotes, bassNotes };
}

// ── 초급/중급 베이스 생성 ──
function generateBasicBass(
  bassNotes: ScoreNote[],
  trebleRhythm: number[],
  sixteenthsPerBar: number,
  chordRoot: number,
  scale: PitchName[],
) {
  const BASS_BASE = 3;
  const bTones = CHORD_TONES[chordRoot];
  const trebleHasShort = trebleRhythm.some(d => d <= 2);
  const bassPool = trebleHasShort ? [16, 8] : [8, 4];
  const bassRhythm = fillRhythm(sixteenthsPerBar, bassPool);

  let bnn = chordRoot;
  if (bnn > 4) bnn -= 7;

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

// ── 고급 베이스 생성 ──
function generateAdvancedBass(
  bassNotes: ScoreNote[],
  bar: number,
  totalMeasures: number,
  trebleRhythm: number[],
  sixteenthsPerBar: number,
  progression: number[],
  scale: PitchName[],
  allTrebleNotes: ScoreNote[],
  trebleNn: number,
  trebleDir: number,
) {
  const BASS_BASE = 3;
  const chordRoot = progression[bar];
  const bTones = CHORD_TONES[chordRoot];

  // 주도권 교대: 짝수 마디(0,1)는 treble 주도 → bass 단순
  //              홀수 마디(2,3)는 bass 주도 → bass 복잡
  const halfPoint = Math.floor(totalMeasures / 2);
  const isBassLead = bar >= halfPoint;

  // 리듬 상호보완 + 주도권 반영
  let bassPool: number[];
  const trebleHasShort = trebleRhythm.some(d => d <= 2);
  if (isBassLead) {
    // bass 주도: 8분/16분 위주
    bassPool = [4, 3, 2, 1];
  } else {
    bassPool = trebleHasShort ? [16, 8] : [8, 4];
  }
  const bassRhythm = fillRhythm(sixteenthsPerBar, bassPool);

  // 자리바꿈: 30% 확률로 3음이나 5음으로 시작
  let bnn: number;
  if (Math.random() < 0.3) {
    bnn = rand([bTones[1], bTones[2]]); // 3음 or 5음
  } else {
    bnn = chordRoot;
  }
  if (bnn > 4) bnn -= 7;

  // 반진행(Contrary Motion): treble 방향과 반대로 80%
  const bassPreferDir = trebleDir > 0 ? -1 : trebleDir < 0 ? 1 : 0;
  let prevBnn = bnn;

  for (let j = 0; j < bassRhythm.length; j++) {
    const dur = bassRhythm[j];
    const durLabel = SIXTEENTHS_TO_DUR[dur] || '4';

    if (j === 0) {
      // 첫 박: 위에서 결정된 시작음 사용
    } else {
      // 순차 진행(Stepwise Bass) 유도: 70% 순차, 30% 도약
      if (Math.random() < 0.7) {
        // 반진행 가중치 80%
        const dir = (bassPreferDir !== 0 && Math.random() < 0.8)
          ? bassPreferDir
          : rand([1, -1]);
        bnn = prevBnn + dir;
      } else {
        bnn = rand(bTones);
        if (bnn > 4) bnn -= 7;
      }
    }

    bnn = Math.max(-5, Math.min(4, bnn));
    prevBnn = bnn;

    const { pitch, octave } = noteNumToNote(bnn, scale, BASS_BASE);
    bassNotes.push(makeNote(pitch, Math.max(2, Math.min(4, octave)), durLabel));
  }
}
