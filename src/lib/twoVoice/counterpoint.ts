// ────────────────────────────────────────────────────────────────
// Two-Voice Counterpoint Module
// ────────────────────────────────────────────────────────────────
//
// Provides counterpoint validation and correction for two-voice
// (treble + bass) score generation. Implements:
//   - Strong-beat consonance validation
//   - Parallel 5th/8th detection and correction
//   - Hidden (direct) 5th/8th detection
//   - Contrary motion ratio analysis
//   - Non-harmonic tone validation
//   - Master correction pipeline with voice-yielding policy
//
// Voice-yielding policy: melody adjusts FIRST, bass as last resort.
// Bass pattern contour is preserved as much as possible.
// ────────────────────────────────────────────────────────────────

import type { ScoreNote, PitchName, NoteDuration, Accidental } from '../scoreUtils';
import {
  noteToMidiWithKey,
  durationToSixteenths,
  getSixteenthsPerBar,
  getScaleDegrees,
  MIN_TREBLE_BASS_SEMITONES,
} from '../scoreUtils';
import type { TimeSignature, Violation } from './types';
import { strongBeatOffsetsSixteenths0 } from './meter';

// ────────────────────────────────────────────────────────────────
// Pitch-class interval constants
// ────────────────────────────────────────────────────────────────

/** Dissonant pitch-class intervals: m2(1), M2(2), P4(5), tritone(6), m7(10), M7(11) */
const DISSONANT_PC = new Set([1, 2, 5, 6, 10, 11]);

/** Imperfect consonance pitch-class intervals: m3(3), M3(4), m6(8), M6(9) */
const IMPERFECT_CONSONANT_PC = new Set([3, 4, 8, 9]);

/** Perfect consonance pitch-class intervals: unison(0), P5(7), P8(0 alias via mod 12) */
const PERFECT_CONSONANT_PC = new Set([0, 7]);

// ────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────

interface NoteEvent {
  midi: number;
  startSixteenths: number;
  durationSixteenths: number;
  index: number; // index in original ScoreNote[]
  isRest: boolean;
}

/**
 * Build a timeline of note events from a ScoreNote array.
 * Each event has MIDI pitch, start offset (in 16ths from score start), duration, and source index.
 */
function buildTimeline(notes: ScoreNote[], keySignature: string): NoteEvent[] {
  const events: NoteEvent[] = [];
  let offset = 0;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const dur = n.tupletNoteDur ?? durationToSixteenths(n.duration);
    events.push({
      midi: n.pitch === 'rest' ? -1 : noteToMidiWithKey(n, keySignature),
      startSixteenths: offset,
      durationSixteenths: dur,
      index: i,
      isRest: n.pitch === 'rest',
    });
    offset += dur;
  }
  return events;
}

/**
 * Get pitch-class interval (0-11) between two MIDI values.
 * Returns -1 if either is a rest.
 */
function pitchClassInterval(midiA: number, midiB: number): number {
  if (midiA < 0 || midiB < 0) return -1;
  return ((midiB - midiA) % 12 + 12) % 12;
}

function getStrongBeatSixteenthOffsets(timeSig: TimeSignature): Set<number> {
  return strongBeatOffsetsSixteenths0(timeSig);
}

/**
 * Find pairs of simultaneous note events between treble and bass
 * at strong/mid beat positions.
 */
function findVerticalPairs(
  trebleEvents: NoteEvent[],
  bassEvents: NoteEvent[],
  timeSig: TimeSignature,
  barLength: number,
): Array<{
  trebleEvent: NoteEvent;
  bassEvent: NoteEvent;
  barIndex: number;
  beatOffset: number; // 16ths offset within bar
}> {
  const strongBeats = getStrongBeatSixteenthOffsets(timeSig);
  const pairs: Array<{
    trebleEvent: NoteEvent;
    bassEvent: NoteEvent;
    barIndex: number;
    beatOffset: number;
  }> = [];

  // For each strong beat position in the score, find which treble/bass notes are sounding
  const totalBars = trebleEvents.length > 0
    ? Math.ceil((trebleEvents[trebleEvents.length - 1].startSixteenths + trebleEvents[trebleEvents.length - 1].durationSixteenths) / barLength)
    : 0;

  for (let bar = 0; bar < totalBars; bar++) {
    for (const beatOff of strongBeats) {
      const absOff = bar * barLength + beatOff;

      // Find the treble note sounding at this offset
      const tEvent = trebleEvents.find(e =>
        !e.isRest && e.startSixteenths <= absOff && e.startSixteenths + e.durationSixteenths > absOff,
      );
      // Find the bass note sounding at this offset
      const bEvent = bassEvents.find(e =>
        !e.isRest && e.startSixteenths <= absOff && e.startSixteenths + e.durationSixteenths > absOff,
      );

      if (tEvent && bEvent) {
        pairs.push({
          trebleEvent: tEvent,
          bassEvent: bEvent,
          barIndex: bar,
          beatOffset: beatOff,
        });
      }
    }
  }
  return pairs;
}

