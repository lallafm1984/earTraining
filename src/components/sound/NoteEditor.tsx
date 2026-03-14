'use client'

import { X, Plus, Edit2 } from 'lucide-react'
import type { NoteEvent } from './useSoundPlayer'
import { useState } from 'react'

// 피아노 건반 음이름 목록 (C3~B5)
const NOTES_BY_OCTAVE: { octave: number; notes: string[] }[] = [
  { octave: 3, notes: ['C3','C#3','D3','D#3','E3','F3','F#3','G3','G#3','A3','A#3','B3'] },
  { octave: 4, notes: ['C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4'] },
  { octave: 5, notes: ['C5','C#5','D5','D#5','E5','F5','F#5','G5','G#5','A5','A#5','B5'] },
]

// 음이름 표시용 (한국어 계이름)
const NOTE_KR: Record<string, string> = {
  C: '도', 'C#': '도#', D: '레', 'D#': '레#',
  E: '미', F: '파', 'F#': '파#', G: '솔',
  'G#': '솔#', A: '라', 'A#': '라#', B: '시',
}

function getNoteName(note: string) {
  const pitch = note.replace(/\d/, '')
  const octave = note.slice(-1)
  return `${NOTE_KR[pitch] ?? pitch}${octave}`
}

const DURATIONS = [
  { value: '1n', label: '온음표' },
  { value: '2n', label: '2분' },
  { value: '4n', label: '4분' },
  { value: '8n', label: '8분' },
  { value: '16n', label: '16분' },
  { value: '4n.', label: '점4분' },
  { value: '8n.', label: '점8분' },
]

// 음이 검은 건반인지
function isBlackKey(note: string) {
  return note.includes('#')
}

