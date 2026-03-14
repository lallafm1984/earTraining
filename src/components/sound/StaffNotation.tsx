'use client'

/**
 * StaffNotation.tsx
 * 5선지 악보 SVG 컴포넌트 — 마디 구분 + 최대 4마디 표시
 */

import type { NoteEvent } from './useSoundPlayer'

// ── 상수 ───────────────────────────────────────────────────────────
const LINE_GAP    = 10      // 선 간격 (px)
const STAFF_TOP   = 24      // 5선 시작 y
const NOTE_R      = 5       // 음표 머리 반지름
const CLEF_W      = 36      // 음자리표 영역
const TIMESIG_W   = 20      // 박자표 영역
const KEYSIG_W_PER = 10     // 조표 1개당 폭
const MEASURE_W   = 120     // 마디 1개 고정 폭
const MAX_BARS    = 4       // 최대 마디 수
const STEM_H      = 30      // 기둥 길이
const STAFF_H     = LINE_GAP * 4  // 40

// 높은음자리표 기준: B4 = 3번째 선(위에서)
const B4_Y = STAFF_TOP + LINE_GAP * 2  // = 44

// 음이름 → 7음계 단계
const PITCH_STEP: Record<string, number> = {
  C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6,
}

// 조표
const KEY_SHARPS: Record<string, string[]> = {
  C: [], G: ['F'], D: ['F', 'C'], A: ['F', 'C', 'G'],
  E: ['F', 'C', 'G', 'D'], B: ['F', 'C', 'G', 'D', 'A'],
  'F#': ['F', 'C', 'G', 'D', 'A', 'E'],
}
const KEY_FLATS: Record<string, string[]> = {
  F: ['B'], Bb: ['B', 'E'], Eb: ['B', 'E', 'A'], Ab: ['B', 'E', 'A', 'D'],
  Db: ['B', 'E', 'A', 'D', 'G'],
  Am: [], Em: [], Bm: ['F'], Dm: ['B'], Gm: ['B', 'E'],
  Cm: ['B', 'E', 'A'], Fm: ['B', 'E', 'A', 'D'],
  'F#m': ['F', 'C'], 'C#m': ['F', 'C', 'G'], 'G#m': ['F', 'C', 'G', 'D'],
  Bbm: ['B', 'E', 'A', 'D'], Ebm: ['B', 'E', 'A', 'D', 'G'],
}

// 샤프/플랫 조표 높은음자리표 step(C4 기준)
const SHARP_KEYSIG_STEPS = [10, 7, 11, 8, 5, 9, 6]
const FLAT_KEYSIG_STEPS  = [6, 9, 5, 8, 4, 7, 3]

// ── duration → beats (분자 박자 기준 = 4분음표 1박) ──────────────
function durToBeats(dur: string): number {
  const map: Record<string, number> = {
    '1n': 4, '2n': 2, '4n': 1, '8n': 0.5, '16n': 0.25,
    '2n.': 3, '4n.': 1.5, '8n.': 0.75,
  }
  return map[dur] ?? 1
}

// ── 음표 파싱 ──────────────────────────────────────────────────────
interface NoteInfo {
  accidental: '#' | 'b' | null
  basePitch: string
  stepFromC4: number
  y: number
}

