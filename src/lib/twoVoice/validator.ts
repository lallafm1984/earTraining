// ────────────────────────────────────────────────────────────────
// Two-Voice Bass Validator
// ────────────────────────────────────────────────────────────────
//
// Validates generated bass lines against the rules from
// bass_prompt_v4.md §검증 체크리스트.
//
// Checks: duration sums, measure count, tonic start/end,
// level-specific rules (L1/L2/L3), key rules, cadence, range.
// ────────────────────────────────────────────────────────────────

import type { BassNote, BassLevel, TwoVoiceBassOptions, ValidationResult, Violation } from './types';
import { MEASURE_TOTAL, BASS_RANGE, BASS_DURATION_MAP, getScaleInfo } from './scales';
import type { TimeSignature } from './types';

// ────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────

/**
 * Group bass notes by measure index.
 */
function groupByMeasure(bass: BassNote[]): Map<number, BassNote[]> {
  const groups = new Map<number, BassNote[]>();
  for (const note of bass) {
    const arr = groups.get(note.measure) ?? [];
    arr.push(note);
    groups.set(note.measure, arr);
  }
  return groups;
}

/**
 * Compute the interval in scale degrees between two noteNums.
 * Returns absolute distance. 0 = same note, 1 = 2nd, 2 = 3rd, etc.
 */
function scaleDegreeInterval(a: number, b: number): number {
  return Math.abs(a - b);
}

/**
 * Rough semitone distance from noteNum using a simple model.
 * Assumes a 7-note diatonic scale with standard semitone pattern.
 * This is an approximation; exact values depend on the specific key.
 * Major: 2,2,1,2,2,2,1  Minor: 2,1,2,2,1,3,1 (harmonic)
 */
function estimateSemitones(
  noteNumA: number,
  noteNumB: number,
  mode: 'major' | 'harmonic_minor',
): number {
  const majorPattern = [2, 2, 1, 2, 2, 2, 1]; // C D E F G A B
  const minorPattern = [2, 1, 2, 2, 1, 3, 1]; // A B C D E F G#
  const pattern = mode === 'major' ? majorPattern : minorPattern;

  const from = Math.min(noteNumA, noteNumB);
  const to = Math.max(noteNumA, noteNumB);
  let semitones = 0;
  for (let i = from; i < to; i++) {
    const deg = ((i % 7) + 7) % 7;
    semitones += pattern[deg];
  }
  return semitones;
}

/**
 * Convert noteNum to approximate MIDI for range checking.
 * bass noteNum 0 = root at bass base octave.
 * For range checking, we use a rough mapping:
 *   MIDI ≈ baseMidi + sum of semitone intervals from 0 to noteNum
 */
function noteNumToApproxMidi(
  noteNum: number,
  baseMidi: number,
  mode: 'major' | 'harmonic_minor',
): number {
  if (noteNum === 0) return baseMidi;
  if (noteNum > 0) return baseMidi + estimateSemitones(0, noteNum, mode);
  return baseMidi - estimateSemitones(noteNum, 0, mode);
}

/**
 * Check if a noteNum pair forms an augmented 2nd in harmonic minor.
 * Aug2 = 6th degree → 7th degree (raised) going upward.
 * In 0-based scale degrees: degree 5 → degree 6 (which is the aug2 pair).
 */
function isAugmentedSecond(noteNumA: number, noteNumB: number): boolean {
  const degA = ((noteNumA % 7) + 7) % 7;
  const degB = ((noteNumB % 7) + 7) % 7;
  // 6th to #7th (scale indices 5→6) ascending
  return (degA === 5 && degB === 6 && noteNumB > noteNumA);
}

/**
 * Check if noteNum is the leading tone (#7, scale degree index 6).
 */
function isLeadingTone(noteNum: number): boolean {
  return ((noteNum % 7) + 7) % 7 === 6;
}

/**
 * Check if noteNum is the tonic (scale degree index 0).
 */