// 미니 피아노 키보드 — 한 옥타브
function PianoOctave({
  octave,
  selectedNotes,
  onToggle,
  activeIndex,
  noteEvents,
}: {
  octave: number
  selectedNotes: string[]
  onToggle: (note: string) => void
  activeIndex: number | null
  noteEvents: NoteEvent[]
}) {
  const whites = NOTES_BY_OCTAVE.find((o) => o.octave === octave)!.notes.filter(
    (n) => !isBlackKey(n)
  )
  const blacks = NOTES_BY_OCTAVE.find((o) => o.octave === octave)!.notes.filter((n) =>
    isBlackKey(n)
  )

  // 흰 건반 순서에서 검은 건반 위치 매핑
  const blackPositions: Record<string, number> = {
    [`C#${octave}`]: 0,
    [`D#${octave}`]: 1,
    [`F#${octave}`]: 3,
    [`G#${octave}`]: 4,
    [`A#${octave}`]: 5,
  }

  const isNoteActive = (note: string) => {
    if (activeIndex === null) return false
    return noteEvents[activeIndex]?.note === note
  }

  return (
    <div className="relative flex" style={{ height: 80 }}>
      {/* 흰 건반 */}
      {whites.map((note, i) => {
        const selected = selectedNotes.includes(note)
        const active = isNoteActive(note)
        return (
          <button
            key={note}
            type="button"
            onClick={() => onToggle(note)}
            title={getNoteName(note)}
            style={{
              width: 28,
              height: 80,
              marginRight: 1,
              background: active ? 'var(--accent)' : selected ? '#BFDBFE' : '#fff',
              border: selected ? '2px solid var(--primary)' : '1px solid #d1d5db',
              borderRadius: '0 0 4px 4px',
              position: 'relative',
              zIndex: 1,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background 0.1s',
            }}
          >
            {i === 0 && (
              <span
                style={{
                  position: 'absolute',
                  bottom: 4,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: 9,
                  color: '#6b7280',
                  whiteSpace: 'nowrap',
                }}
              >
                {octave}
              </span>
            )}
          </button>
        )
      })}

      {/* 검은 건반 — absolute 오버레이 */}
      {blacks.map((note) => {
        const wIdx = blackPositions[note]
        const selected = selectedNotes.includes(note)
        const active = isNoteActive(note)
        return (
          <button
            key={note}
            type="button"
            onClick={() => onToggle(note)}
            title={getNoteName(note)}
            style={{
              position: 'absolute',
              left: wIdx * 29 + 18,
              top: 0,
              width: 18,
              height: 50,
              background: active ? 'var(--accent)' : selected ? 'var(--primary)' : '#1f2937',
              border: 'none',
              borderRadius: '0 0 3px 3px',
              zIndex: 2,
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
          />
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
// 단음 / 음정 / 선율: 순차 시퀀스 편집기
// ─────────────────────────────────────────────
export function SequenceEditor({
  notes,
  onChange,
  activeIndex,
  maxNotes = 16,
  label = '음표 시퀀스',
  keySignature,
}: {
  notes: NoteEvent[]
  onChange: (notes: NoteEvent[]) => void
  activeIndex: number | null
  maxNotes?: number
  label?: string
  keySignature?: string
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const addNote = (note: string) => {
    if (editingIndex !== null) {
      // 수정 모드: 선택된 음표 교체
      const updated = [...notes]
      updated[editingIndex] = { ...updated[editingIndex], note }
      onChange(updated)
      setEditingIndex(null) // 수정 후 해제
    } else {
      // 추가 모드
      if (notes.length >= maxNotes) return
      onChange([...notes, { note, duration: '4n' }])
    }
  }

  const removeNote = (i: number) => {
    onChange(notes.filter((_, idx) => idx !== i))
    if (editingIndex === i) setEditingIndex(null)
  }

  const changeDuration = (i: number, duration: string) => {
    const updated = [...notes]
    updated[i] = { ...updated[i], duration }
    onChange(updated)
  }

  const toggleEdit = (i: number) => {
    setEditingIndex(editingIndex === i ? null : i)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
          {label} {keySignature && `(Key: ${keySignature})`}
        </p>
        {editingIndex !== null && (
          <span className="text-xs font-bold animate-pulse" style={{ color: 'var(--primary)' }}>
            {editingIndex + 1}번째 음표 수정 중...
          </span>
        )}
      </div>

      {/* 시퀀스 표시 */}
      {notes.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 rounded-xl min-h-12"
          style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
        >
          {notes.map((n, i) => {
            const isEditing = editingIndex === i
            const isActive = activeIndex === i
            
            return (
              <div
                key={i}
                onClick={() => toggleEdit(i)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium cursor-pointer select-none"
                style={{
                  background: isEditing ? '#4f46e5' : isActive ? 'var(--accent)' : '#EEF2FF',
                  color: isEditing ? '#fff' : isActive ? '#fff' : 'var(--primary)',
                  border: `1px solid ${isEditing ? '#4338ca' : isActive ? 'var(--accent)' : 'var(--primary)'}`,
                  transition: 'all 0.15s',
                  transform: isEditing ? 'scale(1.05)' : 'none',
                  boxShadow: isEditing ? '0 2px 4px rgba(79, 70, 229, 0.3)' : 'none',
                }}
              >
                <span>{getNoteName(n.note)}</span>
                <select
                  value={n.duration}
                  onChange={(e) => changeDuration(i, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs outline-none cursor-pointer"
                  style={{
                    background: 'transparent',
                    color: 'inherit',
                    border: 'none',
                    marginLeft: 2,
                    opacity: 0.9,
                  }}
                >
                  {DURATIONS.map((d) => (
                    <option key={d.value} value={d.value} style={{ color: '#000' }}>{d.label}</option>
                  ))}
                </select>
                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); removeNote(i); }} 
                  className="ml-0.5 opacity-70 hover:opacity-100"
                >
                  <X size={10} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {notes.length === 0 && (
        <div className="flex items-center justify-center p-4 rounded-xl text-xs"
          style={{ background: 'var(--background)', border: '1px dashed var(--border)', color: 'var(--muted)' }}
        >
          아래 건반을 눌러 음표를 추가하세요
        </div>
      )}

      {/* 피아노 건반 3옥타브 */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-3 w-max">
          {[3, 4, 5].map((oct) => (
            <PianoOctave
              key={oct}
              octave={oct}
              selectedNotes={notes.map((n) => n.note)}
              onToggle={addNote}
              activeIndex={activeIndex}
              noteEvents={notes}
            />
          ))}
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {notes.length}/{maxNotes}음 · 음표를 클릭하여 수정 모드 전환
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// 화음: 동시 재생 편집기
// ─────────────────────────────────────────────
export function ChordEditor({
  notes,
  onChange,
  activeIndex,
}: {
  notes: NoteEvent[]
  onChange: (notes: NoteEvent[]) => void
  activeIndex: number | null
}) {
  const toggleNote = (note: string) => {
    const exists = notes.find((n) => n.note === note)
    if (exists) {
      onChange(notes.filter((n) => n.note !== note))
    } else {
      onChange([...notes, { note, duration: '2n' }])
    }
  }

  const changeDuration = (duration: string) => {
    onChange(notes.map((n) => ({ ...n, duration })))
  }

  const chordDur = notes[0]?.duration ?? '2n'

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>화음 구성음 (동시 재생)</p>

      {/* 선택된 음 표시 */}
      <div className="flex flex-wrap items-center gap-2">
        {notes.length > 0 ? (
          notes.map((n) => (
            <span
              key={n.note}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
              style={{
                background: activeIndex !== null ? '#FEF3C7' : '#EEF2FF',
                color: activeIndex !== null ? '#92400e' : 'var(--primary)',
              }}
            >
              {getNoteName(n.note)}
              <button type="button" onClick={() => toggleNote(n.note)} className="opacity-60 hover:opacity-100">
                <X size={10} />
              </button>
            </span>
          ))
        ) : (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>건반을 눌러 구성음을 선택하세요</span>
        )}

        {notes.length > 0 && (
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>음표 길이:</span>
            <select
              value={chordDur}
              onChange={(e) => changeDuration(e.target.value)}
              className="text-xs px-2 py-1 rounded-lg outline-none cursor-pointer"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
            >
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 피아노 건반 */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-3 w-max">
          {[3, 4, 5].map((oct) => (
            <PianoOctave
              key={oct}
              octave={oct}
              selectedNotes={notes.map((n) => n.note)}
              onToggle={toggleNote}
              activeIndex={activeIndex}
              noteEvents={notes}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 리듬: 음높이 없이 박자만 입력
// ─────────────────────────────────────────────
const RHYTHM_SYMBOLS: { value: string; symbol: string; label: string }[] = [
  { value: '1n', symbol: '𝅝', label: '온음표' },
  { value: '2n', symbol: '𝅗𝅥', label: '2분' },
  { value: '4n', symbol: '𝅘𝅥', label: '4분' },
  { value: '8n', symbol: '𝅘𝅥𝅮', label: '8분' },
  { value: '16n', symbol: '𝅘𝅥𝅯', label: '16분' },
  { value: '4n.', symbol: '𝅘𝅥.', label: '점4분' },
  { value: '8n.', symbol: '𝅘𝅥𝅮.', label: '점8분' },
  { value: 'rest', symbol: '𝄽', label: '4분쉼표' },
]

export function RhythmEditor({
  notes,
  onChange,
  activeIndex,
  maxBeats = 16,
}: {
  notes: NoteEvent[]
  onChange: (notes: NoteEvent[]) => void
  activeIndex: number | null
  maxBeats?: number
}) {
  const addBeat = (duration: string) => {
    if (notes.length >= maxBeats) return
    onChange([...notes, { note: duration === 'rest' ? 'rest' : 'C4', duration: duration === 'rest' ? '4n' : duration }])
  }

  const removeLast = () => onChange(notes.slice(0, -1))

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>리듬 패턴 입력</p>

      {/* 리듬 시퀀스 */}
      <div className="flex flex-wrap gap-1.5 p-3 min-h-12 rounded-xl"
        style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
      >
        {notes.length === 0 && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>아래 버튼을 눌러 리듬을 입력하세요</span>
        )}
        {notes.map((n, i) => {
          const sym = RHYTHM_SYMBOLS.find((r) => r.value === n.duration || (n.note === 'rest' && r.value === 'rest'))
          return (
            <span
              key={i}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-lg font-bold"
              style={{
                background: activeIndex === i ? 'var(--accent)' : '#EEF2FF',
                color: activeIndex === i ? '#fff' : 'var(--primary)',
                transition: 'background 0.15s',
              }}
              title={sym?.label}
            >
              {sym?.symbol ?? n.duration}
            </span>
          )
        })}
      </div>

      {/* 입력 버튼 */}
      <div className="flex flex-wrap gap-2">
        {RHYTHM_SYMBOLS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => addBeat(r.value)}
            className="flex flex-col items-center px-3 py-2 rounded-xl text-sm transition-colors hover:bg-blue-50"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              minWidth: 52,
            }}
          >
            <span className="text-xl leading-none">{r.symbol}</span>
            <span className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{r.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={removeLast}
          disabled={notes.length === 0}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm disabled:opacity-40"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: 'var(--danger)',
          }}
        >
          <X size={14} />
          지우기
        </button>
      </div>

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {notes.length}/{maxBeats}박 입력됨
      </p>
    </div>
  )
}
