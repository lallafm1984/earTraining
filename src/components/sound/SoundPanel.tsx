'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Play, Square, RotateCcw, Volume2,
  Music, Download, ChevronDown, ChevronUp, BookOpen,
} from 'lucide-react'
import { useSoundPlayer, type NoteEvent } from './useSoundPlayer'
import { SequenceEditor, ChordEditor, RhythmEditor } from './NoteEditor'
import { ACCOMP_PATTERNS, type AccompPattern, shiftNote, SEMITONES } from './accompanimentPatterns'
import { buildMidiBlob, downloadMidi } from './useMidiExport'
import StaffNotation from './StaffNotation'

// ── 타입 ──────────────────────────────────────────
type QuestionType =
  | 'TYPE-01' | 'TYPE-02' | 'TYPE-03'
  | 'TYPE-04' | 'TYPE-05' | 'TYPE-06'

type PlayMode = 'sequential' | 'simultaneous' | 'rhythm'

const TYPE_MODE: Record<QuestionType, PlayMode> = {
  'TYPE-01': 'sequential',
  'TYPE-02': 'sequential',
  'TYPE-03': 'simultaneous',
  'TYPE-04': 'rhythm',
  'TYPE-05': 'sequential',
  'TYPE-06': 'sequential',
}

const TYPE_MAX: Record<QuestionType, number> = {
  'TYPE-01': 1, 'TYPE-02': 2, 'TYPE-03': 6,
  'TYPE-04': 16, 'TYPE-05': 16, 'TYPE-06': 8,
}

const TYPE_LABEL: Record<QuestionType, string> = {
  'TYPE-01': '단음 1개를 입력하세요',
  'TYPE-02': '음정을 이루는 두 음을 순서대로 입력하세요',
  'TYPE-03': '화음 구성음을 모두 선택하세요',
  'TYPE-04': '리듬 패턴을 입력하세요',
  'TYPE-05': '선율을 순서대로 입력하세요 (최대 16음)',
  'TYPE-06': '조성을 나타내는 선율을 입력하세요',
}

const KEY_TO_ROOT: Record<string, string> = {
  C:'C3', G:'G3', D:'D3', A:'A3', E:'E3', B:'B2',
  'F#':'F#2', F:'F3', Bb:'A#2', Eb:'D#3', Ab:'G#2', Db:'C#3',
  Am:'A2', Em:'E3', Bm:'B2', 'F#m':'F#2', 'C#m':'C#3', 'G#m':'G#2',
  Dm:'D3', Gm:'G2', Cm:'C3', Fm:'F2', Bbm:'A#2', Ebm:'D#2',
}

// ── 파형 애니메이션 ───────────────────────────────
function WaveVisualizer({ isPlaying, accompOn }: { isPlaying: boolean; accompOn: boolean }) {
  return (
    <div className="flex items-center justify-center gap-0.5" style={{ height: 32 }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="rounded-full"
          style={{
            width: 3,
            background: accompOn && i % 3 === 0 ? '#a78bfa' : 'var(--accent)',
            height: isPlaying ? undefined : 4,
            animationName: isPlaying ? 'wave' : 'none',
            animationDuration: `${0.35 + (i % 6) * 0.08}s`,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDirection: 'alternate',
            animationDelay: `${(i % 8) * 0.04}s`,
            minHeight: 4,
            maxHeight: 28,
          }}
        />
      ))}
      <style>{`@keyframes wave { from { height: 4px; } to { height: 26px; } }`}</style>
    </div>
  )
}

