// ────────────────────────────────────────────────────────────────
// Treble rhythm fill — shared by scoreGenerator & twoVoice melody (no circular imports)
// ────────────────────────────────────────────────────────────────

import { SIXTEENTHS_TO_DUR } from './scoreUtils';

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 리듬 생성 시 넘어서는 안 되는 필수 박 경계를 16분음표 단위로 반환.
 * (scoreGenerator와 동일)
 */
function getBarMandatoryBoundaries(timeSignature: string, barLength: number): number[] {
  const [topStr, bottomStr] = timeSignature.split('/');
  const top = parseInt(topStr, 10);
  const bottom = parseInt(bottomStr, 10);

  if (bottom === 8 && top % 3 === 0 && top >= 6) {
    const pts: number[] = [];
    for (let i = 6; i < barLength; i += 6) pts.push(i);
    return pts;
  }

  if (top === 4 && bottom === 4) {
    return [8];
  }

  if (top === 3 && bottom === 4) {
    return [8];
  }

  if (top === 2) {
    return [];
  }

  const beatSize = 16 / bottom;
  const pts: number[] = [];
  for (let i = beatSize; i < barLength; i += beatSize) pts.push(i);
  return pts;
}

const DOTTED_SIXTEENTHS = new Set([3, 6, 12, 24]);

/**
 * 연속 16분음표(16분 단위 1)가 4개 이상인 구간을 같은 길이의 다른 조합으로 섞는다.
 * 예: 1×4 → [1,1,2], [2,2], [1,3], [4] 등 (총합 불변). 이후 splitAtBeatBoundaries가 경계 분할.
 */