function isTonic(noteNum: number): boolean {
  return ((noteNum % 7) + 7) % 7 === 0;
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────

/**
 * Comprehensive bass line validation.
 *
 * Checks (reference: bass_prompt_v4.md §검증 체크리스트):
 *
 * BASIC:
 *   - Each measure duration sum matches time signature
 *   - Total measure count matches opts.measures
 *   - First and last note are tonic
 *
 * LEVEL 1:
 *   - Exactly 1 note per measure
 *   - Adjacent measure interval ≤ 5th (scale degrees)
 *
 * LEVEL 2:
 *   - All adjacent intervals are stepwise (scale degree 1 = 2nd)
 *   - Consecutive semitones (minor 2nd) ≤ 2
 *   - No augmented 2nd (6→#7 in harmonic minor)
 *
 * LEVEL 3:
 *   - No forbidden leaps (7th, aug4th/5th, 9th+)
 *   - After leap of 4th+: compensating motion in opposite direction
 *   - Same-direction consecutive leaps ≤ 2 (arpeggio ≤ 3)
 *   - Augmented 2nd only ascending (harmonic minor)
 *
 * KEY:
 *   - Harmonic minor: #7 resolves to tonic
 *   - Harmonic minor L1-L2: no augmented 2nd
 *
 * CADENCE:
 *   - Last 2 measures contain V→I(i)
 *
 * RANGE:
 *   - All notes within level-specific MIDI range
 */
export function validateBass(opts: TwoVoiceBassOptions, bass: BassNote[]): ValidationResult {
  const violations: Violation[] = [];
  const measureTotal = MEASURE_TOTAL[opts.timeSig];
  const measures = groupByMeasure(bass);
  const range = BASS_RANGE[opts.bassLevel];

  // ── Basic checks ──────────────────────────────────────────────

  // Duration sum per measure
  for (const [mIdx, notes] of measures) {
    const sum = notes.reduce((s, n) => s + n.duration, 0);
    if (sum !== measureTotal) {
      violations.push({
        type: 'duration_sum',
        message: `Measure ${mIdx + 1}: duration sum ${sum} ≠ expected ${measureTotal}`,
        measure: mIdx,
        severity: 'error',
      });
    }
  }

  // Total measure count
  const totalMeasures = measures.size;
  if (totalMeasures !== opts.measures) {
    violations.push({
      type: 'measure_count',
      message: `Total measures ${totalMeasures} ≠ expected ${opts.measures}`,
      severity: 'error',
    });
  }

  // First and last note are tonic
  if (bass.length > 0) {
    if (!isTonic(bass[0].noteNum)) {
      violations.push({
        type: 'tonic_start',
        message: `First note (noteNum=${bass[0].noteNum}) is not tonic`,
        measure: 0,
        severity: 'error',
      });
    }
    const lastNote = bass[bass.length - 1];
    if (!isTonic(lastNote.noteNum)) {
      violations.push({
        type: 'tonic_end',
        message: `Last note (noteNum=${lastNote.noteNum}) is not tonic`,
        measure: lastNote.measure,
        severity: 'error',
      });
    }
  }

  // ── Level-specific checks ─────────────────────────────────────

  if (opts.bassLevel === 1) {
    // L1: exactly 1 note per measure
    for (const [mIdx, notes] of measures) {
      if (notes.length !== 1) {
        violations.push({
          type: 'l1_notes_per_bar',
          message: `L1: Measure ${mIdx + 1} has ${notes.length} notes (expected 1)`,
          measure: mIdx,
          severity: 'error',
        });
      }
    }

    // L1: 인접 마디 근음 |Δ| ≤ 3 (3도 이내 또는 4도)
    const measureRoots = Array.from(measures.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, notes]) => notes[0]?.noteNum ?? 0);
    for (let i = 1; i < measureRoots.length; i++) {
      const interval = scaleDegreeInterval(measureRoots[i], measureRoots[i - 1]);
      if (interval > 3) {
        violations.push({
          type: 'l1_leap_limit',
          message: `L1: |Δ|=${interval} between measures ${i} and ${i + 1} exceeds 4th (max span 3)`,
          measure: i,
          severity: 'error',
        });
      }
    }
  }

  if (opts.bassLevel === 2) {
    // L2: all adjacent intervals are stepwise (2nd = 1 scale degree)
    let consecutiveSemitones = 0;
    for (let i = 1; i < bass.length; i++) {
      const interval = scaleDegreeInterval(bass[i].noteNum, bass[i - 1].noteNum);
      if (interval > 1) {
        violations.push({
          type: 'l2_not_stepwise',
          message: `L2: Non-stepwise interval (${interval + 1}th) between notes ${i} and ${i + 1}`,
          measure: bass[i].measure,
          severity: 'error',
        });
      }

      // Consecutive semitone tracking
      const semitones = estimateSemitones(bass[i - 1].noteNum, bass[i].noteNum, opts.mode);
      if (semitones === 1) {
        consecutiveSemitones++;
        if (consecutiveSemitones > 2) {
          violations.push({
            type: 'l2_consecutive_semitones',
            message: `L2: More than 2 consecutive semitones at note ${i + 1}`,
            measure: bass[i].measure,
            severity: 'error',
          });
        }
      } else {
        consecutiveSemitones = 0;
      }

      // No augmented 2nd
      if (opts.mode === 'harmonic_minor' && isAugmentedSecond(bass[i - 1].noteNum, bass[i].noteNum)) {
        violations.push({
          type: 'l2_augmented_second',
          message: `L2: Augmented 2nd (6→#7) at note ${i + 1}`,
          measure: bass[i].measure,
          severity: 'error',
        });
      }
    }
  }

  if (opts.bassLevel === 3) {
    // L3: 5th (scale step 4) allowed, max 1 per 4 bars
    let sameDirectionLeaps = 0;
    let prevDirection = 0;
    const notesPerBar = BASS_DURATION_MAP[opts.timeSig].notesPerBar.level3;
    const blockSize = 4 * notesPerBar;

    // Count 5th leaps per 4-bar block
    const fifthLeapsByBlock = new Map<number, number>();

    for (let i = 1; i < bass.length; i++) {
      const interval = scaleDegreeInterval(bass[i].noteNum, bass[i - 1].noteNum);
      const semitones = estimateSemitones(bass[i - 1].noteNum, bass[i].noteNum, opts.mode);
      const direction = bass[i].noteNum > bass[i - 1].noteNum ? 1 : (bass[i].noteNum < bass[i - 1].noteNum ? -1 : 0);
      const isLeap = interval >= 2;

      // Max span: 5th (scale step 4)
      if (interval > 4) {
        violations.push({
          type: 'l3_forbidden_leap',
          message: `L3: Melodic span exceeds 5th (|Δ|=${interval}) at note ${i + 1}`,
          measure: bass[i].measure,
          severity: 'error',
        });
      }

      // Tritone / aug5 forbidden
      if (semitones === 6 && interval >= 3) {
        violations.push({
          type: 'l3_forbidden_leap',
          message: `L3: Forbidden augmented interval (tritone) at note ${i + 1}`,
          measure: bass[i].measure,
          severity: 'error',
        });
      }

      // Track 5th leaps per 4-bar block
      if (interval === 4) {
        const noteIndex = i;
        const blockIdx = Math.floor(noteIndex / blockSize);
        fifthLeapsByBlock.set(blockIdx, (fifthLeapsByBlock.get(blockIdx) || 0) + 1);
      }

      // Same-direction consecutive leaps
      if (isLeap && direction !== 0) {
        if (direction === prevDirection) {
          sameDirectionLeaps++;
          if (sameDirectionLeaps > 2) {
            violations.push({
              type: 'l3_consecutive_leaps',
              message: `L3: ${sameDirectionLeaps + 1} consecutive same-direction leaps at note ${i + 1}`,
              measure: bass[i].measure,
              severity: 'error',
            });
          }
        } else {
          sameDirectionLeaps = 1;
        }
        prevDirection = direction;
      } else if (!isLeap) {
        sameDirectionLeaps = 0;
        prevDirection = 0;
      }

      // Augmented 2nd forbidden at L3
      if (opts.mode === 'harmonic_minor') {
        const degA = ((bass[i - 1].noteNum % 7) + 7) % 7;
        const degB = ((bass[i].noteNum % 7) + 7) % 7;
        if ((degA === 5 && degB === 6 && bass[i].noteNum > bass[i - 1].noteNum) ||
            (degA === 6 && degB === 5 && bass[i].noteNum < bass[i - 1].noteNum)) {
          violations.push({
            type: 'l3_augmented_second',
            message: `L3: Augmented 2nd at note ${i + 1}`,
            measure: bass[i].measure,
            severity: 'error',
          });
        }
      }
    }

    // Check 5th leap frequency: max 1 per 4-bar block
    for (const [blockIdx, count] of fifthLeapsByBlock) {
      if (count > 1) {
        violations.push({
          type: 'l3_fifth_leap_frequency',
          message: `L3: ${count} fifth leaps in 4-bar block ${blockIdx + 1} (max 1)`,
          severity: 'warning',
        });
      }
    }

    // 4th+ leap compensation check
    for (let i = 1; i < bass.length - 1; i++) {
      const interval = scaleDegreeInterval(bass[i].noteNum, bass[i - 1].noteNum);
      if (interval >= 3) {
        const leapDir = bass[i].noteNum > bass[i - 1].noteNum ? 1 : -1;
        const nextDir = bass[i + 1].noteNum > bass[i].noteNum ? 1 : (bass[i + 1].noteNum < bass[i].noteNum ? -1 : 0);
        if (nextDir !== 0 && nextDir !== -leapDir) {
          violations.push({
            type: 'l3_no_compensation',
            message: `L4: No compensating motion after ${interval + 1}th leap at note ${i + 1}`,
            measure: bass[i].measure,
            severity: 'warning',
          });
        }
      }
    }
  }

  if (opts.bassLevel === 4) {
    // ── L4 음정 검증 ──
    // 6도 이상 금지 (5도까지 자유), tritone/aug5 금지
    for (let i = 1; i < bass.length; i++) {
      const interval = scaleDegreeInterval(bass[i].noteNum, bass[i - 1].noteNum);
      const semitones = estimateSemitones(bass[i - 1].noteNum, bass[i].noteNum, opts.mode);

      // Max span: 5th (scale step 4), 6도+ 금지
      if (interval > 4) {
        violations.push({
          type: 'l4_forbidden_leap',
          message: `L4: Melodic span exceeds 5th (|Δ|=${interval}) at note ${i + 1}`,
          measure: bass[i].measure,
          severity: 'error',
        });
      }

      // Tritone / aug5 forbidden
      if (semitones === 6 && interval >= 3) {
        violations.push({
          type: 'l4_forbidden_leap',
          message: `L4: Forbidden augmented interval (tritone) at note ${i + 1}`,
          measure: bass[i].measure,
          severity: 'error',
        });
      }

      // Augmented 2nd forbidden at L4
      if (opts.mode === 'harmonic_minor') {
        const degA = ((bass[i - 1].noteNum % 7) + 7) % 7;
        const degB = ((bass[i].noteNum % 7) + 7) % 7;
        if ((degA === 5 && degB === 6 && bass[i].noteNum > bass[i - 1].noteNum) ||
            (degA === 6 && degB === 5 && bass[i].noteNum < bass[i - 1].noteNum)) {
          violations.push({
            type: 'l4_augmented_second',
            message: `L4: Augmented 2nd at note ${i + 1}`,
            measure: bass[i].measure,
            severity: 'error',
          });
        }
      }

      // 8분음표 위치에서 도약 금지 (순차 경과음만 허용)
      if (bass[i].duration === 1 && interval > 1) {
        violations.push({
          type: 'l4_eighth_note_leap',
          message: `L4: Leap (${interval + 1}th) on 8th note position at note ${i + 1}`,
          measure: bass[i].measure,
          severity: 'warning',
        });
      }
      // 직전 음이 8분이면서 도약한 경우도 체크
      if (bass[i - 1].duration === 1 && interval > 1) {
        violations.push({
          type: 'l4_eighth_note_leap',
          message: `L4: Leap (${interval + 1}th) from 8th note at note ${i}→${i + 1}`,
          measure: bass[i].measure,
          severity: 'warning',
        });
      }
    }

    // ── L4 화성적 뼈대 검증: 마디 첫 박 = 화성 근음(I,ii,iii,IV,V,vi) ──
    const chordRootDegrees = new Set([0, 1, 2, 3, 4, 5]); // I~vi
    for (const [mIdx, mNotes] of measures) {
      if (mNotes.length > 0) {
        const firstDeg = ((mNotes[0].noteNum % 7) + 7) % 7;
        if (!chordRootDegrees.has(firstDeg)) {
          violations.push({
            type: 'l4_strong_beat_root',
            message: `L4: Measure ${mIdx + 1} first beat (deg=${firstDeg}) is not a chord root`,
            measure: mIdx,
            severity: 'warning',
          });
        }
      }
    }

    // ── L4 리듬 검증 ──
    const isCompound = opts.timeSig === '6/8' || opts.timeSig === '9/8' || opts.timeSig === '12/8';

    // 리듬 다양성: 8마디 블록당 최소 3종류 패턴
    for (let blockStart = 0; blockStart < opts.measures; blockStart += 8) {
      const blockEnd = Math.min(blockStart + 8, opts.measures);
      const patternSignatures = new Set<string>();
      for (let m = blockStart; m < blockEnd; m++) {
        const mNotes = measures.get(m) ?? [];
        const sig = mNotes.map(n => n.duration).join(',');
        patternSignatures.add(sig);
      }
      if (patternSignatures.size < 3 && (blockEnd - blockStart) >= 4) {
        violations.push({
          type: 'l4_rhythm_diversity',
          message: `L4: Only ${patternSignatures.size} rhythm patterns in bars ${blockStart + 1}-${blockEnd} (min 3)`,
          severity: 'warning',
        });
      }
    }

    // 8분 시작 마디 제한: 8마디당 최대 2회
    for (let blockStart = 0; blockStart < opts.measures; blockStart += 8) {
      const blockEnd = Math.min(blockStart + 8, opts.measures);
      let eighthStartCount = 0;
      for (let m = blockStart; m < blockEnd; m++) {
        const mNotes = measures.get(m) ?? [];
        if (mNotes.length > 0 && mNotes[0].duration === 1) {
          eighthStartCount++;
        }
      }
      if (eighthStartCount > 2) {
        violations.push({
          type: 'l4_eighth_start_excess',
          message: `L4: ${eighthStartCount} measures start with 8th note in bars ${blockStart + 1}-${blockEnd} (max 2)`,
          severity: 'warning',
        });
      }
    }

    // 마지막 마디: 긴 음가로 마무리
    const lastMeasureNotes4 = measures.get(opts.measures - 1) ?? [];
    if (lastMeasureNotes4.length > 0) {
      const lastDur = lastMeasureNotes4[lastMeasureNotes4.length - 1].duration;
      const longThreshold = isCompound ? 3 : 4;
      if (lastDur < longThreshold) {
        violations.push({
          type: 'l4_cadence_rhythm',
          message: `L4: Last measure ends with short note (duration=${lastDur})`,
          measure: opts.measures - 1,
          severity: 'warning',
        });
      }
    }

    // 홑박자 점음가 금지 검증
    if (!isCompound) {
      for (let i = 0; i < bass.length; i++) {
        const dur = bass[i].duration;
        if (dur === 3 || dur === 6) {
          violations.push({
            type: 'l4_dotted_note',
            message: `L4: Dotted note (duration=${dur}) in simple meter at note ${i + 1}`,
            measure: bass[i].measure,
            severity: 'error',
          });
        }
      }
    }
  }

  // ── Key checks ────────────────────────────────────────────────

  if (opts.mode === 'harmonic_minor') {
    // #7 must resolve to tonic
    for (let i = 0; i < bass.length; i++) {
      if (isLeadingTone(bass[i].noteNum)) {
        const next = bass[i + 1];
        if (!next || !isTonic(next.noteNum) || next.noteNum <= bass[i].noteNum) {
          violations.push({
            type: 'leading_tone_resolution',
            message: `Leading tone (#7) at note ${i + 1} does not resolve up to tonic`,
            measure: bass[i].measure,
            severity: 'error',
          });
        }
      }
    }

    // L1-L2: no augmented 2nd (already checked in L2 above, also check L1)
    if (opts.bassLevel === 1) {
      const measureRoots = Array.from(measures.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, notes]) => notes[0]?.noteNum ?? 0);
      for (let i = 1; i < measureRoots.length; i++) {
        if (isAugmentedSecond(measureRoots[i - 1], measureRoots[i])) {
          violations.push({
            type: 'l1_augmented_second',
            message: `L1: Augmented 2nd between measures ${i} and ${i + 1}`,
            measure: i,
            severity: 'error',
          });
        }
      }
    }
  }

  // ── Cadence check ─────────────────────────────────────────────

  // Last 2 measures should contain V→I(i) (dominant = degree 4, tonic = degree 0)
  if (opts.measures >= 2) {
    const lastMeasureNotes = measures.get(opts.measures - 1) ?? [];
    const penultimateMeasureNotes = measures.get(opts.measures - 2) ?? [];

    const hasDominantInPenultimate = penultimateMeasureNotes.some(n => {
      const deg = ((n.noteNum % 7) + 7) % 7;
      return deg === 4; // V degree
    });
    const hasTonicInLast = lastMeasureNotes.some(n => isTonic(n.noteNum));

    if (!hasDominantInPenultimate || !hasTonicInLast) {
      violations.push({
        type: 'cadence',
        message: `Missing V→I(i) cadence in last 2 measures`,
        measure: opts.measures - 2,
        severity: 'warning',
      });
    }
  }

  // ── Range check ───────────────────────────────────────────────

  // Estimate a base MIDI for the root note. Common: C, = MIDI 36
  // We use BASS_RANGE which gives absolute MIDI bounds
  for (let i = 0; i < bass.length; i++) {
    // Approximate MIDI: use a base of 36 (C,) for most keys
    // This is a rough check; actual MIDI depends on the key
    const approxMidi = noteNumToApproxMidi(bass[i].noteNum, 36, opts.mode);
    if (approxMidi < range.low) {
      violations.push({
        type: 'range_low',
        message: `Note ${i + 1} (approx MIDI ${approxMidi}) below L${opts.bassLevel} range (${range.low})`,
        measure: bass[i].measure,
        severity: 'warning',
      });
    }
    if (approxMidi > range.high) {
      violations.push({
        type: 'range_high',
        message: `Note ${i + 1} (approx MIDI ${approxMidi}) above L${opts.bassLevel} range (${range.high})`,
        measure: bass[i].measure,
        severity: 'warning',
      });
    }
  }

  return {
    passed: violations.filter(v => v.severity === 'error').length === 0,
    violationCount: violations.length,
    violations,
  };
}
