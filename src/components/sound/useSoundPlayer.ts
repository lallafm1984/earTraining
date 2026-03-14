'use client'

import { useCallback, useRef, useState } from 'react'
import type { AccompEvent } from './accompanimentPatterns'

export type NoteEvent = {
  note: string
  duration: string
  time?: number
}

export type PlayMode = 'sequential' | 'simultaneous'

// ── 음이름 → 주파수 (A4=440Hz) ───────────────────────
const NOTE_FREQ: Record<string, number> = {}
const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
for (let oct = 0; oct <= 8; oct++) {
  for (let i = 0; i < 12; i++) {
    const midi = (oct + 1) * 12 + i
    NOTE_FREQ[NAMES[i] + oct] = 440 * Math.pow(2, (midi - 69) / 12)
  }
}
function noteToFreq(note: string): number {
  return NOTE_FREQ[note] ?? 440
}

// ── duration → 초 ─────────────────────────────────────
function durToSec(dur: string, bpm: number): number {
  const beat = 60 / bpm
  const m: Record<string, number> = {
    '1n': beat*4, '2n': beat*2, '4n': beat,
    '8n': beat/2, '16n': beat/4,
    '2n.': beat*3, '4n.': beat*1.5, '8n.': beat*0.75,
  }
  return m[dur] ?? beat
}

// ── 단일 노트 재생 ────────────────────────────────────
function playTone(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  startTime: number,
  dur: number,
  vol: number,
  wave: OscillatorType,
) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()

  osc.type = wave
  osc.frequency.value = freq

  // 간단한 엔벨로프: 즉시 volume → 끝에서 페이드아웃
  env.gain.setValueAtTime(0.001, startTime)
  env.gain.exponentialRampToValueAtTime(vol, startTime + 0.01)
  env.gain.setValueAtTime(vol, startTime + dur * 0.8)
  env.gain.exponentialRampToValueAtTime(0.001, startTime + dur)

  osc.connect(env)
  env.connect(dest)

  osc.start(startTime)
  osc.stop(startTime + dur + 0.05)
}

// ── 메인 훅 ───────────────────────────────────────────
export function useSoundPlayer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeNoteIndex, setActiveNoteIndex] = useState<number | null>(null)

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const ctxRef    = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const uiAt = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms))
  }, [])

  const stop = useCallback(() => {
    clearTimers()
    if (masterRef.current && ctxRef.current) {
      try {
        masterRef.current.gain.cancelScheduledValues(ctxRef.current.currentTime)
        masterRef.current.gain.setValueAtTime(0, ctxRef.current.currentTime)
      } catch { /* ignore */ }
    }
    setIsPlaying(false)
    setActiveNoteIndex(null)
  }, [clearTimers])

  const play = useCallback(
    async (
      notes: NoteEvent[],
      bpm = 80,
      mode: PlayMode = 'sequential',
      accompBar?: AccompEvent[],
      accompBars?: number,
      timeSignature?: string,
    ) => {
      if (!notes.length) return
      stop()

      // AudioContext
      if (!ctxRef.current || ctxRef.current.state === 'closed') {
        ctxRef.current = new AudioContext()
      }
      const ctx = ctxRef.current
      if (ctx.state === 'suspended') await ctx.resume()

      // 멜로디 게인
      const melGain = ctx.createGain()
      melGain.gain.value = 1.0
      
      // 반주 게인 (별도 게인 노드)
      const accGain = ctx.createGain()
      accGain.gain.value = 1.0

      // 마스터 (stop 용)
      const master = ctx.createGain()
      master.gain.value = 1.0
      
      melGain.connect(master)
      accGain.connect(master)
      master.connect(ctx.destination)
      masterRef.current = master

      setIsPlaying(true)

      const t0   = ctx.currentTime + 0.05
      const beat = 60 / bpm
      
      // 박자 계산 (분자)
      const ts = timeSignature || '4/4'
      const beatsPerBar = parseInt(ts.split('/')[0] || '4', 10)
      const bars = accompBars || 2

      // ==================================================
      // 반주: accGain에 연결, vol 높여서 확실히 들리게
      // ==================================================
      if (accompBar && accompBar.length > 0) {
        const barLen = beat * beatsPerBar
        let scheduled = 0

        for (let b = 0; b < bars; b++) {
          for (const ev of accompBar) {
            const st  = t0 + b * barLen + ev.offset * beat
            const dur = durToSec(ev.duration, bpm)
            const arr = Array.isArray(ev.notes) ? ev.notes : [ev.notes]

            for (const n of arr) {
              playTone(ctx, accGain, noteToFreq(n), st, dur, 0.3, 'triangle')
              scheduled++
            }
          }
        }
        console.log(`[accomp] scheduled ${scheduled} tones, bars=${bars}, ts=${ts}`)
      } else {
        console.log('[accomp] no accompBar provided')
      }

      // ==================================================
      // 멜로디: melGain에 연결
      // ==================================================
      let totalDuration = 0

      if (mode === 'simultaneous') {
        const dur = durToSec(notes[0]?.duration ?? '2n', bpm)
        for (const n of notes) {
          playTone(ctx, melGain, noteToFreq(n.note), t0, dur, 0.3, 'triangle')
        }
        totalDuration = dur
        setActiveNoteIndex(0)
        console.log(`[melody] simultaneous: ${notes.length} notes, dur=${dur.toFixed(2)}s`)
      } else {
        let offset = 0
        for (let i = 0; i < notes.length; i++) {
          const n   = notes[i]
          const dur = durToSec(n.duration, bpm)

          if (n.note !== 'rest') {
            playTone(ctx, melGain, noteToFreq(n.note), t0 + offset, dur, 0.3, 'triangle')
          }

          // UI 하이라이트 (setTimeout)
          const ms = offset * 1000
          uiAt(() => setActiveNoteIndex(i), ms)

          offset += dur
        }
        totalDuration = offset
        console.log(`[melody] sequential: ${notes.length} notes, total=${totalDuration.toFixed(2)}s`)
      }

      // 종료 타이머
      uiAt(() => {
        setIsPlaying(false)
        setActiveNoteIndex(null)
      }, totalDuration * 1000 + 400)
    },
    [stop, uiAt],
  )

  return { play, stop, isPlaying, activeNoteIndex }
}
