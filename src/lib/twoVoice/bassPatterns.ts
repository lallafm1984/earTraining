// ────────────────────────────────────────────────────────────────
// Two-Voice Bass Generator — Direction Pattern Data (45+ patterns)
// ────────────────────────────────────────────────────────────────

import type { BassPatternDef, BassLevel } from './types';

// ────────────────────────────────────────────────────────────────
// 4-measure patterns (6)
// ────────────────────────────────────────────────────────────────

const PATTERNS_4: BassPatternDef[] = [
  {
    id: 'desc_4',
    measures: 4,
    name: '완전 하행',
    contour: ['desc', 'desc', 'desc', 'desc'],
    applicableLevels: [2, 3, 4],
    description: 'Continuous descending motion across 4 bars',
  },
  {
    id: 'asc_4',
    measures: 4,
    name: '완전 상행',
    contour: ['asc', 'asc', 'asc', 'asc'],
    applicableLevels: [2, 3, 4],
    description: 'Continuous ascending motion across 4 bars',
  },
  {
    id: 'valley_4',
    measures: 4,
    name: '골짜기',
    contour: ['desc', 'desc', 'asc', 'asc'],
    applicableLevels: [2, 3, 4],
    description: 'Descend then ascend forming a valley shape',
  },
  {
    id: 'mountain_4',
    measures: 4,
    name: '산형',
    contour: ['asc', 'asc', 'desc', 'desc'],
    applicableLevels: [2, 3, 4],
    description: 'Ascend then descend forming a mountain shape',
  },
  {
    id: 'wave_4',
    measures: 4,
    name: '파동',
    contour: ['desc', 'asc', 'desc', 'asc'],
    applicableLevels: [2, 3, 4],
    description: 'Alternating descent and ascent wave pattern',
  },
  {
    id: 'pedal_4',
    measures: 4,
    name: '페달+순차',
    contour: ['hold', 'hold', 'desc', 'desc'],
    applicableLevels: [2, 3, 4],
    description: 'Hold on tonic pedal then stepwise descent',
  },
];

// ────────────────────────────────────────────────────────────────
// 8-measure patterns (14)
// ────────────────────────────────────────────────────────────────