function parseNote(noteStr: string): NoteInfo | null {
  if (noteStr === 'rest') return null
  const m = noteStr.match(/^([A-G])(#|b?)(\d)$/)
  if (!m) return null
  const basePitch = m[1]
  const accStr    = m[2]
  const octave    = parseInt(m[3])
  const accidental = accStr === '#' ? '#' : accStr === 'b' ? 'b' : null

  const step = PITCH_STEP[basePitch] ?? 0
  const stepFromC4 = (octave - 4) * 7 + step
  const stepFromB4 = stepFromC4 - 6
  const y = B4_Y - stepFromB4 * (LINE_GAP / 2)
  return { accidental, basePitch, stepFromC4, y }
}

// ── 덧줄 ──────────────────────────────────────────────────────────
function getLedgerLines(y: number): number[] {
  const lines: number[] = []
  const bottom = STAFF_TOP + STAFF_H  // 64
  if (y >= bottom + LINE_GAP) {
    for (let ley = bottom + LINE_GAP; ley <= y; ley += LINE_GAP) lines.push(ley)
  }
  if (y <= STAFF_TOP - LINE_GAP) {
    for (let ley = STAFF_TOP - LINE_GAP; ley >= y; ley -= LINE_GAP) lines.push(ley)
  }
  return lines
}

// ── 마디 구분 ─────────────────────────────────────────────────────
interface Bar {
  notes: { event: NoteEvent; beats: number }[]
  totalBeats: number
}

function groupIntoBars(notes: NoteEvent[], beatsPerBar: number): Bar[] {
  const bars: Bar[] = []
  let currentBar: Bar = { notes: [], totalBeats: 0 }

  for (const event of notes) {
    const beats = durToBeats(event.duration)
    // 현재 마디가 꽉 찼으면 새 마디
    if (currentBar.totalBeats >= beatsPerBar) {
      bars.push(currentBar)
      if (bars.length >= MAX_BARS) break
      currentBar = { notes: [], totalBeats: 0 }
    }
    currentBar.notes.push({ event, beats })
    currentBar.totalBeats += beats
  }
  if (currentBar.notes.length > 0 && bars.length < MAX_BARS) {
    bars.push(currentBar)
  }
  return bars
}

// ── 음표 그리기 ────────────────────────────────────────────────────
function NoteGlyph({
  x, y, duration, accidental, isActive, showAccidental,
}: {
  x: number; y: number; duration: string; accidental: '#' | 'b' | null
  isActive: boolean; showAccidental?: boolean
}) {
  const color  = isActive ? '#6366f1' : '#1e293b'
  const filled = duration !== '1n' && duration !== '2n'
  const stemUp = y > B4_Y
  const stemX  = stemUp ? x + NOTE_R : x - NOTE_R
  const stemY1 = stemUp ? y - NOTE_R : y + NOTE_R
  const stemY2 = stemUp ? y - NOTE_R - STEM_H : y + NOTE_R + STEM_H
  const dotted = duration.endsWith('.')
  const hasTail8  = duration === '8n' || duration === '8n.'
  const hasTail16 = duration === '16n'

  return (
    <g>
      {/* 임시표 */}
      {showAccidental && accidental === '#' && (
        <text x={x - NOTE_R - 11} y={y + 4} fontSize={12} fill={color} fontFamily="serif">♯</text>
      )}
      {showAccidental && accidental === 'b' && (
        <text x={x - NOTE_R - 11} y={y + 5} fontSize={14} fill={color} fontFamily="serif">♭</text>
      )}

      {/* 음표 머리 */}
      <ellipse cx={x} cy={y} rx={NOTE_R + 1} ry={NOTE_R - 1}
        fill={filled ? color : 'none'} stroke={color} strokeWidth={1.5}
        transform={`rotate(-15,${x},${y})`} />

      {/* 점 */}
      {dotted && <circle cx={x + NOTE_R + 3} cy={y - 1} r={1.5} fill={color} />}

      {/* 기둥 */}
      {duration !== '1n' && (
        <line x1={stemX} y1={stemY1} x2={stemX} y2={stemY2} stroke={color} strokeWidth={1.5} />
      )}

      {/* 꼬리 8분 */}
      {hasTail8 && (
        <path
          d={stemUp
            ? `M${stemX},${stemY2} C${stemX+14},${stemY2+8} ${stemX+12},${stemY2+20} ${stemX},${stemY2+24}`
            : `M${stemX},${stemY2} C${stemX+8},${stemY2-8} ${stemX+6},${stemY2-20} ${stemX},${stemY2-24}`}
          fill="none" stroke={color} strokeWidth={1.5} />
      )}
      {/* 꼬리 16분 */}
      {hasTail16 && (
        <>
          <path d={stemUp
            ? `M${stemX},${stemY2} C${stemX+14},${stemY2+8} ${stemX+12},${stemY2+20} ${stemX},${stemY2+24}`
            : `M${stemX},${stemY2} C${stemX+8},${stemY2-8} ${stemX+6},${stemY2-20} ${stemX},${stemY2-24}`}
            fill="none" stroke={color} strokeWidth={1.5} />
          <path d={stemUp
            ? `M${stemX},${stemY2+8} C${stemX+14},${stemY2+16} ${stemX+12},${stemY2+28} ${stemX},${stemY2+32}`
            : `M${stemX},${stemY2-8} C${stemX+8},${stemY2-16} ${stemX+6},${stemY2-28} ${stemX},${stemY2-32}`}
            fill="none" stroke={color} strokeWidth={1.5} />
        </>
      )}
    </g>
  )
}

// ── 쉼표 ──────────────────────────────────────────────────────────
function RestGlyph({ x, duration, isActive }: { x: number; duration: string; isActive: boolean }) {
  const color = isActive ? '#6366f1' : '#1e293b'
  const midY  = STAFF_TOP + LINE_GAP * 2
  const dotted = duration.endsWith('.')

  if (duration === '1n')
    return <rect x={x - 8} y={midY} width={16} height={LINE_GAP / 2} fill={color} rx={1} />
  if (duration === '2n')
    return <rect x={x - 8} y={midY - LINE_GAP / 2} width={16} height={LINE_GAP / 2} fill={color} rx={1} />

  const symMap: Record<string, string> = {
    '4n': '𝄽', '4n.': '𝄽', '8n': '𝄾', '8n.': '𝄾', '16n': '𝄿',
  }
  const base = duration.replace('.', '')
  const sym  = symMap[base] ?? '𝄽'
  return (
    <g>
      <text x={x - 5} y={midY + LINE_GAP + 4} fontSize={22} fill={color} fontFamily="serif">{sym}</text>
      {dotted && <circle cx={x + 10} cy={midY + 4} r={1.5} fill={color} />}
    </g>
  )
}

// ── 높은음자리표 ──────────────────────────────────────────────────
function TrebleClef({ x }: { x: number }) {
  return (
    <text x={x} y={STAFF_TOP + LINE_GAP * 4.2} fontSize={54} fill="#1e293b"
      fontFamily="'Noto Music','Bravura','FreeSerif',Georgia,serif"
      style={{ userSelect: 'none' }}>
      𝄞
    </text>
  )
}

// ── 박자표 ────────────────────────────────────────────────────────
function TimeSignature({ x, top, bottom }: { x: number; top: number; bottom: number }) {
  const cy = STAFF_TOP + LINE_GAP * 2
  return (
    <>
      <text x={x} y={cy - 2} fontSize={14} fontWeight="bold" fill="#334155"
        fontFamily="serif" textAnchor="middle">{top}</text>
      <text x={x} y={cy + LINE_GAP + 2} fontSize={14} fontWeight="bold" fill="#334155"
        fontFamily="serif" textAnchor="middle">{bottom}</text>
    </>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────
interface StaffNotationProps {
  notes: NoteEvent[]
  keySignature?: string
  timeSignature?: string
  activeIndex?: number | null
  mode?: 'sequential' | 'simultaneous' | 'rhythm'
}

export default function StaffNotation({
  notes,
  keySignature = 'C',
  timeSignature = '4/4',
  activeIndex = null,
  mode = 'sequential',
}: StaffNotationProps) {
  const sharps = KEY_SHARPS[keySignature] ?? []
  const flats  = KEY_FLATS[keySignature]  ?? []
  const isSharps   = sharps.length > 0
  const keySigCount = isSharps ? sharps.length : flats.length
  const keySigW = keySigCount * KEYSIG_W_PER

  // 박자 파싱
  const [tsTop, tsBot] = timeSignature.split('/').map(Number)
  const beatsPerBar = tsTop && tsBot ? tsTop * (4 / tsBot) : 4  // 4분음표 기준

  // ── 마디 그룹화 ───────────────────────────────────────────────
  const bars = mode === 'rhythm' || mode === 'simultaneous'
    ? [{ notes: notes.map(e => ({ event: e, beats: durToBeats(e.duration) })), totalBeats: beatsPerBar }]
    : groupIntoBars(notes, beatsPerBar)

  // 악보 헤더 폭 (음자리표 + 박자표 + 조표)
  const headerW = CLEF_W + TIMESIG_W + keySigW
  // 전체 SVG 폭: 헤더 + 마디 수 × 마디 폭 + 끝 여백
  const totalBars = Math.max(bars.length, 1)
  const svgW = headerW + totalBars * MEASURE_W + 8
  const svgH = STAFF_TOP * 2 + STAFF_H + 28

  // 5선 전체 폭
  const lineW = svgW - 2

  // 전역 음표 인덱스 → 마디/내부 인덱스 역매핑
  let globalIdx = 0

  // ── 리듬(타악기) 모드 ─────────────────────────────────────────
  if (mode === 'rhythm') {
    const percY = STAFF_TOP + STAFF_H / 2
    const noteStartX = headerW + 12
    const spacing = (MEASURE_W - 24) / Math.max(notes.length, 1)
    return (
      <div style={wrapStyle}>
        <svg width={Math.max(svgW, 300)} height={svgH} style={{ display: 'block' }}>
          {/* 한줄 타악기 선 */}
          <line x1={CLEF_W - 2} y1={percY} x2={lineW} y2={percY} stroke="#94a3b8" strokeWidth={1.5} />
          <line x1={CLEF_W - 2} y1={percY - 14} x2={CLEF_W - 2} y2={percY + 14} stroke="#475569" strokeWidth={1.5} />
          <line x1={lineW} y1={percY - 14} x2={lineW} y2={percY + 14} stroke="#475569" strokeWidth={2} />
          <text x={6} y={percY + 6} fontSize={22} fill="#334155" fontFamily="serif">𝄥</text>
          <TimeSignature x={CLEF_W + TIMESIG_W / 2} top={tsTop ?? 4} bottom={tsBot ?? 4} />

          {notes.map((n, i) => {
            const nx = noteStartX + i * spacing
            const isActive = activeIndex === i
            const color = isActive ? '#6366f1' : '#1e293b'
            const isRest = n.note === 'rest'
            return (
              <g key={i}>
                {isRest ? (
                  <rect x={nx - 5} y={percY - 5} width={10} height={7} fill={color} rx={1} />
                ) : (
                  <>
                    <ellipse cx={nx} cy={percY} rx={NOTE_R + 1} ry={NOTE_R - 1}
                      fill={color} stroke={color} strokeWidth={1.5}
                      transform={`rotate(-15,${nx},${percY})`} />
                    <line x1={nx + NOTE_R} y1={percY} x2={nx + NOTE_R} y2={percY - STEM_H}
                      stroke={color} strokeWidth={1.5} />
                    {(n.duration === '8n' || n.duration === '8n.') && (
                      <path d={`M${nx+NOTE_R},${percY-STEM_H} C${nx+18},${percY-STEM_H+8} ${nx+16},${percY-STEM_H+20} ${nx+NOTE_R},${percY-STEM_H+24}`}
                        fill="none" stroke={color} strokeWidth={1.5} />
                    )}
                  </>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  // ── 일반 악보(순차/동시) ────────────────────────────────────────
  return (
    <div style={wrapStyle}>
      <svg width={svgW} height={svgH} style={{ display: 'block' }}>
        {/* 5선 */}
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1={0} y1={STAFF_TOP + i * LINE_GAP} x2={lineW} y2={STAFF_TOP + i * LINE_GAP}
            stroke="#94a3b8" strokeWidth={1} />
        ))}

        {/* 시작 세로선 */}
        <line x1={CLEF_W - 2} y1={STAFF_TOP} x2={CLEF_W - 2} y2={STAFF_TOP + STAFF_H}
          stroke="#475569" strokeWidth={1.5} />
        {/* 끝 이중 세로선 */}
        <line x1={lineW - 3} y1={STAFF_TOP} x2={lineW - 3} y2={STAFF_TOP + STAFF_H}
          stroke="#475569" strokeWidth={1.5} />
        <line x1={lineW} y1={STAFF_TOP} x2={lineW} y2={STAFF_TOP + STAFF_H}
          stroke="#475569" strokeWidth={3} />

        {/* 높은음자리표 */}
        <TrebleClef x={2} />

        {/* 박자표 */}
        <TimeSignature x={CLEF_W + TIMESIG_W / 2} top={tsTop ?? 4} bottom={tsBot ?? 4} />

        {/* 조표 */}
        {isSharps
          ? sharps.map((_, i) => {
              const step = SHARP_KEYSIG_STEPS[i] ?? 0
              const ky = B4_Y - (step - 6) * (LINE_GAP / 2)
              return <text key={i} x={CLEF_W + TIMESIG_W + i * KEYSIG_W_PER} y={ky + 5}
                fontSize={13} fill="#334155" fontFamily="serif">♯</text>
            })
          : flats.map((_, i) => {
              const step = FLAT_KEYSIG_STEPS[i] ?? 0
              const ky = B4_Y - (step - 6) * (LINE_GAP / 2)
              return <text key={i} x={CLEF_W + TIMESIG_W + i * KEYSIG_W_PER} y={ky + 7}
                fontSize={15} fill="#334155" fontFamily="serif">♭</text>
            })
        }

        {/* 마디별 음표 + 세로선 */}
        {bars.map((bar, barIdx) => {
          const barStartX = headerW + barIdx * MEASURE_W
          // 음표 간격: 마디 폭을 음표 수에 따라 균등 분배
          const noteCount = bar.notes.length
          const spacing = noteCount > 0 ? MEASURE_W / (noteCount + 1) : MEASURE_W / 2

          // 마디 경계 세로선 (마지막 제외 — 이중선으로 처리)
          const isLastBar = barIdx === bars.length - 1
          if (!isLastBar) {
            // 중간 세로선
          }

          const glyphs = bar.notes.map(({ event, beats: _ }, noteIdx) => {
            const currentGlobal = globalIdx++
            const nx = barStartX + (noteIdx + 1) * spacing
            const isActive = activeIndex === currentGlobal
            const isRest = event.note === 'rest'
            const info = parseNote(event.note)

            if (isRest) return (
              <RestGlyph key={noteIdx} x={nx} duration={event.duration} isActive={isActive} />
            )
            if (!info) return null

            const ledgers = getLedgerLines(info.y)
            const inKeySharps = sharps.includes(info.basePitch)
            const inKeyFlats  = flats.includes(info.basePitch)
            const showAcc = (info.accidental === '#' && !inKeySharps) ||
                            (info.accidental === 'b' && !inKeyFlats)

            return (
              <g key={noteIdx}>
                {ledgers.map((ly, li) => (
                  <line key={li}
                    x1={nx - NOTE_R - 4} y1={ly} x2={nx + NOTE_R + 4} y2={ly}
                    stroke="#64748b" strokeWidth={1.2} />
                ))}
                <NoteGlyph
                  x={nx} y={info.y}
                  duration={event.duration}
                  accidental={info.accidental}
                  isActive={isActive}
                  showAccidental={showAcc}
                />
              </g>
            )
          })

          return (
            <g key={barIdx}>
              {glyphs}
              {/* 마디 구분선 (마지막 마디 다음은 이중선으로 이미 처리) */}
              {!isLastBar && (
                <line
                  x1={barStartX + MEASURE_W} y1={STAFF_TOP}
                  x2={barStartX + MEASURE_W} y2={STAFF_TOP + STAFF_H}
                  stroke="#94a3b8" strokeWidth={1}
                />
              )}
              {/* 빈 마디 안내 */}
              {noteCount === 0 && (
                <text x={barStartX + MEASURE_W / 2} y={STAFF_TOP + STAFF_H / 2 + 4}
                  fontSize={9} fill="#cbd5e1" textAnchor="middle">
                  {barIdx + 1}마디
                </text>
              )}
            </g>
          )
        })}

        {/* 빈 악보일 때 */}
        {notes.length === 0 && (
          <>
            {/* 빈 마디 3개 더 표시 */}
            {[1, 2, 3].map((i) => (
              <line key={i}
                x1={headerW + i * MEASURE_W} y1={STAFF_TOP}
                x2={headerW + i * MEASURE_W} y2={STAFF_TOP + STAFF_H}
                stroke="#94a3b8" strokeWidth={1} />
            ))}
            <text x={headerW + 8} y={STAFF_TOP + STAFF_H / 2 + 4}
              fontSize={10} fill="#94a3b8">
              건반을 눌러 음표를 추가하세요
            </text>
          </>
        )}

        {/* 마디 번호 표시 */}
        {bars.map((bar, i) => {
          if (bar.notes.length === 0) return null
          const bx = headerW + i * MEASURE_W + 4
          return (
            <text key={i} x={bx} y={STAFF_TOP + STAFF_H + 16}
              fontSize={9} fill="#94a3b8">
              {i + 1}
            </text>
          )
        })}
      </svg>

      {/* 4마디 초과 안내 */}
      {notes.length > 0 && (() => {
        let total = 0
        let overflow = false
        for (const n of notes) {
          total += durToBeats(n.duration)
          if (total > beatsPerBar * MAX_BARS) { overflow = true; break }
        }
        return overflow ? (
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
            ※ 악보는 최대 {MAX_BARS}마디까지 표시됩니다
          </p>
        ) : null
      })()}
    </div>
  )
}

const wrapStyle: React.CSSProperties = {
  background: 'var(--background)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '6px 12px 8px',
  overflowX: 'auto',
}