/**
 * Find consecutive note-onset pairs for parallel motion analysis.
 * Returns pairs of successive vertical intervals where both voices have new attacks.
 */
function findConsecutiveOnsetPairs(
  trebleEvents: NoteEvent[],
  bassEvents: NoteEvent[],
): Array<{
  prevTreble: NoteEvent; prevBass: NoteEvent;
  curTreble: NoteEvent; curBass: NoteEvent;
}> {
  // Build a list of time points where both voices attack simultaneously
  const trebleOnsets = new Map<number, NoteEvent>();
  for (const e of trebleEvents) {
    if (!e.isRest) trebleOnsets.set(e.startSixteenths, e);
  }
  const bassOnsets = new Map<number, NoteEvent>();
  for (const e of bassEvents) {
    if (!e.isRest) bassOnsets.set(e.startSixteenths, e);
  }

  // Collect all simultaneous onset points
  const simultaneousPoints: Array<{ offset: number; treble: NoteEvent; bass: NoteEvent }> = [];
  for (const [offset, tEvent] of trebleOnsets) {
    const bEvent = bassOnsets.get(offset);
    if (bEvent) {
      simultaneousPoints.push({ offset, treble: tEvent, bass: bEvent });
    }
  }
  simultaneousPoints.sort((a, b) => a.offset - b.offset);

  // Build consecutive pairs
  const result: Array<{
    prevTreble: NoteEvent; prevBass: NoteEvent;
    curTreble: NoteEvent; curBass: NoteEvent;
  }> = [];
  for (let i = 1; i < simultaneousPoints.length; i++) {
    result.push({
      prevTreble: simultaneousPoints[i - 1].treble,
      prevBass: simultaneousPoints[i - 1].bass,
      curTreble: simultaneousPoints[i].treble,
      curBass: simultaneousPoints[i].bass,
    });
  }
  return result;
}

// ────────────────────────────────────────────────────────────────
// Public API — Detection / Validation
// ────────────────────────────────────────────────────────────────

/**
 * Validate strong-beat consonance between treble and bass.
 * At each strong/mid beat position, the vertical interval must be consonant.
 * Returns violations for dissonant intervals on strong beats.
 */
export function validateStrongBeatConsonance(
  treble: ScoreNote[],
  bass: ScoreNote[],
  timeSig: TimeSignature,
  keySignature: string,
): Violation[] {
  const barLength = getSixteenthsPerBar(timeSig);
  const trebleEvents = buildTimeline(treble, keySignature);
  const bassEvents = buildTimeline(bass, keySignature);
  const pairs = findVerticalPairs(trebleEvents, bassEvents, timeSig, barLength);
  const violations: Violation[] = [];

  for (const pair of pairs) {
    const pc = pitchClassInterval(pair.bassEvent.midi, pair.trebleEvent.midi);
    if (pc < 0) continue;
    if (DISSONANT_PC.has(pc)) {
      const barIdx = pair.barIndex;
      violations.push({
        type: 'strong_beat_dissonance',
        message: `Dissonant interval (pc=${pc}) on strong beat at bar ${barIdx + 1}, beat offset ${pair.beatOffset}`,
        measure: barIdx,
        beatPosition: pair.beatOffset,
        severity: 'error',
      });
    }
  }
  return violations;
}

/**
 * Detect parallel perfect 5ths and 8ves (including unison).
 * Two consecutive vertical intervals that are both P5 (pc=7) or both P1/P8 (pc=0)
 * with both voices moving in the same direction constitute a parallel perfect interval.
 */
export function detectParallelPerfect(
  treble: ScoreNote[],
  bass: ScoreNote[],
  keySignature: string,
): Violation[] {
  const trebleEvents = buildTimeline(treble, keySignature);
  const bassEvents = buildTimeline(bass, keySignature);
  const consecutivePairs = findConsecutiveOnsetPairs(trebleEvents, bassEvents);
  const violations: Violation[] = [];

  for (const pair of consecutivePairs) {
    const prevPc = pitchClassInterval(pair.prevBass.midi, pair.prevTreble.midi);
    const curPc = pitchClassInterval(pair.curBass.midi, pair.curTreble.midi);
    if (prevPc < 0 || curPc < 0) continue;

    // Check for parallel perfect consonance
    const isPerfect = (pc: number) => pc === 0 || pc === 7;
    if (isPerfect(prevPc) && prevPc === curPc) {
      // Both voices must move in the same direction (parallel, not oblique/contrary)
      const trebleDir = pair.curTreble.midi - pair.prevTreble.midi;
      const bassDir = pair.curBass.midi - pair.prevBass.midi;
      if ((trebleDir > 0 && bassDir > 0) || (trebleDir < 0 && bassDir < 0)) {
        violations.push({
          type: 'parallel_perfect',
          message: `Parallel perfect ${prevPc === 0 ? 'unison/octave' : '5th'} detected`,
          severity: 'error',
        });
      }
    }
  }
  return violations;
}

