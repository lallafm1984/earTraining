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
  0: [0, 2, 4], 1: [1, 3, 5], 2: [2, 4, 6],
  3: [3, 5, 0], 4: [4, 6, 1], 5: [5, 0, 2], 6: [6, 1, 3],
};

const DURATION_POOL: Record<Difficulty, number[]> = {
  beginner:     [16, 8, 4],
  intermediate: [8, 6, 4, 2],
  // 고급: 16분음표·점8분+16분 패턴 포함
  advanced:     [4, 3, 2, 1],
};

const SIXTEENTHS_TO_DUR: Record<number, NoteDuration> = {
  16: '1', 12: '2.', 8: '2', 6: '4.', 4: '4', 3: '8.', 2: '8', 1: '16',
};

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
  accidental: Accidental = '', tie = false,
): ScoreNote {
  return { id: uid(), pitch, octave, accidental, duration: dur, tie };
}

function makeRest(dur: NoteDuration): ScoreNote {
  return makeNote('rest' as PitchName, 4, dur);
}

function noteNumToNote(
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

function fillRhythm(total: number, pool: number[]): number[] {
  const sorted = [...pool].sort((a, b) => b - a);
  const result: number[] = [];
  let rem = total;
  while (rem > 0) {
    const avail = sorted.filter(d => d <= rem);
    if (avail.length === 0) {
      const fallback = Object.keys(SIXTEENTHS_TO_DUR).map(Number)
        .filter(d => d <= rem).sort((a, b) => b - a);
      if (fallback.length) { result.push(fallback[0]); rem -= fallback[0]; }
      else { result.push(rem); break; }
    } else {
      const d = rand(avail);
      result.push(d); rem -= d;
    }
  }
  return result;
}

function generateProgression(measures: number): number[] {
  const patterns = [[0,3,4,0],[0,4,5,3],[0,3,0,4]];
  const result: number[] = [];
  while (result.length < measures) {
    for (const c of rand(patterns)) {
      if (result.length < measures) result.push(c);
    }
  }
  if (measures >= 2) { result[measures - 2] = 4; result[measures - 1] = 0; }
  return result;
}

// ── 중급: 3잇단음표 ──
function tryInsertTriplet(
  notes: ScoreNote[],
  pitchFn: () => { pitch: PitchName; octave: number },
  maxRemaining: number,
): boolean {
  if (maxRemaining < 4 || Math.random() > 0.25) return false;
  for (let k = 0; k < 3; k++) {
    const { pitch, octave } = pitchFn();
    notes.push({
      id: uid(), pitch, octave, accidental: '' as Accidental,
      duration: '8', tie: false,
      ...(k === 0 ? { tuplet: '3' as const, tupletSpan: '4' as NoteDuration, tupletNoteDur: 2 } : {}),
    });
  }
  return true;
}

// ────────────────────────────────────────────────────────────────
// ★ 종지 쉼표 — 마지막 마디 하드코딩
// ────────────────────────────────────────────────────────────────
// 패턴 A: 으뜸음 2분음표 + 2분쉼표
// 패턴 B: 으뜸음 점2분음표 + 4분쉼표  (4/4에서만)
function generateCadenceMeasure(
  scale: PitchName[],
  trebleBase: number,
  bassBase: number,
  sixteenthsPerBar: number,
  useGrandStaff: boolean,
): { treble: ScoreNote[]; bass: ScoreNote[] } {
  const tonicPitch = scale[0];
  const bassNote   = noteNumToNote(0, scale, bassBase);
  const bassOctave = Math.max(2, Math.min(4, bassNote.octave));

  const canUsePatternB = sixteenthsPerBar >= 16 && !!SIXTEENTHS_TO_DUR[12] && !!SIXTEENTHS_TO_DUR[4];
  const usePatternB    = canUsePatternB && Math.random() < 0.5;

  const noteSixteenths = usePatternB ? 12 : 8;
  const restSixteenths = sixteenthsPerBar - noteSixteenths;

  const noteDur = SIXTEENTHS_TO_DUR[noteSixteenths] || '2';
  const restDur = SIXTEENTHS_TO_DUR[restSixteenths] || '2';

  const treble: ScoreNote[] = [
    makeNote(tonicPitch, trebleBase, noteDur),
    makeRest(restDur),
  ];
  const bass: ScoreNote[] = useGrandStaff ? [
    makeNote(bassNote.pitch, bassOctave, noteDur),
    makeRest(restDur),
  ] : [];

  return { treble, bass };
}

// ────────────────────────────────────────────────────────────────
// ★ 곡 내부 쉼표 — 후처리 (모든 난이도)
// ────────────────────────────────────────────────────────────────
// 초급: 4분쉼표 @ 약박 (offset 4 or 12)
// 중급: 연속 8분음표 쌍의 첫 번째를 8분쉼표
// 고급: 연속 16분음표 4개의 1~2번째를 16분쉼표
// 안전장치: 첫 마디 첫 박 금지 / 양손 동시 쉼표 금지
function applyInternalRests(
  treble: ScoreNote[],
  bass: ScoreNote[],
  difficulty: Difficulty,
  measures: number,
  sixteenthsPerBar: number,
  useGrandStaff: boolean,
): void {
  const budget = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? 1 : 2);
  if (budget === 0) return;

  type NotePos = { noteIdx: number; bar: number; offset: number; dur: number };
  const sizMap: Record<NoteDuration, number> = {
    '1': 16, '2': 8, '2.': 12, '4': 4, '4.': 6, '8': 2, '8.': 3, '16': 1,
  };

  // treble 타임라인
  const timeline: NotePos[] = [];
  let pos = 0;
  for (let i = 0; i < treble.length; i++) {
    const dur = sizMap[treble[i].duration] ?? 4;
    timeline.push({ noteIdx: i, bar: Math.floor(pos / sixteenthsPerBar), offset: pos % sixteenthsPerBar, dur });
    pos += dur;
  }

  // bass 쉼표 위치 집합
  const bassRestAt = new Set<string>();
  if (useGrandStaff) {
    let bpos = 0;
    for (const bn of bass) {
      const bdur = sizMap[bn.duration] ?? 4;
      if (bn.pitch === ('rest' as PitchName)) {
        bassRestAt.add(`${Math.floor(bpos / sixteenthsPerBar)}_${bpos % sixteenthsPerBar}`);
      }
      bpos += bdur;
    }
  }

  // 후보 선정
  let candidates: NotePos[] = [];

  if (difficulty === 'beginner') {
    // 약박(2박·4박) 위치의 4분음표만
    candidates = timeline.filter(p =>
      p.dur === 4 &&
      (p.offset === 4 || p.offset === 12) &&
      treble[p.noteIdx].pitch !== ('rest' as PitchName)
    );
  } else if (difficulty === 'intermediate') {
    // 연속 8분음표 쌍의 첫 번째 (bar 0 첫 박 제외)
    candidates = timeline.filter((p, idx) => {
      if (p.dur !== 2) return false;
      const next = timeline[idx + 1];
      if (!next || next.dur !== 2) return false;
      if (p.bar === 0 && p.offset === 0) return false;
      return treble[p.noteIdx].pitch !== ('rest' as PitchName);
    });
  } else {
    // 고급: 연속 16분음표 4개 묶음의 1번째 or 2번째 (bar 0 첫 박 제외)
    const firstSet: NotePos[] = [];
    const secondSet: NotePos[] = [];
    timeline.forEach((p, idx) => {
      if (p.dur !== 1) return;
      const n1 = timeline[idx + 1];
      const n2 = timeline[idx + 2];
      const n3 = timeline[idx + 3];
      if (!n1 || !n2 || !n3) return;
      if (n1.dur !== 1 || n2.dur !== 1 || n3.dur !== 1) return;
      if (p.bar === 0 && p.offset === 0) return;
      if (treble[p.noteIdx].pitch !== ('rest' as PitchName)) firstSet.push(p);
      if (treble[n1.noteIdx].pitch !== ('rest' as PitchName)) secondSet.push(n1);
    });
    // 1번째 또는 2번째 위치에서 랜덤 혼합
    candidates = Math.random() < 0.5 ? firstSet : secondSet;
  }

  // 안전 필터: bass 동시 쉼표 금지 + 종지 마디 제외
  candidates = candidates.filter(p =>
    p.bar < measures - 1 &&
    !bassRestAt.has(`${p.bar}_${p.offset}`)
  );

  if (candidates.length === 0) return;

  const chosen = [...candidates].sort(() => Math.random() - 0.5).slice(0, budget);
  for (const c of chosen) {
    treble[c.noteIdx] = makeRest(treble[c.noteIdx].duration);
  }
}

