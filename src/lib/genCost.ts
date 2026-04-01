// ─────────────────────────────────────────────────────────────
// Gen 포인트 비용 계산
// ─────────────────────────────────────────────────────────────

import type { Difficulty, BassDifficulty } from './scoreGenerator';

/** 베이스 난이도별 추가 Gen 비용 */
export const BASS_EXTRA_COSTS: Record<BassDifficulty, number> = {
  bass_1: 2, bass_2: 4, bass_3: 6, bass_4: 8,
};

/**
 * 난이도 9단계별 Gen 비용 테이블 (단선율 기준)
 * 큰보표 사용 시 BASS_EXTRA_COSTS[bassDifficulty]가 별도 추가됩니다.
 */
const GEN_COST_TABLE: Record<Difficulty, number> = {
  beginner_1:      8,
  beginner_2:     10,
  beginner_3:     12,
  intermediate_1: 14,
  intermediate_2: 16,
  intermediate_3: 18,
  advanced_1:     20,
  advanced_2:     22,
  advanced_3:     24,
};

/**
 * 마디 수에 따른 추가 Gen 비용 (단선율·큰보표 동일)
 *
 *   4마디:       +0
 *   8마디:       +5
 *   12마디:      +10
 *   16마디 이상: +15
 *
 * 큰보표 프리미엄은 난이도 기본 비용(GEN_COST_TABLE)에서만 적용 (× 1.5)
 */
export function getMeasureExtraCost(measures: number): number {
  if (measures >= 16) return 6;
  if (measures >= 12) return 4;
  if (measures >= 8)  return 2;
  return 0;
}

/**
 * AI 자동생성 시 차감할 Gen 비용을 반환합니다.
 * @param difficulty    - 선택된 난이도
 * @param useGrandStaff - 큰보표 사용 여부 (기본 비용에만 프리미엄 적용)
 * @param measures      - 생성 마디 수 (기본 4마디, 8마디부터 추가 비용)
 */
export function getGenCost(
  difficulty: Difficulty,
  measures: number = 4,
): number {
  return GEN_COST_TABLE[difficulty] + getMeasureExtraCost(measures);
}