/**
 * Detect hidden (direct) perfect 5ths and 8ves.
 * Both voices move in the same direction to arrive at a P5 or P8.
 * Exception: upper voice arrives by step (semitone 1 or 2) — this is allowed.
 */
export function detectHiddenPerfect(
  treble: ScoreNote[],
  bass: ScoreNote[],
  keySignature: string,
): Violation[] {
  const trebleEvents = buildTimeline(treble, keySignature);
  const bassEvents = buildTimeline(bass, keySignature);
  const consecutivePairs = findConsecutiveOnsetPairs(trebleEvents, bassEvents);
  const violations: Violation[] = [];

  for (const pair of consecutivePairs) {
    const curPc = pitchClassInterval(pair.curBass.midi, pair.curTreble.midi);
    if (curPc < 0) continue;

    // Only check arrivals at perfect consonance
    if (curPc !== 0 && curPc !== 7) continue;

    const trebleDir = pair.curTreble.midi - pair.prevTreble.midi;
    const bassDir = pair.curBass.midi - pair.prevBass.midi;

    // Both moving in same direction?
    if (!((trebleDir > 0 && bassDir > 0) || (trebleDir < 0 && bassDir < 0))) continue;

    // Skip if it's parallel (already caught by detectParallelPerfect)
    const prevPc = pitchClassInterval(pair.prevBass.midi, pair.prevTreble.midi);
    if (prevPc === curPc) continue;

    // Exception: upper voice arrives by step (semitone distance ≤ 2)
    const trebleStep = Math.abs(pair.curTreble.midi - pair.prevTreble.midi);
    if (trebleStep <= 2) continue;

    violations.push({
      type: 'hidden_perfect',
      message: `Hidden ${curPc === 0 ? 'octave' : '5th'}: both voices move in same direction to perfect interval`,
      severity: 'error',
    });
  }
  return violations;
}

/**
 * Calculate the ratio of contrary motion between the two voices.
 * Contrary motion: voices move in opposite directions.
 * Returns a number between 0 and 1. Target: ≥ 0.5 (50%+).
 */
export function checkContraryMotionRatio(
  treble: ScoreNote[],
  bass: ScoreNote[],
  keySignature: string,
): number {
  const trebleEvents = buildTimeline(treble, keySignature);
  const bassEvents = buildTimeline(bass, keySignature);
  const consecutivePairs = findConsecutiveOnsetPairs(trebleEvents, bassEvents);

  if (consecutivePairs.length === 0) return 1;

  let contraryCount = 0;
  let totalMotion = 0;

  for (const pair of consecutivePairs) {
    const trebleDir = pair.curTreble.midi - pair.prevTreble.midi;
    const bassDir = pair.curBass.midi - pair.prevBass.midi;

    // Skip oblique motion (one voice stays)
    if (trebleDir === 0 || bassDir === 0) continue;

    totalMotion++;
    // Contrary: one goes up, other goes down
    if ((trebleDir > 0 && bassDir < 0) || (trebleDir < 0 && bassDir > 0)) {
      contraryCount++;
    }
  }

  return totalMotion === 0 ? 1 : contraryCount / totalMotion;
}

/**
 * Validate non-harmonic tones (dissonances on weak beats).
 * Checks that dissonant intervals on weak beats are properly treated as:
 *   - Passing tone (PT): approach by step, leave by step in same direction
 *   - Neighbor tone (NT): approach by step, return to original pitch
 *   - Appoggiatura (APP): approach by leap, leave by step opposite direction (level 5+)
 *   - Suspension (SUS): held note resolving down by step (level 5+)
 */
