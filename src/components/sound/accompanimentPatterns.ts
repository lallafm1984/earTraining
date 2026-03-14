/**
 * 반주 패턴 정의
 * 각 패턴은 한 마디(4/4 기준) 기준 음표 이벤트 배열을 반환하는 함수
 */

export type AccompPattern = {
  id: string
  label: string
  description: string
  /** 한 마디 반주 이벤트 생성 (rootNote: 조성 루트, e.g. "C3") */
  buildBar: (rootNote: string, timeSignature?: string) => AccompEvent[]
}

export type AccompEvent = {
  notes: string | string[]  // 단음 or 화음
  duration: string          // Tone.js duration
  offset: number            // 마디 내 박자 오프셋 (초, BPM 60 기준 → 실제로는 비율로 처리)
}

// ── 화성 헬퍼 ─────────────────────────────────
export const SEMITONES: Record<string, number> = {
  C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11
}
export const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

export function shiftNote(note: string, semitones: number): string {
  const match = note.match(/^([A-G]#?b?)(\d)$/)
  if (!match) return note
  const [, pitch, octStr] = match
  const oct = parseInt(octStr)
  const base = SEMITONES[pitch] ?? 0
  const total = base + semitones
  const newPitch = NAMES[((total % 12) + 12) % 12]
  const newOct = oct + Math.floor(total / 12)
  return `${newPitch}${newOct}`
}

/** 장3화음 구성음 [루트, 장3도, 완전5도] */
function majorTriad(root: string) {
  return [root, shiftNote(root, 4), shiftNote(root, 7)]
}

/** 단3화음 */
function minorTriad(root: string) {
  return [root, shiftNote(root, 3), shiftNote(root, 7)]
}

// ── 반주 패턴 목록 ─────────────────────────────

export const ACCOMP_PATTERNS: AccompPattern[] = [
  // ① 기본 화음 (whole note)
  {
    id: 'whole_chord',
    label: '온음 화음',
    description: '한 마디에 화음 1번',
    buildBar: (root, timeSignature) => {
      // 3/4박자 대응
      if (timeSignature === '3/4') {
        return [{ notes: majorTriad(root), duration: '2n.', offset: 0 }]
      }
      return [{ notes: majorTriad(root), duration: '1n', offset: 0 }]
    },
  },

  // ② 반음 화음 (half note ×2)
  {
    id: 'half_chord',
    label: '반음 화음',
    description: '2박마다 화음',
    buildBar: (root, timeSignature) => {
      if (timeSignature === '3/4') {
        // 3/4박자: 점2분음표 하나로 대체하거나, 2분 + 4분?
        // 여기서는 간단히 2분음표 하나만 (첫박)
        return [
          { notes: majorTriad(root), duration: '2n', offset: 0 },
          { notes: majorTriad(root), duration: '4n', offset: 2 },
        ]
      }
      return [
        { notes: majorTriad(root), duration: '2n', offset: 0 },
        { notes: majorTriad(root), duration: '2n', offset: 2 },
      ]
    },
  },

  // ③ 알베르티 베이스 (C-G-E-G 패턴)
  {
    id: 'alberti',
    label: '알베르티 베이스',
    description: '루트-5도-3도-5도 (8분음표)',
    buildBar: (root, timeSignature) => {
      const r = root
      const third = shiftNote(root, 4)
      const fifth = shiftNote(root, 7)
      
      if (timeSignature === '3/4') {
        // 3박자 알베르티: 루트-5-3-5-3-5 ?
        return [
          { notes: r,     duration: '8n', offset: 0   },
          { notes: fifth, duration: '8n', offset: 0.5 },
          { notes: third, duration: '8n', offset: 1   },
          { notes: fifth, duration: '8n', offset: 1.5 },
          { notes: third, duration: '8n', offset: 2   },
          { notes: fifth, duration: '8n', offset: 2.5 },
        ]
      }

      return [
        { notes: r,     duration: '8n', offset: 0   },
        { notes: fifth, duration: '8n', offset: 0.5 },
        { notes: third, duration: '8n', offset: 1   },
        { notes: fifth, duration: '8n', offset: 1.5 },
        { notes: r,     duration: '8n', offset: 2   },
        { notes: fifth, duration: '8n', offset: 2.5 },
        { notes: third, duration: '8n', offset: 3   },
        { notes: fifth, duration: '8n', offset: 3.5 },
      ]
    },
  },

  // ④ 아르페지오 (C-E-G-E)
  {
    id: 'arpeggio',
    label: '아르페지오',
    description: '루트→3도→5도→3도 반복',
    buildBar: (root, timeSignature) => {
      const r = root
      const third = shiftNote(root, 4)
      const fifth = shiftNote(root, 7)
      
      if (timeSignature === '3/4') {
        return [
          { notes: r,     duration: '8n', offset: 0   },
          { notes: third, duration: '8n', offset: 0.5 },
          { notes: fifth, duration: '8n', offset: 1   },
          { notes: third, duration: '8n', offset: 1.5 },
          { notes: fifth, duration: '8n', offset: 2   },
          { notes: third, duration: '8n', offset: 2.5 },
        ]
      }

      return [
        { notes: r,     duration: '8n', offset: 0   },
        { notes: third, duration: '8n', offset: 0.5 },
        { notes: fifth, duration: '8n', offset: 1   },
        { notes: third, duration: '8n', offset: 1.5 },
        { notes: r,     duration: '8n', offset: 2   },
        { notes: third, duration: '8n', offset: 2.5 },
        { notes: fifth, duration: '8n', offset: 3   },
        { notes: third, duration: '8n', offset: 3.5 },
      ]
    },
  },

  // ⑤ 기타 스트럼 (4분음표 화음)
  {
    id: 'strum',
    label: '기타 스트럼',
    description: '4분음표마다 화음 스트럼',
    buildBar: (root, timeSignature) => {
      const base = [
        { notes: majorTriad(root), duration: '4n', offset: 0 },
        { notes: majorTriad(root), duration: '4n', offset: 1 },
        { notes: majorTriad(root), duration: '4n', offset: 2 },
      ]
      if (timeSignature === '3/4') return base
      return [...base, { notes: majorTriad(root), duration: '4n', offset: 3 }]
    },
  },

  // ⑥ 단조 화음 (whole)
  {
    id: 'minor_chord',
    label: '단조 화음',
    description: '단조 화음 (한 마디)',
    buildBar: (root, timeSignature) => {
      if (timeSignature === '3/4') {
        return [{ notes: minorTriad(root), duration: '2n.', offset: 0 }]
      }
      return [{ notes: minorTriad(root), duration: '1n', offset: 0 }]
    },
  },

  // ⑦ 베이스 온리
  {
    id: 'bass_only',
    label: '베이스 단음',
    description: '루트 음만 (낮은 옥타브)',
    buildBar: (root, timeSignature) => {
      const bassRoot = shiftNote(root, -12) // 1옥타브 아래
      if (timeSignature === '3/4') {
        return [
          { notes: bassRoot, duration: '2n', offset: 0 },
          { notes: bassRoot, duration: '4n', offset: 2 },
        ]
      }
      return [
        { notes: bassRoot, duration: '2n', offset: 0 },
        { notes: bassRoot, duration: '2n', offset: 2 },
      ]
    },
  },

  // ⑧ 왈츠 (3/4)
  {
    id: 'waltz',
    label: '왈츠',
    description: '루트-화음-화음 (3박)',
    buildBar: (root, timeSignature) => {
      const chord = majorTriad(root)
      // 4/4박자일 경우 왈츠 패턴을 어떻게 할지? -> 그냥 3박 + 쉼표? 또는 4박으로 확장?
      // 여기서는 4/4면 쿵짝짝쿵 으로 확장
      if (timeSignature !== '3/4') {
        return [
          { notes: root,  duration: '4n', offset: 0 },
          { notes: chord, duration: '4n', offset: 1 },
          { notes: chord, duration: '4n', offset: 2 },
          { notes: root,  duration: '4n', offset: 3 },
        ]
      }
      return [
        { notes: root,  duration: '4n', offset: 0 },
        { notes: chord, duration: '4n', offset: 1 },
        { notes: chord, duration: '4n', offset: 2 },
      ]
    },
  },
]