const PATTERNS_8: BassPatternDef[] = [
  {
    id: 'desc_8',
    measures: 8,
    name: '완전 하행',
    contour: ['desc', 'desc', 'desc', 'desc', 'desc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Octave descent with cadential ending',
  },
  {
    id: 'asc_8',
    measures: 8,
    name: '완전 상행',
    contour: ['asc', 'asc', 'asc', 'asc', 'asc', 'asc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Octave ascent with descending cadence',
  },
  {
    id: 'valley_8',
    measures: 8,
    name: '골짜기',
    contour: ['desc', 'desc', 'desc', 'desc', 'asc', 'asc', 'asc', 'asc'],
    applicableLevels: [2, 3, 4],
    description: '4-bar descent then 4-bar ascent',
  },
  {
    id: 'mountain_8',
    measures: 8,
    name: '산형',
    contour: ['asc', 'asc', 'asc', 'asc', 'desc', 'desc', 'desc', 'desc'],
    applicableLevels: [2, 3, 4],
    description: '4-bar ascent then 4-bar descent',
  },
  {
    id: 'double_arch_8',
    measures: 8,
    name: '이중 아치',
    contour: ['desc', 'desc', 'asc', 'asc', 'desc', 'desc', 'asc', 'asc'],
    applicableLevels: [2, 3, 4],
    description: 'Two 2-bar arch patterns repeated',
  },
  {
    id: 'wave_desc_8',
    measures: 8,
    name: '하행 파동',
    contour: ['desc', 'asc', 'desc', 'desc', 'asc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Wave-like motion with overall descent',
  },
  {
    id: 'wave_asc_8',
    measures: 8,
    name: '상행 파동',
    contour: ['asc', 'desc', 'asc', 'asc', 'desc', 'asc', 'asc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Wave-like motion with overall ascent',
  },
  {
    id: 'wave_sym_8',
    measures: 8,
    name: '대칭 파동',
    contour: ['asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Symmetric wave with constant amplitude',
  },
  {
    id: 'step_hold_8',
    measures: 8,
    name: '계단형',
    contour: ['desc', 'hold', 'desc', 'hold', 'desc', 'hold', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Alternating step down and hold',
  },
  {
    id: 'spiral_down_8',
    measures: 8,
    name: '나선 하행',
    contour: ['asc', 'desc', 'desc', 'asc', 'desc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Spiral motion with gradual descent',
  },
  {
    id: 'spiral_up_8',
    measures: 8,
    name: '나선 상행',
    contour: ['desc', 'asc', 'asc', 'desc', 'asc', 'asc', 'asc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Spiral motion with gradual ascent',
  },
  {
    id: 'tetra_link_8',
    measures: 8,
    name: '테트라코드',
    contour: ['asc', 'asc', 'asc', 'desc', 'desc', 'desc', 'asc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: '4-note tetrachord units linked together',
  },
  {
    id: 'pedal_start_8',
    measures: 8,
    name: '페달 출발',
    contour: ['hold', 'hold', 'hold', 'desc', 'desc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Tonic pedal then stepwise motion',
  },
  {
    id: 'pedal_mid_8',
    measures: 8,
    name: '중간 페달',
    contour: ['desc', 'desc', 'hold', 'hold', 'desc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Stepwise then dominant pedal then stepwise',
  },
];

// ────────────────────────────────────────────────────────────────
// 12-measure patterns (10)
// ────────────────────────────────────────────────────────────────

const PATTERNS_12: BassPatternDef[] = [
  {
    id: 'desc_asc_desc_12',
    measures: 12,
    name: '하행-상행-하행',
    contour: ['desc', 'desc', 'desc', 'desc', 'asc', 'asc', 'asc', 'asc', 'desc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: '3-section (4+4+4) descent-ascent-descent',
  },
  {
    id: 'valley_12',
    measures: 12,
    name: '대형 골짜기',
    contour: ['desc', 'desc', 'desc', 'desc', 'desc', 'desc', 'asc', 'asc', 'asc', 'asc', 'asc', 'asc'],
    applicableLevels: [2, 3, 4],
    description: '6-bar descent then 6-bar ascent',
  },
  {
    id: 'mountain_12',
    measures: 12,
    name: '대형 산',
    contour: ['asc', 'asc', 'asc', 'asc', 'asc', 'asc', 'desc', 'desc', 'desc', 'desc', 'desc', 'desc'],
    applicableLevels: [2, 3, 4],
    description: '6-bar ascent then 6-bar descent',
  },
  {
    id: 'triple_arch_12',
    measures: 12,
    name: '삼중 아치',
    contour: ['asc', 'asc', 'desc', 'desc', 'asc', 'asc', 'desc', 'desc', 'asc', 'asc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Three 4-bar arches',
  },
  {
    id: 'wave_3cycle_12',
    measures: 12,
    name: '3주기 파동',
    contour: ['desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: '4-bar wave pattern repeated 3 times',
  },
  {
    id: 'wave_expand_12',
    measures: 12,
    name: '확장 파동',
    contour: ['desc', 'asc', 'desc', 'desc', 'asc', 'asc', 'desc', 'desc', 'desc', 'asc', 'asc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Wave with increasing amplitude',
  },
  {
    id: 'wave_contract_12',
    measures: 12,
    name: '수축 파동',
    contour: ['desc', 'desc', 'asc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Wave with decreasing amplitude converging',
  },
  {
    id: 'spiral_down_12',
    measures: 12,
    name: '나선 하행',
    contour: ['asc', 'desc', 'desc', 'asc', 'desc', 'desc', 'asc', 'desc', 'desc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Gradual descent with spiral motion',
  },
  {
    id: 'pedal_book_12',
    measures: 12,
    name: '양단 페달',
    contour: ['hold', 'hold', 'desc', 'desc', 'asc', 'desc', 'asc', 'desc', 'desc', 'asc', 'hold', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Pedal tones at start and end with motion in middle',
  },
  {
    id: 'combo_ABA_12',
    measures: 12,
    name: '3부분 형식',
    contour: ['desc', 'desc', 'desc', 'hold', 'asc', 'desc', 'asc', 'desc', 'desc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'A(descent) + B(wave) + A\' ternary form',
  },
];

// ────────────────────────────────────────────────────────────────
// 16-measure patterns (13)
// ────────────────────────────────────────────────────────────────

const PATTERNS_16: BassPatternDef[] = [
  {
    id: 'desc_16',
    measures: 16,
    name: '완만 하행',
    contour: ['desc', 'desc', 'hold', 'desc', 'desc', 'hold', 'desc', 'desc', 'hold', 'desc', 'desc', 'hold', 'desc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Staircase-like slow descent',
  },
  {
    id: 'asc_16',
    measures: 16,
    name: '완만 상행',
    contour: ['asc', 'asc', 'hold', 'asc', 'asc', 'hold', 'asc', 'asc', 'hold', 'asc', 'asc', 'hold', 'asc', 'asc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Staircase-like slow ascent',
  },
  {
    id: 'valley_16',
    measures: 16,
    name: '대형 골짜기',
    contour: ['desc', 'desc', 'desc', 'desc', 'desc', 'desc', 'desc', 'desc', 'asc', 'asc', 'asc', 'asc', 'asc', 'asc', 'asc', 'asc'],
    applicableLevels: [2, 3, 4],
    description: '8-bar descent then 8-bar ascent',
  },
  {
    id: 'mountain_16',
    measures: 16,
    name: '대형 산',
    contour: ['asc', 'asc', 'asc', 'asc', 'asc', 'asc', 'asc', 'asc', 'desc', 'desc', 'desc', 'desc', 'desc', 'desc', 'desc', 'desc'],
    applicableLevels: [2, 3, 4],
    description: '8-bar ascent then 8-bar descent',
  },
  {
    id: 'double_arch_16',
    measures: 16,
    name: '이중 아치',
    contour: ['asc', 'asc', 'desc', 'desc', 'asc', 'asc', 'desc', 'desc', 'asc', 'asc', 'desc', 'desc', 'asc', 'asc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Four 4-bar arches',
  },
  {
    id: 'wave_4cycle_16',
    measures: 16,
    name: '4주기 파동',
    contour: ['desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: '4-bar wave pattern repeated 4 times',
  },
  {
    id: 'wave_expand_16',
    measures: 16,
    name: '확장 파동',
    contour: ['desc', 'asc', 'desc', 'asc', 'desc', 'desc', 'asc', 'asc', 'desc', 'desc', 'desc', 'asc', 'asc', 'asc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Wave with increasing amplitude',
  },
  {
    id: 'wave_contract_16',
    measures: 16,
    name: '수축 파동',
    contour: ['desc', 'desc', 'asc', 'asc', 'desc', 'desc', 'asc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Wave with decreasing amplitude',
  },
  {
    id: 'spiral_long_16',
    measures: 16,
    name: '장대 나선',
    contour: ['asc', 'desc', 'desc', 'asc', 'desc', 'desc', 'desc', 'asc', 'desc', 'desc', 'desc', 'desc', 'asc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Very gradual spiral descent',
  },
  {
    id: 'converge_multi_16',
    measures: 16,
    name: '다단 수렴',
    contour: ['desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'hold', 'desc', 'asc', 'desc', 'asc', 'desc', 'asc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Multi-stage convergence: V convergence then I final convergence',
  },
  {
    id: 'combo_AABA_16',
    measures: 16,
    name: '노래 형식',
    contour: ['desc', 'desc', 'desc', 'hold', 'desc', 'desc', 'desc', 'hold', 'asc', 'asc', 'asc', 'hold', 'desc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'AABA song form (4+4+4+4)',
  },
  {
    id: 'combo_sonata_16',
    measures: 16,
    name: '소나타적',
    contour: ['desc', 'desc', 'asc', 'asc', 'desc', 'desc', 'desc', 'hold', 'asc', 'desc', 'asc', 'desc', 'desc', 'desc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Sonata-like: exposition-development-recapitulation',
  },
  {
    id: 'combo_rondo_16',
    measures: 16,
    name: '론도형',
    contour: ['desc', 'desc', 'desc', 'hold', 'asc', 'asc', 'asc', 'hold', 'desc', 'desc', 'desc', 'hold', 'asc', 'asc', 'desc', 'hold'],
    applicableLevels: [2, 3, 4],
    description: 'Rondo form: A-B-A-C-A\'',
  },
];

// ────────────────────────────────────────────────────────────────
// All patterns combined
// ────────────────────────────────────────────────────────────────

export const ALL_BASS_PATTERNS: BassPatternDef[] = [
  ...PATTERNS_4,
  ...PATTERNS_8,
  ...PATTERNS_12,
  ...PATTERNS_16,
];

/**
 * Get patterns filtered by measure count and bass level.
 */
export function getApplicablePatterns(
  measures: 4 | 8 | 12 | 16,
  level: BassLevel,
): BassPatternDef[] {
  return ALL_BASS_PATTERNS.filter(
    p => p.measures === measures && p.applicableLevels.includes(level),
  );
}

/**
 * Find a specific pattern by ID.
 */
export function getPatternById(id: string): BassPatternDef | undefined {
  return ALL_BASS_PATTERNS.find(p => p.id === id);
}

/**
 * Select a random pattern matching the given criteria.
 */
export function selectRandomPattern(
  measures: 4 | 8 | 12 | 16,
  level: BassLevel,
): BassPatternDef {
  const applicable = getApplicablePatterns(measures, level);
  if (applicable.length === 0) {
    throw new Error(`No patterns found for ${measures} measures at level ${level}`);
  }
  return applicable[Math.floor(Math.random() * applicable.length)];
}