export function validateNonHarmonicTones(
  treble: ScoreNote[],
  bass: ScoreNote[],
  melodyLevel: number,
  timeSig: TimeSignature,
  keySignature: string,
): Violation[] {
  const barLength = getSixteenthsPerBar(timeSig);
  const strongBeats = getStrongBeatSixteenthOffsets(timeSig);
  const trebleEvents = buildTimeline(treble, keySignature);
  const bassEvents = buildTimeline(bass, keySignature);
  const violations: Violation[] = [];

  for (let ti = 0; ti < trebleEvents.length; ti++) {
    const tEvent = trebleEvents[ti];
    if (tEvent.isRest) continue;

    // Determine if this note is on a weak beat
    const beatInBar = tEvent.startSixteenths % barLength;
    if (strongBeats.has(beatInBar)) continue; // Strong beat — checked elsewhere

    // Find bass note sounding at this treble onset
    const bEvent = bassEvents.find(e =>
      !e.isRest && e.startSixteenths <= tEvent.startSixteenths &&
      e.startSixteenths + e.durationSixteenths > tEvent.startSixteenths,
    );
    if (!bEvent) continue;

    const pc = pitchClassInterval(bEvent.midi, tEvent.midi);
    if (pc < 0 || !DISSONANT_PC.has(pc)) continue;

    // This is a dissonance on a weak beat — check if it's a valid non-harmonic tone
    const prev = ti > 0 ? trebleEvents[ti - 1] : null;
    const next = ti < trebleEvents.length - 1 ? trebleEvents[ti + 1] : null;

    if (!prev || prev.isRest || !next || next.isRest) {
      violations.push({
        type: 'unresolved_dissonance',
        message: `Dissonance on weak beat without proper resolution at offset ${tEvent.startSixteenths}`,
        measure: Math.floor(tEvent.startSixteenths / barLength),
        beatPosition: beatInBar,
        severity: 'warning',
      });
      continue;
    }

    const approachInterval = tEvent.midi - prev.midi;
    const leaveInterval = next.midi - tEvent.midi;
    const approachStep = Math.abs(approachInterval) <= 2; // semitone or whole tone
    const leaveStep = Math.abs(leaveInterval) <= 2;
    const sameDirection = (approachInterval > 0 && leaveInterval > 0) || (approachInterval < 0 && leaveInterval < 0);
    const returnToOriginal = next.midi === prev.midi;
    const oppositeDirection = (approachInterval > 0 && leaveInterval < 0) || (approachInterval < 0 && leaveInterval > 0);

    // Passing tone: step approach, step leave, same direction
    if (approachStep && leaveStep && sameDirection) continue;

    // Neighbor tone: step approach, returns to original
    if (approachStep && leaveStep && returnToOriginal) continue;

    // Appoggiatura: leap approach, step leave opposite direction (level 5+)
    if (melodyLevel >= 5 && !approachStep && leaveStep && oppositeDirection) continue;

    // Suspension: same pitch as previous (held), resolves down by step (level 5+)
    if (melodyLevel >= 5 && tEvent.midi === prev.midi && leaveStep && leaveInterval < 0) continue;

    violations.push({
      type: 'invalid_nonharmonic',
      message: `Invalid non-harmonic tone treatment at offset ${tEvent.startSixteenths}`,
      measure: Math.floor(tEvent.startSixteenths / barLength),
      beatPosition: beatInBar,
      severity: 'warning',
    });
  }
  return violations;
}

/**
 * Check that voices do not cross (bass MIDI should always be below treble MIDI)
 * and that the interval between them does not exceed 2 octaves (24 semitones).
 */
export function validateVoiceSpacing(
  treble: ScoreNote[],
  bass: ScoreNote[],
  keySignature: string,
): Violation[] {
  const trebleEvents = buildTimeline(treble, keySignature);
  const bassEvents = buildTimeline(bass, keySignature);
  const violations: Violation[] = [];

  // Check at each bass onset for the sounding treble note
  for (const bEvent of bassEvents) {
    if (bEvent.isRest) continue;
    const tEvent = trebleEvents.find(e =>
      !e.isRest && e.startSixteenths <= bEvent.startSixteenths &&
      e.startSixteenths + e.durationSixteenths > bEvent.startSixteenths,
    );
    if (!tEvent) continue;

    // Voice crossing
    if (bEvent.midi >= tEvent.midi) {
      violations.push({
        type: 'voice_crossing',
        message: `Voice crossing: bass (MIDI ${bEvent.midi}) ≥ treble (MIDI ${tEvent.midi})`,
        severity: 'error',
      });
    }

    // Spacing > 2 octaves
    const interval = tEvent.midi - bEvent.midi;
    if (interval > 24) {
      violations.push({
        type: 'excessive_spacing',
        message: `Voice spacing exceeds 2 octaves (${interval} semitones)`,
        severity: 'warning',
      });
    }
  }
  return violations;
}

/**
 * Validate that the last vertical interval is a perfect consonance (unison, P5, P8).
 */
export function validateFinalInterval(
  treble: ScoreNote[],
  bass: ScoreNote[],
  keySignature: string,
): Violation[] {
  const violations: Violation[] = [];

  // Find last non-rest notes
  let lastTreble: ScoreNote | undefined;
  let lastBass: ScoreNote | undefined;
  for (let i = treble.length - 1; i >= 0; i--) {
    if (treble[i].pitch !== 'rest') { lastTreble = treble[i]; break; }
  }
  for (let i = bass.length - 1; i >= 0; i--) {
    if (bass[i].pitch !== 'rest') { lastBass = bass[i]; break; }
  }

  if (!lastTreble || !lastBass) return violations;

  const tMidi = noteToMidiWithKey(lastTreble, keySignature);
  const bMidi = noteToMidiWithKey(lastBass, keySignature);
  const pc = pitchClassInterval(bMidi, tMidi);

  if (!PERFECT_CONSONANT_PC.has(pc)) {
    violations.push({
      type: 'final_interval',
      message: `Final interval is not a perfect consonance (pc=${pc})`,
      severity: 'error',
    });
  }
  return violations;
}