// ────────────────────────────────────────────────────────────────
// Main generator
// ────────────────────────────────────────────────────────────────

export function generateScore(opts: GeneratorOptions): GeneratedScore {
  const { keySignature, timeSignature, difficulty, measures, useGrandStaff } = opts;
  const scale             = SCALE_DEGREES[keySignature] || SCALE_DEGREES['C'];
  const sixteenthsPerBar  = getSixteenthsPerBar(timeSignature);
  const pool              = DURATION_POOL[difficulty];
  const progression       = generateProgression(measures);
  const isAdvanced        = difficulty === 'advanced';
  const isIntermediate    = difficulty === 'intermediate';

  // 중급 예산
  let interAccidentalBudget = Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 1 : 2);
  let interTripletBudget    = Math.random() < 0.4 ? 0 : (Math.random() < 0.5 ? 1 : 2);

  // 고급 임시표: 전체 1회만 (잠금)
  let advAccidentalUsed = false;

  const trebleNotes: ScoreNote[] = [];
  const bassNotes:   ScoreNote[] = [];

  const TREBLE_BASE = 4;
  const BASS_BASE   = 3;

  let nn              = rand([0, 2, 4]);
  let prevDir         = 0;
  let prevInterval    = 0;
  let pendingResolution: PitchName | null = null;

  // ── 마디 생성 (cadence 마디 제외) ────────────────────────────
  for (let bar = 0; bar < measures - 1; bar++) {
    const tones  = CHORD_TONES[progression[bar]];
    const rhythm = fillRhythm(sixteenthsPerBar, pool);

    let barPos = 0;
    for (let i = 0; i < rhythm.length; i++) {
      const dur      = rhythm[i];
      const durLabel = SIXTEENTHS_TO_DUR[dur] || '4';

      // 임시표 해결 강제
      if ((isAdvanced || isIntermediate) && pendingResolution) {
        const rp = pendingResolution; pendingResolution = null;
        const degIdx = scale.indexOf(rp);
        if (degIdx >= 0) nn = Math.round(nn / 7) * 7 + degIdx;
        const { pitch, octave } = noteNumToNote(nn, scale, TREBLE_BASE);
        trebleNotes.push(makeNote(pitch, octave, durLabel));
        barPos += dur; prevInterval = 0; continue;
      }

      // 첫 음은 고정 (시작음)
      if (!(bar === 0 && i === 0)) {
        let interval: number;

        // 도약 후 반대 방향 순차 진행 (고급: 100%)
        if (Math.abs(prevInterval) >= 3) {
          interval = isAdvanced
            ? (prevDir > 0 ? rand([-1,-2]) : rand([1,2]))
            : (prevDir > 0 ? -1 : 1);
        } else if (difficulty === 'beginner') {
          interval = Math.random() < 0.8 ? rand([1,-1]) : rand([2,-2]);
        } else if (difficulty === 'intermediate') {
          interval = rand([1,-1,2,-2,3,-3,4,-4]);
        } else {
          // 고급: 6도까지 허용, 7도(불협화음) 제외
          interval = rand([1,-1,2,-2,3,-3,4,-4,5,-5]);
        }

        const prev = nn;
        nn += interval;
        nn = Math.max(-2, Math.min(9, nn));

        // 코드톤 스냅
        const snapChance = isAdvanced ? 0.3 : 0.4;
        if (Math.random() < snapChance) {
          let best = nn, bestDist = Infinity;
          for (const t of tones) {
            for (const base of [
              Math.floor(nn/7)*7+t,
              Math.floor(nn/7)*7+t-7,
              Math.floor(nn/7)*7+t+7,
            ]) {
              const d = Math.abs(base - nn);
              if (d < bestDist) { bestDist = d; best = base; }
            }
          }
          nn = Math.max(-2, Math.min(9, best));
        }

        prevInterval = nn - prev;
        prevDir = prevInterval > 0 ? 1 : prevInterval < 0 ? -1 : prevDir;
      }

      // 중급: 3잇단음표
      if (isIntermediate && interTripletBudget > 0 && dur === 4) {
        const inserted = tryInsertTriplet(trebleNotes, () => {
          const newNn = Math.max(-2, Math.min(9, nn + rand([1,-1,2,-2])));
          return noteNumToNote(newNn, scale, TREBLE_BASE);
        }, dur);
        if (inserted) { interTripletBudget--; barPos += dur; continue; }
      }

      const { pitch, octave } = noteNumToNote(nn, scale, TREBLE_BASE);

      // ── 고급 임시표: 전체 1회 잠금 ──
      if (isAdvanced && !advAccidentalUsed && i < rhythm.length - 1 && Math.random() < 0.25) {
        if (scale.includes(pitch)) {
          trebleNotes.push(makeNote(pitch, octave, durLabel, '#'));
          pendingResolution  = CHROMATIC_RESOLUTION[pitch];
          advAccidentalUsed  = true;
          barPos += dur; continue;
        }
      }

      // 중급 임시표
      if (isIntermediate && interAccidentalBudget > 0 && i < rhythm.length - 1 && Math.random() < 0.09) {
        const acc: Accidental = Math.random() < 0.5 ? '#' : 'b';
        const rp = acc === '#' ? CHROMATIC_RESOLUTION[pitch] : pitch;
        trebleNotes.push(makeNote(pitch, octave, durLabel, acc));
        if (rp && rp !== pitch) pendingResolution = rp;
        interAccidentalBudget--; barPos += dur; continue;
      }

      trebleNotes.push(makeNote(pitch, octave, durLabel));
      barPos += dur;
    }

    // ── Bass ──
    if (useGrandStaff) {
      if (isAdvanced) {
        // 고급: 분산화음(아르페지오) 패턴
        generateArpeggioBass(bassNotes, sixteenthsPerBar, progression[bar], scale);
      } else {
        generateBasicBass(bassNotes, rhythm, sixteenthsPerBar, progression[bar], scale);
      }
    }
  }

  // ── 종지 마지막 마디 (hardcoded cadence) ────────────────────
  const cadence = generateCadenceMeasure(
    scale, TREBLE_BASE, BASS_BASE, sixteenthsPerBar, useGrandStaff,
  );
  trebleNotes.push(...cadence.treble);
  bassNotes.push(...cadence.bass);

  // ── 곡 내부 쉼표 후처리 (모든 난이도) ──────────────────────
  applyInternalRests(trebleNotes, bassNotes, difficulty, measures, sixteenthsPerBar, useGrandStaff);

  return { trebleNotes, bassNotes };
}

