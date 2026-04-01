// ────────────────────────────────────────────────────────────────
// 2성부 멜로디 리듬 — scoreGenerator DURATION_POOL / LEVEL_PARAMS 리듬 필드와 동기화
// (melodyGenerator가 scoreGenerator를 import하지 않도록 분리)
// ────────────────────────────────────────────────────────────────

/** 16분음표 단위 풀 — scoreGenerator DURATION_POOL 과 동일 */
const DURATION_POOL_BY_LEVEL: Record<number, number[]> = {
  1: [16, 8],
  2: [12, 8, 4],
  3: [12, 8, 4, 2],
  4: [8, 6, 4, 4, 2, 2],
  5: [8, 6, 4, 4, 2, 2],
  6: [12, 8, 6, 4, 4, 4, 2, 2, 1],
  7: [8, 6, 6, 4, 4, 4, 3, 2, 1],
  8: [8, 6, 6, 4, 4, 4, 3, 2, 1],
  9: [8, 6, 6, 4, 4, 4, 3, 2, 1],
};

/** LEVEL_PARAMS 중 리듬·셋잇단 관련만 — scoreGenerator 와 동일 */
const RHYTHM_PARAMS_BY_LEVEL: Record<number, {
  syncopationProb: number;
  dottedProb: number;
  tieProb: number;
  tripletProb: number;
  tripletBudget: [number, number];
}> = {
  1: { syncopationProb: 0, dottedProb: 0, tieProb: 0, tripletProb: 0, tripletBudget: [0, 0] },
  2: { syncopationProb: 0, dottedProb: 0.35, tieProb: 0, tripletProb: 0, tripletBudget: [0, 0] },
  3: { syncopationProb: 0, dottedProb: 0.25, tieProb: 0, tripletProb: 0, tripletBudget: [0, 0] },
  4: { syncopationProb: 0, dottedProb: 0.80, tieProb: 0, tripletProb: 0, tripletBudget: [0, 0] },
  5: { syncopationProb: 0.30, dottedProb: 0.22, tieProb: 0.30, tripletProb: 0, tripletBudget: [0, 0] },
  6: { syncopationProb: 0.26, dottedProb: 0.22, tieProb: 0.20, tripletProb: 0, tripletBudget: [0, 0] },
  7: { syncopationProb: 0.22, dottedProb: 0.38, tieProb: 0.25, tripletProb: 0, tripletBudget: [0, 0] },
  8: { syncopationProb: 0.22, dottedProb: 0.30, tieProb: 0.25, tripletProb: 0, tripletBudget: [0, 0] },
  9: { syncopationProb: 0.26, dottedProb: 0.30, tieProb: 0.25, tripletProb: 0.50, tripletBudget: [1, 3] },
};

export function getDurationPoolForMelodyLevel(level: number): number[] {
  const k = Math.max(1, Math.min(9, Math.floor(level)));
  return DURATION_POOL_BY_LEVEL[k];
}

export interface TrebleRhythmParams {
  syncopationProb: number;
  dottedProb: number;
  tieProb: number;
  tripletProb: number;
  tripletBudget: [number, number];
}

export function getTrebleRhythmParamsForMelodyLevel(level: number): TrebleRhythmParams {
  const k = Math.max(1, Math.min(9, Math.floor(level)));
  return { ...RHYTHM_PARAMS_BY_LEVEL[k] };
}