// ── 반주 설정 패널 ────────────────────────────────
function AccompSelector({
  selected, onSelect, rootNote, onRootChange, bars, onBarsChange,
}: {
  selected: AccompPattern | null
  onSelect: (p: AccompPattern) => void
  rootNote: string
  onRootChange: (r: string) => void
  bars: number
  onBarsChange: (n: number) => void
}) {
  return (
    <div className="rounded-xl p-4 space-y-4" style={{ background: '#1e1b4b18', border: '1px solid #818cf833' }}>
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-32">
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#818cf8' }}>반주 조성</label>
          <select
            value={rootNote}
            onChange={(e) => onRootChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
            style={{ background: 'var(--surface)', border: '1px solid #818cf844', color: 'var(--foreground)' }}
          >
            {Object.keys(KEY_TO_ROOT).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="min-w-28">
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#818cf8' }}>반주 길이</label>
          <select
            value={bars}
            onChange={(e) => onBarsChange(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
            style={{ background: 'var(--surface)', border: '1px solid #818cf844', color: 'var(--foreground)' }}
          >
            {[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n}마디</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-2" style={{ color: '#818cf8' }}>반주 패턴</label>
        <div className="grid grid-cols-2 gap-2">
          {ACCOMP_PATTERNS.map((p) => {
            const active = selected?.id === p.id
            return (
              /* button이 이미 바깥 div(역할: 클릭영역) 안에 있고,
                 부모가 button이 아니므로 여기는 button 사용 가능 */
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                className="text-left px-3 py-2.5 rounded-xl border transition-all"
                style={{
                  background: active ? '#4f46e5' : 'var(--surface)',
                  borderColor: active ? '#6366f1' : '#818cf833',
                  color: active ? '#fff' : 'var(--foreground)',
                }}
              >
                <p className="text-xs font-semibold leading-tight">{p.label}</p>
                <p className="mt-0.5 leading-tight" style={{ color: active ? '#c7d2fe' : 'var(--muted)', fontSize: 10 }}>
                  {p.description}
                </p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── 메인 SoundPanel ───────────────────────────────
export default function SoundPanel({
  questionType, bpm, keySignature = 'C', timeSignature = '4/4', initialNotes, onNotesChange,
}: {
  questionType: QuestionType
  bpm: number
  keySignature?: string
  timeSignature?: string
  initialNotes?: NoteEvent[]
  onNotesChange?: (notes: NoteEvent[]) => void
}) {
  const [notes, setNotes]           = useState<NoteEvent[]>(initialNotes || [])
  const [accompOn, setAccompOn]     = useState(false)
  const [accompOpen, setAccompOpen] = useState(false)
  const [staffOpen, setStaffOpen]   = useState(true)  // 악보 펼치기 (기본: 열림)
  const [selectedPattern, setSelectedPattern] = useState<AccompPattern | null>(null)
  const [rootNote, setRootNote]     = useState(keySignature)
  const [accompBars, setAccompBars] = useState(2)
  const prevKeySignature = useRef(keySignature)

  const { play, stop, isPlaying, activeNoteIndex } = useSoundPlayer()

  const mode     = TYPE_MODE[questionType]
  const maxNotes = TYPE_MAX[questionType]
  const playMode = mode === 'simultaneous' ? 'simultaneous' : 'sequential'

  useEffect(() => {
    // questionType 변경 시 초기화 (initialNotes가 있으면 그것을 사용, 없으면 빈 배열)
    // 단, initialNotes는 초기 로딩 시에만 적용되어야 하므로 여기서는 빈 배열로 리셋하는 것이 맞음
    // 하지만 "수정 페이지" 등을 고려하면 로직이 복잡해질 수 있음.
    // 현재는 "새 문제"에서는 타입 변경 시 리셋, "상세 보기"에서는 타입 변경이 없으므로 안전.
    if (!initialNotes) {
      setNotes([])
      stop()
    }
    prevKeySignature.current = keySignature 
  }, [questionType]) // eslint-disable-line react-hooks/exhaustive-deps

  // 조성 변경 시 이조(Transpose) 처리
  useEffect(() => {
    // 1. 루트 노트 업데이트
    setRootNote(keySignature)
    
    // 2. 이조 처리
    if (prevKeySignature.current && keySignature && prevKeySignature.current !== keySignature) {
      // KEY_TO_ROOT 맵핑을 이용해 옥타브 포함된 루트음(예: 'C3', 'G3')을 가져옴
      const prevRoot = KEY_TO_ROOT[prevKeySignature.current] || 'C3'
      const newRoot = KEY_TO_ROOT[keySignature] || 'C3'
      
      // 루트음에서 피치와 옥타브 분리하여 반음 차이 계산
      const getNoteVal = (n: string) => {
        const match = n.match(/^([A-G]#?b?)(\d)$/)
        if (!match) return 0
        const pitch = match[1]
        const oct = parseInt(match[2])
        const semitone = SEMITONES[pitch] ?? 0
        return oct * 12 + semitone
      }

      const prevVal = getNoteVal(prevRoot)
      const newVal = getNoteVal(newRoot)
      const diff = newVal - prevVal

      // notes 배열의 모든 음표를 diff만큼 이동
      if (notes.length > 0 && diff !== 0) {
        const transposed = notes.map(n => {
          if (n.note === 'rest') return n
          return {
            ...n,
            note: shiftNote(n.note, diff)
          }
        })
        setNotes(transposed)
        onNotesChange?.(transposed)
      }
    }
    prevKeySignature.current = keySignature
  }, [keySignature])

  const handleNotesChange = (updated: NoteEvent[]) => {
    setNotes(updated); onNotesChange?.(updated)
  }

  const getAccompBar = () =>
    accompOn && selectedPattern
      ? selectedPattern.buildBar(KEY_TO_ROOT[rootNote] ?? 'C3', timeSignature)
      : undefined

  const handlePlay = () => {
    if (!notes.length) return
    if (isPlaying) { stop(); return }
    play(notes, bpm, playMode, getAccompBar(), accompBars, timeSignature)
  }

  const handleReset = () => { stop(); setNotes([]); onNotesChange?.([]) }

  const handleMidiDownload = () => {
    if (!notes.length) return
    const blob = buildMidiBlob({
      notes, mode: playMode, bpm,
      accompBar: getAccompBar(), bars: accompBars,
      title: `eartraining_${questionType}_${Date.now()}`,
    })
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    downloadMidi(blob, `eartraining_${questionType.replace('-','').toLowerCase()}_${date}`)
  }

  // 반주 토글 — button 중첩 없이 div + role로 처리
  const handleAccompToggle = () => {
    const next = !accompOn
    setAccompOn(next)
    if (next) {
      setAccompOpen(true)
      if (!selectedPattern) setSelectedPattern(ACCOMP_PATTERNS[0])
    }
  }

  const hasNotes = notes.length > 0

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>{TYPE_LABEL[questionType]}</p>

      {/* ── 악보 미리보기 ─────────────────────────────── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        {/* 악보 헤더 토글 */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setStaffOpen((v) => !v)}
          onKeyDown={(e) => e.key === 'Enter' && setStaffOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer select-none"
          style={{ background: 'var(--surface)' }}
        >
          <div className="flex items-center gap-2">
            <BookOpen size={14} style={{ color: 'var(--primary)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>악보 미리보기</span>
            {notes.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: '#EEF2FF', color: 'var(--primary)' }}>
                {notes.length}음
              </span>
            )}
          </div>
          <div style={{ color: 'var(--muted)' }}>
            {staffOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>

        {/* 악보 본체 */}
        {staffOpen && (
          <div className="px-3 pb-3 pt-1" style={{ background: 'var(--background)' }}>
            <StaffNotation
              notes={notes}
              keySignature={keySignature}
              timeSignature={timeSignature}
              activeIndex={activeNoteIndex}
              mode={mode === 'rhythm' ? 'rhythm' : mode === 'simultaneous' ? 'simultaneous' : 'sequential'}
            />
          </div>
        )}
      </div>

      {/* 음표 편집기 */}
      {mode === 'rhythm' ? (
        <RhythmEditor notes={notes} onChange={handleNotesChange} activeIndex={activeNoteIndex} maxBeats={maxNotes} />
      ) : mode === 'simultaneous' ? (
        <ChordEditor notes={notes} onChange={handleNotesChange} activeIndex={activeNoteIndex} />
      ) : (
        <SequenceEditor
          notes={notes}
          onChange={handleNotesChange}
          activeIndex={activeNoteIndex}
          maxNotes={maxNotes}
          label="음표 시퀀스"
          keySignature={keySignature}
        />
      )}

      {/* ── 반주 섹션 ─────────────────────────────── */}
      {/* ⚠️ 이 div는 form 안에 있으므로 button 중첩을 피해야 함.
             토글 헤더 전체를 div + role="button"으로 처리 */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: `1px solid ${accompOn ? '#818cf855' : 'var(--border)'}` }}
      >
        {/* 토글 헤더 — div + role="button" (button 중첩 방지) */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleAccompToggle}
          onKeyDown={(e) => e.key === 'Enter' && handleAccompToggle()}
          className="w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none"
          style={{ background: accompOn ? '#1e1b4b22' : 'var(--surface)' }}
        >
          <div className="flex items-center gap-2">
            <Music size={16} style={{ color: accompOn ? '#818cf8' : 'var(--muted)' }} />
            <span className="text-sm font-medium" style={{ color: accompOn ? '#818cf8' : 'var(--foreground)' }}>
              반주
            </span>
            {accompOn && selectedPattern && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#4f46e5', color: '#fff' }}>
                {selectedPattern.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* 토글 스위치 (시각적 표시만) */}
            <div
              className="relative rounded-full flex-shrink-0"
              style={{ width: 36, height: 20, background: accompOn ? '#4f46e5' : '#d1d5db', transition: 'background .2s' }}
            >
              <div
                className="absolute top-0.5 rounded-full"
                style={{
                  width: 16, height: 16, background: '#fff',
                  left: accompOn ? 18 : 2,
                  transition: 'left .2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                }}
              />
            </div>

            {/* 펼치기/접기 — stopPropagation으로 토글 방지, div 사용 */}
            {accompOn && (
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setAccompOpen((v) => !v) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setAccompOpen((v) => !v) } }}
                className="flex items-center justify-center w-6 h-6 rounded-md cursor-pointer"
                style={{ color: '#818cf8' }}
              >
                {accompOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            )}
          </div>
        </div>

        {/* 반주 설정 패널 */}
        {accompOn && accompOpen && (
          <div className="px-4 pb-4 pt-1" style={{ background: '#1e1b4b0a' }}>
            <AccompSelector
              selected={selectedPattern} onSelect={setSelectedPattern}
              rootNote={rootNote} onRootChange={setRootNote}
              bars={accompBars} onBarsChange={setAccompBars}
            />
          </div>
        )}
      </div>

      {/* ── 재생 컨트롤 바 ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{
          background: hasNotes ? '#0f172a' : 'var(--background)',
          border: '1px solid var(--border)',
          transition: 'background .3s',
        }}
      >
        <button
          type="button"
          onClick={handlePlay}
          disabled={!hasNotes}
          className="flex items-center justify-center rounded-xl text-white disabled:opacity-40 flex-shrink-0"
          style={{ width: 44, height: 44, background: isPlaying ? '#ef4444' : 'var(--accent)' }}
        >
          {isPlaying ? <Square size={18} fill="white" /> : <Play size={18} fill="white" />}
        </button>

        <div className="flex-1 flex items-center justify-center">
          {hasNotes ? (
            <WaveVisualizer isPlaying={isPlaying} accompOn={accompOn} />
          ) : (
            <div className="flex items-center gap-1.5" style={{ color: '#6b7280' }}>
              <Volume2 size={14} />
              <span className="text-xs">음표를 입력하면 미리 들을 수 있습니다</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {accompOn && hasNotes && (
            <span className="text-xs px-1.5 py-0.5 rounded-md font-medium" style={{ background: '#4f46e533', color: '#818cf8' }}>
              반주
            </span>
          )}
          <span
            className="text-xs font-medium"
            style={{ color: isPlaying ? 'var(--accent)' : hasNotes ? '#9ca3af' : 'var(--muted)', minWidth: 36, textAlign: 'right' }}
          >
            {isPlaying ? '재생 중' : hasNotes ? `${notes.length}음` : ''}
          </span>
        </div>

        <button
          type="button"
          onClick={handleReset}
          disabled={!hasNotes}
          title="초기화"
          className="flex items-center justify-center w-8 h-8 rounded-lg disabled:opacity-30 flex-shrink-0"
          style={{ color: '#6b7280' }}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* MIDI 다운로드 */}
      {hasNotes && (
        <button
          type="button"
          onClick={handleMidiDownload}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium w-full justify-center hover:opacity-90"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
        >
          <Download size={15} style={{ color: 'var(--primary)' }} />
          MIDI 파일 다운로드
          {accompOn && selectedPattern && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>(멜로디 + 반주)</span>
          )}
        </button>
      )}

      {hasNotes && (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          BPM <strong>{bpm}</strong>
          {accompOn && selectedPattern ? ` · 반주: ${selectedPattern.label} ${accompBars}마디` : ''}
        </p>
      )}
    </div>
  )
}