// ────────────────────────────────────────────────────────────────
// Public API — Corrections
// ────────────────────────────────────────────────────────────────

/** 조표만 반영한 음계 음의 MIDI (임시표 없음) */
function diatonicMidiForScalePitch(
  pitch: PitchName,
  octave: number,
  keySignature: string,
): number {
  return noteToMidiWithKey(
    {
      id: '',
      pitch,
      octave,
      accidental: '' as Accidental,
      duration: '4' as NoteDuration,
      tie: false,
    },
    keySignature,
  );
}

/**
 * 고급 2(임시표) 미만: 임시표 없이 가장 가까운 음계 내 협화음으로 교체.
 */
function findDiatonicConsonantReplacement(
  note: ScoreNote,
  bassMidi: number,
  keySignature: string,
  scale: PitchName[],
): { pitch: PitchName; octave: number } | null {
  const tMidi = noteToMidiWithKey(note, keySignature);

  type Cand = { pitch: PitchName; octave: number; midi: number; pc: number; dist: number };
  const found: Cand[] = [];

  for (let oct = note.octave - 3; oct <= note.octave + 3; oct++) {
    if (oct < 3) continue; // 트레블 최소 옥타브 보호
    for (const sp of scale) {
      const midi = diatonicMidiForScalePitch(sp, oct, keySignature);
      if (midi <= bassMidi) continue;
      if (midi - bassMidi < MIN_TREBLE_BASS_SEMITONES) continue;
      const npc = pitchClassInterval(bassMidi, midi);
      if (npc < 0 || DISSONANT_PC.has(npc)) continue;
      found.push({
        pitch: sp,
        octave: oct,
        midi,
        pc: npc,
        dist: Math.abs(midi - tMidi),
      });
    }
  }

  if (found.length === 0) return null;

  found.sort((a, b) => {
    const ai = IMPERFECT_CONSONANT_PC.has(a.pc) ? 0 : 1;
    const bi = IMPERFECT_CONSONANT_PC.has(b.pc) ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return a.dist - b.dist;
  });

  const best = found[0];
  return { pitch: best.pitch, octave: best.octave };
}

/**
 * Fix a dissonant treble note at a given index by shifting it to the nearest
 * consonant pitch relative to the sounding bass MIDI.
 * Returns true if a fix was applied.
 */
function fixTrebleDissonance(
  treble: ScoreNote[],
  trebleIdx: number,
  bassMidi: number,
  keySignature: string,
  scale: PitchName[],
  allowWrittenAccidentals: boolean,
): boolean {
  const note = treble[trebleIdx];
  if (note.pitch === 'rest') return false;

  const tMidi = noteToMidiWithKey(note, keySignature);
  const pc = pitchClassInterval(bassMidi, tMidi);
  if (pc < 0 || !DISSONANT_PC.has(pc)) return false;

  if (!allowWrittenAccidentals) {
    const rep = findDiatonicConsonantReplacement(note, bassMidi, keySignature, scale);
    if (rep) {
      treble[trebleIdx] = { ...note, pitch: rep.pitch, octave: rep.octave, accidental: '' };
      return true;
    }
    return false;
  }

  // Try shifting ±1, ±2 semitones to find nearest consonant pitch within the scale
  const candidates: Array<{ semitoneShift: number; newPc: number }> = [];
  for (const shift of [-1, 1, -2, 2, -3, 3]) {
    const newMidi = tMidi + shift;
    const newPc = pitchClassInterval(bassMidi, newMidi);
    if (newPc >= 0 && !DISSONANT_PC.has(newPc)) {
      candidates.push({ semitoneShift: shift, newPc });
    }
  }

  if (candidates.length === 0) return false;

  // Prefer imperfect consonance (3rd/6th) over perfect
  candidates.sort((a, b) => {
    const aImperfect = IMPERFECT_CONSONANT_PC.has(a.newPc) ? 0 : 1;
    const bImperfect = IMPERFECT_CONSONANT_PC.has(b.newPc) ? 0 : 1;
    if (aImperfect !== bImperfect) return aImperfect - bImperfect;
    return Math.abs(a.semitoneShift) - Math.abs(b.semitoneShift);
  });

  const best = candidates[0];
  const newMidi = tMidi + best.semitoneShift;

  // Convert MIDI back to pitch + octave
  const newOctave = Math.floor(newMidi / 12) - 1;
  const semInOctave = newMidi % 12;

  // Find the scale pitch closest to this semitone value
  const PITCH_SEMITONES: Record<string, number> = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
  };
  let bestPitch: PitchName = note.pitch;
  let bestDist = Infinity;
  for (const sp of scale) {
    const ps = PITCH_SEMITONES[sp] ?? 0;
    const dist = Math.abs(ps - semInOctave);
    if (dist < bestDist) {
      bestDist = dist;
      bestPitch = sp as PitchName;
    }
  }

  if (newOctave < 3) return false; // 트레블 최소 옥타브 보호
  treble[trebleIdx] = {
    ...note,
    pitch: bestPitch,
    octave: newOctave,
    accidental: bestDist !== 0 ? (best.semitoneShift > 0 ? '#' : 'b') : note.accidental,
  };
  return true;
}

