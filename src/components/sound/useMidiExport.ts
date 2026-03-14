'use client'

import type { NoteEvent } from './useSoundPlayer'
import type { AccompEvent } from './accompanimentPatterns'

// ── MIDI 음이름 → MIDI 번호 변환 ───────────────
const SEMITONES: Record<string, number> = {
  C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11
}

function noteToMidi(note: string): number {
  const m = note.match(/^([A-G]#?b?)(\d)$/)
  if (!m) return 60
  const [, pitch, octStr] = m
  return (parseInt(octStr) + 1) * 12 + (SEMITONES[pitch] ?? 0)
}

// Tone.js duration → 틱 (PPQ=480 기준)
function durationToTicks(dur: string, ppq = 480): number {
  const map: Record<string, number> = {
    '1n':  ppq * 4,
    '2n':  ppq * 2,
    '4n':  ppq,
    '8n':  ppq / 2,
    '16n': ppq / 4,
    '2n.': ppq * 3,
    '4n.': ppq * 1.5,
    '8n.': ppq * 0.75,
  }
  return Math.round(map[dur] ?? ppq)
}

// ── 가변 길이 정수 인코딩 (MIDI delta time) ───────
function varLen(value: number): number[] {
  const bytes: number[] = []
  bytes.unshift(value & 0x7f)
  value >>= 7
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80)
    value >>= 7
  }
  return bytes
}

// ── 4바이트 빅엔디언 ─────────────────────────────
function int32(n: number): number[] {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function int16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff]
}

// ── 트랙 이벤트 빌더 ─────────────────────────────
type RawEvent = { tick: number; data: number[] }

function buildTrack(events: RawEvent[]): number[] {
  // tick 기준 정렬
  events.sort((a, b) => a.tick - b.tick)

  const bytes: number[] = []
  let currentTick = 0

  for (const ev of events) {
    const delta = Math.max(0, ev.tick - currentTick)
    bytes.push(...varLen(delta))
    bytes.push(...ev.data)
    currentTick = ev.tick
  }

  // End of Track
  bytes.push(...varLen(0), 0xff, 0x2f, 0x00)

  // 트랙 헤더 + 길이
  const header = [0x4d, 0x54, 0x72, 0x6b, ...int32(bytes.length)]
  return [...header, ...bytes]
}

// ── 음표 NoteEvent[] → RawEvent[] (채널 ch) ──────
function melodyToRawEvents(
  notes: NoteEvent[],
  mode: 'sequential' | 'simultaneous',
  ch = 0,
  ppq = 480
): RawEvent[] {
  const events: RawEvent[] = []

  if (mode === 'simultaneous') {
    // 화음: tick 0에 모두 noteOn, 같은 길이 후 noteOff
    const dur = durationToTicks(notes[0]?.duration ?? '2n', ppq)
    for (const n of notes) {
      const midi = noteToMidi(n.note)
      events.push({ tick: 0,   data: [0x90 | ch, midi, 100] })
      events.push({ tick: dur, data: [0x80 | ch, midi, 0]   })
    }
  } else {
    let tick = 0
    for (const n of notes) {
      if (n.note === 'rest') { tick += durationToTicks(n.duration, ppq); continue }
      const midi = noteToMidi(n.note)
      const dur  = durationToTicks(n.duration, ppq)
      events.push({ tick,       data: [0x90 | ch, midi, 100] })
      events.push({ tick: tick + Math.round(dur * 0.9), data: [0x80 | ch, midi, 0] })
      tick += dur
    }
  }
  return events
}

// ── 반주 AccompEvent[] → RawEvent[] (반복 bars마디) ─
function accompToRawEvents(
  bar: AccompEvent[],
  bars: number,
  ch = 1,
  ppq = 480
): RawEvent[] {
  const events: RawEvent[] = []
  const barTicks = ppq * 4 // 4/4 기준

  for (let b = 0; b < bars; b++) {
    for (const ev of bar) {
      const startTick = b * barTicks + Math.round(ev.offset * ppq)
      const dur = durationToTicks(ev.duration, ppq)
      const noteArr = Array.isArray(ev.notes) ? ev.notes : [ev.notes]
      for (const note of noteArr) {
        const midi = noteToMidi(note)
        events.push({ tick: startTick,              data: [0x90 | ch, midi, 80] })
        events.push({ tick: startTick + Math.round(dur * 0.95), data: [0x80 | ch, midi, 0] })
      }
    }
  }
  return events
}

// ── 공개 함수 ─────────────────────────────────────

export type ExportOptions = {
  notes: NoteEvent[]
  mode: 'sequential' | 'simultaneous'
  bpm: number
  accompBar?: AccompEvent[]   // 없으면 반주 없음
  bars?: number               // 반주 반복 마디 수 (기본 2)
  title?: string
}

export function buildMidiBlob(opts: ExportOptions): Blob {
  const { notes, mode, bpm, accompBar, bars = 2, title = 'eartraining' } = opts
  const PPQ = 480
  const tempoMicros = Math.round(60_000_000 / bpm)

  // ── 트랙 0: 템포 + 박자표 메타 ──
  const meta: RawEvent[] = [
    // 템포
    { tick: 0, data: [0xff, 0x51, 0x03, (tempoMicros >> 16) & 0xff, (tempoMicros >> 8) & 0xff, tempoMicros & 0xff] },
    // 박자표 4/4
    { tick: 0, data: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] },
    // 곡 제목
    ...(() => {
      const bytes = Array.from(new TextEncoder().encode(title))
      return [{ tick: 0, data: [0xff, 0x03, bytes.length, ...bytes] }]
    })(),
  ]
  const track0 = buildTrack(meta)

  // ── 트랙 1: 멜로디 ──
  const melRaw = melodyToRawEvents(notes, mode, 0, PPQ)
  // 프로그램 체인지 — ch0: Acoustic Grand Piano (0)
  melRaw.unshift({ tick: 0, data: [0xc0, 0] })
  const track1 = buildTrack(melRaw)

  const tracks = [track0, track1]

  // ── 트랙 2: 반주 (옵션) ──
  if (accompBar && accompBar.length > 0) {
    const accRaw = accompToRawEvents(accompBar, bars, 1, PPQ)
    // 프로그램 체인지 — ch1: Acoustic Grand Piano (0) or strings (48)
    accRaw.unshift({ tick: 0, data: [0xc1, 0] })
    tracks.push(buildTrack(accRaw))
  }

  // ── MIDI 파일 헤더 ──
  // Format 1, n트랙, PPQ
  const numTracks = tracks.length
  const header = [
    0x4d, 0x54, 0x68, 0x64,       // MThd
    ...int32(6),                    // 헤더 길이
    ...int16(numTracks > 1 ? 1 : 0), // format (1=멀티트랙)
    ...int16(numTracks),
    ...int16(PPQ),
  ]

  const allBytes = new Uint8Array([...header, ...tracks.flat()])
  return new Blob([allBytes], { type: 'audio/midi' })
}

export function downloadMidi(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.mid') ? filename : `${filename}.mid`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
