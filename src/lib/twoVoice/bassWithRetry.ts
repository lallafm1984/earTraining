// ────────────────────────────────────────────────────────────────
// Bass generation with validation retry loop
// ────────────────────────────────────────────────────────────────

import type { TwoVoiceBassOptions, BassNote } from './types';
import { generateTwoVoiceBass } from './bassGenerator';
import { validateBass } from './validator';

/**
 * Generate a bass line with automatic validation and retry.
 * Runs up to `maxRetries + 1` attempts, returning the result
 * with the fewest violations if none pass cleanly.
 */
export function generateBassWithRetry(
  opts: TwoVoiceBassOptions,
  maxRetries = 3,
): BassNote[] {
  let bestResult: { bass: BassNote[]; violations: number } | null = null;

  for (let i = 0; i <= maxRetries; i++) {
    const bass = generateTwoVoiceBass(opts);
    const validation = validateBass(opts, bass);

    if (validation.passed) return bass;

    if (!bestResult || validation.violationCount < bestResult.violations) {
      bestResult = { bass, violations: validation.violationCount };
    }
  }

  return bestResult!.bass;
}