/**
 * Fix parallel perfect intervals by adjusting the melody note
 * at the second occurrence by one scale step.
 */
function fixParallelPerfectCorrection(
  treble: ScoreNote[],
  bass: ScoreNote[],
  keySignature: string,
  scale: PitchName[],
): number {
  const trebleEvents = buildTimeline(treble, keySignature);
  const bassEvents = buildTimeline(bass, keySignature);
  const consecutivePairs = findConsecutiveOnsetPairs(trebleEvents, bassEvents);
  let fixCount = 0;

  for (const pair of consecutivePairs) {
    const prevPc = pitchClassInterval(pair.prevBass.midi, pair.prevTreble.midi);
    const curPc = pitchClassInterval(pair.curBass.midi, pair.curTreble.midi);
    if (prevPc < 0 || curPc < 0) continue;

    const isPerfect = (pc: number) => pc === 0 || pc === 7;
    if (!isPerfect(prevPc) || prevPc !== curPc) continue;

    const trebleDir = pair.curTreble.midi - pair.prevTreble.midi;
    const bassDir = pair.curBass.midi - pair.prevBass.midi;
    if (!((trebleDir > 0 && bassDir > 0) || (trebleDir < 0 && bassDir < 0))) continue;

    // Voice-yielding: adjust melody at curTreble — try multiple shifts
    const tIdx = pair.curTreble.index;
    const note = treble[tIdx];
    if (note.pitch === 'rest') continue;

    const scaleIdx = scale.indexOf(note.pitch as PitchName);
    if (scaleIdx < 0) continue;

    const primaryDir = trebleDir > 0 ? -1 : 1;
    const shifts = [primaryDir, -primaryDir, primaryDir * 2, -primaryDir * 2, primaryDir * 3];
    let fixed = false;
    const origMidi = diatonicMidiForScalePitch(note.pitch, note.octave, keySignature);

    for (const shift of shifts) {
      const candScaleIdx = ((scaleIdx + shift) % scale.length + scale.length) % scale.length;
      const candPitch = scale[candScaleIdx] as PitchName;
      let candOctave = note.octave;
      let candMidi = diatonicMidiForScalePitch(candPitch, candOctave, keySignature);
      if (shift > 0 && candMidi <= origMidi) candOctave++;
      if (shift < 0 && candMidi >= origMidi) candOctave--;
      candMidi = diatonicMidiForScalePitch(candPitch, candOctave, keySignature);
      if (candOctave < 3) continue;

      // 베이스와 불협화 확인
      const candPcCheck = pitchClassInterval(pair.curBass.midi, candMidi);
      if (candPcCheck >= 0 && DISSONANT_PC.has(candPcCheck)) continue;

      // 여전히 병진행인지 확인
      const newCurPc = pitchClassInterval(pair.curBass.midi, candMidi);
      const isPerfectFn = (pc: number) => pc === 0 || pc === 7;
      if (isPerfectFn(prevPc) && prevPc === newCurPc) {
        const newDir = candMidi - pair.prevTreble.midi;
        if ((newDir > 0 && bassDir > 0) || (newDir < 0 && bassDir < 0)) continue;
      }

      treble[tIdx] = { ...note, pitch: candPitch, octave: candOctave, accidental: '' };
      fixed = true;
      break;
    }
    if (fixed) fixCount++;
  }
  return fixCount;
}

/**
 * Fix parallel perfect intervals detected at strong-beat sounding positions.
 * Unlike findConsecutiveOnsetPairs (which only checks simultaneous onsets),
 * this checks at every strong beat — catching parallels where one voice sustains.
 */