export function variateSixteenthNoteRuns(durations: number[]): number[] {
  if (durations.length === 0) return durations;
  const out: number[] = [];
  let i = 0;
  while (i < durations.length) {
    if (durations[i] !== 1) {
      out.push(durations[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < durations.length && durations[j] === 1) j++;
    const runLen = j - i;
    if (runLen < 4) {
      for (let k = 0; k < runLen; k++) out.push(1);
      i = j;
      continue;
    }
    let remaining = runLen;
    while (remaining > 0) {
      if (remaining >= 4) {
        const r = Math.random();
        if (r < 0.34) {
          out.push(1, 1, 2);
        } else if (r < 0.58) {
          out.push(2, 2);
        } else if (r < 0.72) {
          out.push(1, 3);
        } else if (r < 0.86) {
          out.push(4);
        } else {
          out.push(1, 1, 1, 1);
        }
        remaining -= 4;
      } else if (remaining === 3) {
        const r = Math.random();
        if (r < 0.42) out.push(1, 2);
        else if (r < 0.78) out.push(2, 1);
        else out.push(1, 1, 1);
        remaining = 0;
      } else if (remaining === 2) {
        if (Math.random() < 0.55) out.push(2);
        else out.push(1, 1);
        remaining = 0;
      } else {
        out.push(1);
        remaining--;
      }
    }
    i = j;
  }
  return out;
}

/**
 * 박자 경계를 존중하는 리듬 생성 (scoreGenerator와 동일 로직)
 */
export function fillRhythm(
  total: number,
  pool: number[],
  opts?: {
    timeSignature?: string;
    lastDur?: number;
    syncopationProb?: number;
    minDur?: number;
    dottedProb?: number;
    allowTies?: boolean;
    /** 마디 내 최대 음표 수. 초과 시 인접 짧은 음표를 병합 */
    maxNotes?: number;
  },
): number[] {
  const sorted = [...pool].sort((a, b) => b - a);
  const minDur = opts?.minDur ?? 0;
  const dottedProb = opts?.dottedProb ?? 1;
  const allowTies = opts?.allowTies ?? false;
  const result: number[] = [];
  let rem = total;
  let pos = 0;
  const lastDur = opts?.lastDur;
  const syncopationProb = opts?.syncopationProb ?? 0;
  const timeSignature = opts?.timeSignature;

  const boundaries = timeSignature
    ? getBarMandatoryBoundaries(timeSignature, total)
    : [];
  const beatSize = (() => {
    if (!timeSignature) return 4;
    const [, bs] = timeSignature.split('/');
    return 16 / (parseInt(bs, 10) || 4);
  })();

  const allBeatBounds: number[] = [];
  if (timeSignature) {
    for (let i = beatSize; i < total; i += beatSize) allBeatBounds.push(i);
  }

  let syncopationUsed = false;

  while (rem > 0) {
    if (
      !syncopationUsed &&
      syncopationProb > 0 &&
      rem >= beatSize * 2 &&
      pos % beatSize === 0 &&
      pos > 0 &&
      Math.random() < syncopationProb
    ) {
      const halfBeat = Math.max(1, Math.floor(beatSize / 2));
      const syncCell = [halfBeat, beatSize, halfBeat];
      const syncTotal = syncCell.reduce((a, b) => a + b, 0);
      if (syncTotal <= rem && syncCell.every(d => SIXTEENTHS_TO_DUR[d])) {
        result.push(...syncCell);
        rem -= syncTotal;
        pos += syncTotal;
        syncopationUsed = true;
        continue;
      }
    }

    let avail = sorted.filter(d => d <= rem && d >= minDur);

    const prevDur = result.length > 0 ? result[result.length - 1] : lastDur;
    if (prevDur === 6) {
      avail = avail.filter(d => d !== 6);
    }

    if (boundaries.length > 0) {
      const onBeat = pos % beatSize === 0;
      avail = avail.filter(d => {
        const noteEnd = pos + d;
        if (pos === 0 && noteEnd === total) return true;
        for (const b of boundaries) {
          if (pos < b && noteEnd > b) {
            if (pos === 0 && DOTTED_SIXTEENTHS.has(d)) continue;
            if (allowTies && d === 8 && onBeat) continue;
            return false;
          }
        }
        if (!onBeat) {
          for (const b of allBeatBounds) {
            if (pos < b && noteEnd > b) return false;
          }
        }
        return true;
      });
    }

    if (dottedProb < 1) {
      const nonDotted = avail.filter(d => !DOTTED_SIXTEENTHS.has(d));
      if (nonDotted.length > 0 && Math.random() >= dottedProb) {
        avail = nonDotted;
      }
    }

    if (avail.length === 0) {
      let fallback = Object.keys(SIXTEENTHS_TO_DUR).map(Number)
        .filter(d => d <= rem && d >= minDur).sort((a, b) => b - a);

      const prevDurFallback = result.length > 0 ? result[result.length - 1] : lastDur;
      if (prevDurFallback === 6) {
        fallback = fallback.filter(d => d !== 6);
      }

      if (boundaries.length > 0) {
        const onBeat = pos % beatSize === 0;
        fallback = fallback.filter(d => {
          const noteEnd = pos + d;
          if (pos === 0 && noteEnd === total) return true;
          for (const b of boundaries) {
            if (pos < b && noteEnd > b) {
              if (pos === 0 && DOTTED_SIXTEENTHS.has(d)) continue;
              if (allowTies && d === 8 && onBeat) continue;
              return false;
            }
          }
          if (!onBeat) {
            for (const b of allBeatBounds) {
              if (pos < b && noteEnd > b) return false;
            }
          }
          return true;
        });
      }

      if (fallback.length) {
        result.push(fallback[0]);
        pos += fallback[0];
        rem -= fallback[0];
      } else {
        result.push(1);
        pos += 1;
        rem -= 1;
      }
    } else {
      const d = rand(avail);
      result.push(d);
      pos += d;
      rem -= d;
    }
  }
  // ── maxNotes 제한: 초과 시 인접한 짧은 음표 쌍을 병합 ──
  const maxNotes = opts?.maxNotes;
  if (maxNotes && result.length > maxNotes) {
    while (result.length > maxNotes) {
      // 가장 짧은 인접 쌍을 찾아 병합
      let bestIdx = -1;
      let bestSum = Infinity;
      for (let i = 0; i < result.length - 1; i++) {
        const sum = result[i] + result[i + 1];
        // 병합 결과가 유효한 음가여야 함
        if (SIXTEENTHS_TO_DUR[sum] && sum < bestSum) {
          bestSum = sum;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) break; // 병합 가능한 쌍 없음
      result.splice(bestIdx, 2, bestSum);
    }
  }

  return variateSixteenthNoteRuns(result);
}