// ── 초급/중급 베이스 ─────────────────────────────────────────
function generateBasicBass(
  bassNotes: ScoreNote[], trebleRhythm: number[], sixteenthsPerBar: number,
  chordRoot: number, scale: PitchName[],
) {
  const BASS_BASE   = 3;
  const bTones      = CHORD_TONES[chordRoot];
  const trebleShort = trebleRhythm.some(d => d <= 2);
  const bassPool    = trebleShort ? [16, 8] : [8, 4];
  const bassRhythm  = fillRhythm(sixteenthsPerBar, bassPool);

  let bnn = chordRoot;
  if (bnn > 4) bnn -= 7;

  for (let j = 0; j < bassRhythm.length; j++) {
    const dur      = bassRhythm[j];
    const durLabel = SIXTEENTHS_TO_DUR[dur] || '4';
    if (j > 0) { bnn = rand(bTones); if (bnn > 4) bnn -= 7; }
    bnn = Math.max(-5, Math.min(4, bnn));
    const { pitch, octave } = noteNumToNote(bnn, scale, BASS_BASE);
    bassNotes.push(makeNote(pitch, Math.max(2, Math.min(4, octave)), durLabel));
  }
}

// ── 고급 베이스: 분산화음(아르페지오) ────────────────────────
// 패턴: [근음 → 5음 → 3음 → 5음] 8분음표 반복
function generateArpeggioBass(
  bassNotes: ScoreNote[],
  sixteenthsPerBar: number,
  chordRoot: number,
  scale: PitchName[],
) {
  const BASS_BASE = 3;
  const bTones    = CHORD_TONES[chordRoot]; // [root, 3rd, 5th]

  // 아르페지오 패턴: root→5th→3rd→5th
  const pattern = [bTones[0], bTones[2], bTones[1], bTones[2]];

  // 8분음표(2 sixteenths)로 마디 채우기
  const totalEighths = Math.floor(sixteenthsPerBar / 2);
  const leftover     = sixteenthsPerBar % 2;

  for (let j = 0; j < totalEighths; j++) {
    let bnn = pattern[j % pattern.length];
    if (bnn > 4) bnn -= 7;
    bnn = Math.max(-5, Math.min(4, bnn));
    const { pitch, octave } = noteNumToNote(bnn, scale, BASS_BASE);
    bassNotes.push(makeNote(pitch, Math.max(2, Math.min(4, octave)), '8'));
  }

  // 홀수 sixteenths 잔여분 처리 (예: 9/8 등)
  if (leftover > 0) {
    let bnn = pattern[totalEighths % pattern.length];
    if (bnn > 4) bnn -= 7;
    bnn = Math.max(-5, Math.min(4, bnn));
    const { pitch, octave } = noteNumToNote(bnn, scale, BASS_BASE);
    bassNotes.push(makeNote(pitch, Math.max(2, Math.min(4, octave)), '16'));
  }
}