function fixParallelPerfectAtStrongBeats(
  treble: ScoreNote[],
  bass: ScoreNote[],
  timeSig: TimeSignature,
  keySignature: string,
  scale: PitchName[],
): number {
  const barLength = getSixteenthsPerBar(timeSig);
  const strongBeats = getStrongBeatSixteenthOffsets(timeSig);
  const trebleEvents = buildTimeline(treble, keySignature);
  const bassEvents = buildTimeline(bass, keySignature);

  // Collect (trebleEvent, bassEvent) at each strong beat
  const beatPairs: Array<{
    trebleEvent: NoteEvent; bassEvent: NoteEvent; absOff: number;
  }> = [];

  const totalBars = trebleEvents.length > 0
    ? Math.ceil((trebleEvents[trebleEvents.length - 1].startSixteenths + trebleEvents[trebleEvents.length - 1].durationSixteenths) / barLength)
    : 0;

  for (let bar = 0; bar < totalBars; bar++) {
    for (const beatOff of strongBeats) {
      const absOff = bar * barLength + beatOff;
      const tEvent = trebleEvents.find(e =>
        !e.isRest && e.startSixteenths <= absOff && e.startSixteenths + e.durationSixteenths > absOff,
      );
      const bEvent = bassEvents.find(e =>
        !e.isRest && e.startSixteenths <= absOff && e.startSixteenths + e.durationSixteenths > absOff,
      );
      if (tEvent && bEvent) beatPairs.push({ trebleEvent: tEvent, bassEvent: bEvent, absOff });
    }
  }

  let fixCount = 0;

  for (let i = 1; i < beatPairs.length; i++) {
    const prev = beatPairs[i - 1];
    const cur = beatPairs[i];

    const prevPc = pitchClassInterval(prev.bassEvent.midi, prev.trebleEvent.midi);
    const curPc = pitchClassInterval(cur.bassEvent.midi, cur.trebleEvent.midi);
    if (prevPc < 0 || curPc < 0) continue;

    const isPerfect = (pc: number) => pc === 0 || pc === 7;
    if (!isPerfect(prevPc) || prevPc !== curPc) continue;

    const trebleDir = cur.trebleEvent.midi - prev.trebleEvent.midi;
    const bassDir = cur.bassEvent.midi - prev.bassEvent.midi;
    if (!((trebleDir > 0 && bassDir > 0) || (trebleDir < 0 && bassDir < 0))) continue;
    if (trebleDir === 0) continue;

    // Fix: try multiple scale steps to find a non-parallel, consonant replacement
    const tIdx = cur.trebleEvent.index;
    const note = treble[tIdx];
    if (note.pitch === 'rest') continue;

    const scaleIdx = scale.indexOf(note.pitch as PitchName);
    if (scaleIdx < 0) continue;

    // 반대 방향 우선, 양방향 ±1~3 스케일도수 탐색
    const primaryDir = trebleDir > 0 ? -1 : 1;
    const shifts = [primaryDir, -primaryDir, primaryDir * 2, -primaryDir * 2, primaryDir * 3, -primaryDir * 3];
    let fixed = false;

    for (const shift of shifts) {
      const candScaleIdx = ((scaleIdx + shift) % scale.length + scale.length) % scale.length;
      const candPitch = scale[candScaleIdx] as PitchName;

      let candOctave = note.octave;
      const origMidi = diatonicMidiForScalePitch(note.pitch, note.octave, keySignature);
      let candMidi = diatonicMidiForScalePitch(candPitch, candOctave, keySignature);
      if (shift > 0 && candMidi <= origMidi) candOctave++;
      if (shift < 0 && candMidi >= origMidi) candOctave--;
      candMidi = diatonicMidiForScalePitch(candPitch, candOctave, keySignature);
      if (candOctave < 3) continue;

      // 베이스와 불협화 확인
      const candPc = pitchClassInterval(cur.bassEvent.midi, candMidi);
      if (candPc >= 0 && DISSONANT_PC.has(candPc)) continue;

      // 이전 강박과 여전히 병진행인지 확인
      const prevPcNew = pitchClassInterval(prev.bassEvent.midi, prev.trebleEvent.midi);
      const curPcNew = pitchClassInterval(cur.bassEvent.midi, candMidi);
      const isPerfectNew = (pc: number) => pc === 0 || pc === 7;
      if (isPerfectNew(prevPcNew) && prevPcNew === curPcNew) {
        const newDir = candMidi - prev.trebleEvent.midi;
        const bDir = cur.bassEvent.midi - prev.bassEvent.midi;
        if ((newDir > 0 && bDir > 0) || (newDir < 0 && bDir < 0)) continue; // 여전히 병진행
      }

      treble[tIdx] = { ...note, pitch: candPitch, octave: candOctave, accidental: '' };
      fixed = true;
      break;
    }

    if (!fixed) continue;
    fixCount++;
  }

  return fixCount;
}

/**
 * Fix hidden perfect intervals by adjusting the melody note
 * to approach the perfect interval by step instead of leap.
 */
