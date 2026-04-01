// ─────────────────────────────────────────────────────────────
// Lib barrel – 핵심 비즈니스 로직 모듈을 단일 진입점으로 제공
// ─────────────────────────────────────────────────────────────

// Supabase 클라이언트 (웹 프로젝트는 별도 경로)
// export { supabase } from './supabase';

// 악보 유틸리티
export * from './scoreUtils';

// 악보 생성 엔진
export {
  generateScore,
  getDifficultyCategory,
  BASS_DIFF_LABELS,
  BASS_DIFF_DESC,
} from './scoreGenerator';
export type {
  Difficulty,
  BassDifficulty,
  DifficultyCategory,
  GeneratorOptions,
  GeneratedScore,
} from './scoreGenerator';

// Gen 포인트 비용 계산
export { getGenCost, getMeasureExtraCost, BASS_EXTRA_COSTS } from './genCost';

// 멜로디 리듬 레벨
export {
  getDurationPoolForMelodyLevel,
  getTrebleRhythmParamsForMelodyLevel,
} from './melodyRhythmLevel';
export type { TrebleRhythmParams } from './melodyRhythmLevel';

// 트레블 리듬 채우기
export { fillRhythm, variateSixteenthNoteRuns } from './trebleRhythmFill';

// 2성부 생성 모듈
export * from './twoVoice';
