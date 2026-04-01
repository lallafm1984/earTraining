// ────────────────────────────────────────────────────────────────
// Two-voice generation (bass v4 + melody v4 + counterpoint)
// Spec: temp/ear_training_bass_prompt_v4.md, temp/ear_training_melody_prompt_v4.md
// ────────────────────────────────────────────────────────────────

export type {
  BassLevel,
  TimeSignature,
  ScaleMode,
  BassDirectionPattern,
  TwoVoiceBassOptions,
  BassNote,
  BassPatternDef,
  ValidationResult,
  Violation,
} from './types';

export { generateTwoVoiceBass } from './bassGenerator';
export { validateBass } from './validator';

export { generateTwoVoiceMelody, generateMelody } from './melodyGenerator';
export type { TwoVoiceMelodyOptions, MelodyGeneratorOptions } from './melodyGenerator';

export {
  validateStrongBeatConsonance,
  detectParallelPerfect,
  detectHiddenPerfect,
  checkContraryMotionRatio,
  validateNonHarmonicTones,
  validateVoiceSpacing,
  validateFinalInterval,
  applyCounterpointCorrections,
} from './counterpoint';

export {
  STRONG_BEAT_MAP,
  BASS_DURATION_MAP,
  MEASURE_TOTAL,
  BASS_RANGE,
  getScaleInfo,
} from './scales';

export {
  barTotalEighths,
  isCompoundMeter,
  strongBeatOffsetsEighths0,
  strongBeatOffsetsSixteenths0,
} from './meter';

export { getMelodyMotionParams, inferChordDegreeFromBassMidi } from './melodyScoreParity';

export { bassLineToScoreNotes } from './bassToScore';
export { generateTwoVoiceStack } from './twoVoiceStack';
export type { TwoVoiceStackInput, TwoVoiceStackResult } from './twoVoiceStack';

export { generateBassWithRetry } from './bassWithRetry';

export { ALL_BASS_PATTERNS, getApplicablePatterns, getPatternById, selectRandomPattern } from './bassPatterns';