function fixHiddenPerfectCorrection(
  treble: ScoreNote[],
  bass: ScoreNote[],
  keySignature: string,
  scale: PitchName[],
): number {
  const trebleEvents = buildTimeline(treble, keySignature);
  const bassEvents = buildTimeline(bass, keySignature);
  const consecutivePairs = findConsecutiveOnsetPairs(trebleEvents, bassEvents);
  let fixCount = 0;

  for (const pair of consecutivePairs) {
    const curPc = pitchClassInterval(pair.curBass.midi, pair.curTreble.midi);
    if (curPc < 0 || (curPc !== 0 && curPc !== 7)) continue;

    const trebleDir = pair.curTreble.midi - pair.prevTreble.midi;
    const bassDir = pair.curBass.midi - pair.prevBass.midi;
    if (!((trebleDir > 0 && bassDir > 0) || (trebleDir < 0 && bassDir < 0))) continue;

    // Skip if already parallel (handled elsewhere)
    const prevPc = pitchClassInterval(pair.prevBass.midi, pair.prevTreble.midi);
    if (prevPc === curPc) continue;

    // Skip if upper voice already arrives by step
    const trebleStep = Math.abs(pair.curTreble.midi - pair.prevTreble.midi);
    if (trebleStep <= 2) continue;

    // Fix: change the current treble note so it approaches by step
    // Find the scale note that is 1-2 semitones from the target in the correct direction
    const tIdx = pair.curTreble.index;
    const note = treble[tIdx];
    if (note.pitch === 'rest') continue;

    // Find the previous treble's scale position and step from there
    const prevNote = treble[pair.prevTreble.index];
    const prevScaleIdx = scale.indexOf(prevNote.pitch as PitchName);
    if (prevScaleIdx < 0) continue;

    // Step one scale degree in the same direction as the original motion
    const stepDir = trebleDir > 0 ? 1 : -1;
    const newScaleIdx = ((prevScaleIdx + stepDir) % scale.length + scale.length) % scale.length;
    const newPitch = scale[newScaleIdx] as PitchName;

    const prevMidi = diatonicMidiForScalePitch(prevNote.pitch, prevNote.octave, keySignature);
    let newOctave = prevNote.octave;
    let newMidiCheck = diatonicMidiForScalePitch(newPitch, newOctave, keySignature);
    if (stepDir > 0 && newMidiCheck <= prevMidi) newOctave++;
    if (stepDir < 0 && newMidiCheck >= prevMidi) newOctave--;
    if (newOctave < 3) continue;

    // Verify the fix doesn't create a new dissonance with bass
    const newTrebleMidi = diatonicMidiForScalePitch(newPitch, newOctave, keySignature);
    const newPcCheck = pitchClassInterval(pair.curBass.midi, newTrebleMidi);
    if (newPcCheck >= 0 && DISSONANT_PC.has(newPcCheck)) continue; // skip fix if it creates dissonance

    treble[tIdx] = { ...note, pitch: newPitch, octave: newOctave, accidental: '' };
    fixCount++;
  }
  return fixCount;
}

/**
 * Master counterpoint correction function.
 * Runs all corrections in order following voice-yielding policy:
 * melody adjusts first, bass contour preserved as much as possible.
 *
 * Mutates treble[] in place. Bass is NOT mutated (contour preservation).
 *
 * Correction order (repeated up to MAX_PASSES):
 * 1. Strong-beat dissonance → fix treble to nearest consonance
 * 2. Parallel perfect 5th/8th → fix treble by scale step
 * 3. Hidden perfect 5th/8th → fix treble approach
 * 4. Re-check strong-beat dissonance (pass 2/3 fixes may introduce new ones)
 */
export function applyCounterpointCorrections(
  treble: ScoreNote[],
  bass: ScoreNote[],
  timeSig: TimeSignature,
  keySignature: string,
  /** 1~9 멜로디 단계. 생략 시 기존과 같이 임시표 보정 허용. 고급 2(8) 이상만 임시표로 불협화 보정. */
  melodyLevel?: number,
): void {
  const scale = getScaleDegrees(keySignature);
  const barLength = getSixteenthsPerBar(timeSig);
  const allowWrittenAccidentals = false;

  const MAX_PASSES = 3;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let fixCount = 0;

    // Step 1: Fix strong-beat dissonances (melody adjusts)
    const trebleEvents = buildTimeline(treble, keySignature);
    const bassEvents = buildTimeline(bass, keySignature);
    const pairs = findVerticalPairs(trebleEvents, bassEvents, timeSig, barLength);

    for (const pair of pairs) {
      const pc = pitchClassInterval(pair.bassEvent.midi, pair.trebleEvent.midi);
      if (pc >= 0 && DISSONANT_PC.has(pc)) {
        if (fixTrebleDissonance(
          treble,
          pair.trebleEvent.index,
          pair.bassEvent.midi,
          keySignature,
          scale,
          allowWrittenAccidentals,
        )) fixCount++;
      }
    }

    // Step 2: Fix parallel perfect intervals (strong-beat sounding pairs)
    fixCount += fixParallelPerfectAtStrongBeats(treble, bass, timeSig, keySignature, scale);

    // Step 3: Fix parallel perfect intervals (simultaneous onsets — legacy)
    fixCount += fixParallelPerfectCorrection(treble, bass, keySignature, scale);

    // Step 4: Fix hidden perfect intervals
    fixCount += fixHiddenPerfectCorrection(treble, bass, keySignature, scale);

    // No more fixes needed → stop early
    if (fixCount === 0) break;
  }
}
