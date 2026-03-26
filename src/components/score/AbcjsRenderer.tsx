'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import abcjs from 'abcjs';
import 'abcjs/abcjs-audio.css';
import { Play, Square, Volume2 } from 'lucide-react';

interface AbcjsRendererProps {
  abcString: string;
  prependBasePitch?: boolean;
  prependMetronome?: boolean;
  timeSignature?: string;
  tempo?: number;
  scaleTempo?: number;
  keySignature?: string;
  metronomeFreq?: number;
  examMode?: boolean;
  examWaitSeconds?: number;
  stretchLast?: boolean;
  onNoteClick?: (noteIndex: number, voice: 'treble' | 'bass') => void;
  selectedNote?: { index: number; voice: 'treble' | 'bass' } | null;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function splitBodyMeasures(body: string): string[] {
  return body.replace(/\|\]\s*$/g, '').split('|').map(s => s.trim()).filter(Boolean);
}

function parseAbcParts(abc: string) {
  const lines = abc.split('\n');
  const isHdr = (l: string) => (/^[A-Z]:/.test(l) && !/^V:/.test(l)) || /^%%/.test(l);
  const header = lines.filter(isHdr).join('\n');
  const bodyLines = lines.filter(l => !isHdr(l));
  const bodyStr = bodyLines.join('\n');
  const isGrand = bodyStr.includes('V:V1');

  if (!isGrand) {
    return { header, isGrand: false, treble: splitBodyMeasures(bodyStr), bass: [] as string[] };
  }
  const v1 = bodyStr.match(/V:V1[^\n]*\n([\s\S]*?)(?=\nV:V2)/m);
  const v2 = bodyStr.match(/V:V2[^\n]*\n([\s\S]*)$/m);
  return {
    header,
    isGrand: true,
    treble: splitBodyMeasures(v1?.[1] || ''),
    bass: splitBodyMeasures(v2?.[1] || ''),
  };
}

function rebuildSegmentAbc(header: string, isGrand: boolean, treble: string[], bass: string[]): string {
  if (!isGrand) return header + '\n' + treble.join(' | ') + ' |]';
  return (
    header +
    '\nV:V1 clef=treble\n' + treble.join(' | ') + ' |]' +
    '\nV:V2 clef=bass\n' + bass.join(' | ') + ' |]'
  );
}

const SCALE_NOTES: Record<string, string[]> = {
  'C':   ['C','D','E','F','G','A','B','c'],
  'G':   ['G','A','B','c','d','e','f','g'],
  'D':   ['D','E','F','G','A','B','c','d'],
  'A':   ['A,','B,','C','D','E','F','G','A'],
  'F':   ['F','G','A','B','c','d','e','f'],
  'Bb':  ['B,','C','D','E','F','G','A','B'],
  'Eb':  ['E','F','G','A','B','c','d','e'],
  'Am':  ['A,','B,','C','D','E','F','G','A'],
  'Em':  ['E','F','G','A','B','c','d','e'],
  'Bm':  ['B,','C','D','E','F','G','A','B'],
  'F#m': ['F,','G,','A,','B,','C','D','E','F'],
  'Dm':  ['D','E','F','G','A','B','c','d'],
  'Gm':  ['G,','A,','B,','C','D','E','F','G'],
  'Cm':  ['C','D','E','F','G','A','B','c'],
};

// ── WAV 인코딩 유틸리티 ─────────────────────────────────────────
function encodeWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;
  const blockAlign = numChannels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataLength = audioBuffer.length * blockAlign;

  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// ── 메트로놈 클릭 생성 ──────────────────────────────────────────
function createMetronomeClick(
  audioCtx: AudioContext | OfflineAudioContext,
  startTime: number,
  isAccent: boolean,
  frequency: number = 1000
) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.frequency.value = frequency;
  osc.type = 'sine';

  gain.gain.setValueAtTime(0.5, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);

  osc.start(startTime);
  osc.stop(startTime + 0.05);
}

function downloadWav(buffer: AudioBuffer, title: string) {
  const wavBlob = encodeWav(buffer);
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `${title || 'score'}_${timestamp}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AbcjsRenderer({
  abcString,
  prependBasePitch,
  prependMetronome,
  timeSignature = '4/4',
  tempo = 120,
  scaleTempo = 120,
  keySignature = 'C',
  metronomeFreq = 1000,
  examMode = false,
  examWaitSeconds = 3,
  stretchLast = true,
  onNoteClick,
  selectedNote,
}: AbcjsRendererProps) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const synthRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cancelRef = useRef(false);
  const playEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 항상 최신 콜백 참조 유지
  const onNoteClickRef = useRef(onNoteClick);
  useEffect(() => { onNoteClickRef.current = onNoteClick; });

  // ── ABC 렌더링 + 클릭 리스너 + 마디 균일 간격 ──
  useEffect(() => {
    if (!paperRef.current) return;
    abcjs.renderAbc(paperRef.current, abcString, {
      add_classes: true,
      responsive: 'resize',
      scale: 1.2,
      staffwidth: 800,
      // 마디 간격을 균일하게 고정 (우측 끝까지 늘리지 않음)
      wrap: { minSpacing: 1.8, maxSpacing: 1.8, preferredMeasuresPerLine: 4 },
      format: { stretchlast: stretchLast },
      clickListener: (_abcElem: any, _tuneNumber: number, _classes: string, analysis: any, _drag: any) => {
        if (!onNoteClickRef.current || !paperRef.current) return;
        const el: Element | undefined = analysis?.selectableElement;
        if (!el) return;
        const voiceIdx: number = analysis?.voice ?? 0;
        const voice: 'treble' | 'bass' = voiceIdx === 1 ? 'bass' : 'treble';
        const voiceClass = voiceIdx === 1 ? 'abcjs-v1' : 'abcjs-v0';
        const allNotes = Array.from(
          paperRef.current!.querySelectorAll(`.${voiceClass}.abcjs-note, .${voiceClass}.abcjs-rest`)
        );
        const idx = allNotes.indexOf(el);
        if (idx >= 0) onNoteClickRef.current(idx, voice);
      },
    });
  }, [abcString]); // eslint-disable-line

  // ── 선택 음표 하이라이트 ──
  // CSS 클래스 방식이 SVG 재렌더 시 불안정하므로 직접 style.fill 조작으로 교체.
  // data-score-sel 속성으로 하이라이트 적용 요소를 추적.
  const selIndex = selectedNote?.index ?? -1;
  const selVoice = selectedNote?.voice ?? '';

  useEffect(() => {
    if (!paperRef.current) return;

    const setNoteFill = (el: Element, color: string) => {
      el.querySelectorAll('path, ellipse, polygon, polyline, rect, use').forEach(child => {
        (child as SVGElement).style.fill = color;
      });
    };

    // 모든 음표/쉼표를 검정색으로 초기화
    paperRef.current.querySelectorAll('.abcjs-note, .abcjs-rest').forEach(el => {
      setNoteFill(el, '#000');
      el.removeAttribute('data-score-sel');
    });

    if (selIndex < 0) return;

    const voiceClass = selVoice === 'bass' ? 'abcjs-v1' : 'abcjs-v0';
    const allNotes = Array.from(
      paperRef.current.querySelectorAll(`.${voiceClass}.abcjs-note, .${voiceClass}.abcjs-rest`)
    );
    const targetEl = allNotes[selIndex] as SVGElement | undefined;
    if (!targetEl) return;

    targetEl.setAttribute('data-score-sel', 'true');
    setNoteFill(targetEl, '#ef4444');
  }, [abcString, selIndex, selVoice]);

  // 템포를 인자로 받는 타이밍 계산 함수
  const getTimingForBpm = useCallback((bpm: number) => {
    const [topStr, bottomStr] = timeSignature.split('/');
    const top = parseInt(topStr, 10) || 4;
    const bottom = parseInt(bottomStr, 10) || 4;
    const beatDuration = 60 / bpm;
    const actualBeatDuration = beatDuration * (4 / bottom);
    const multiplier = 16 / bottom;

    return { top, bottom, beatDuration, actualBeatDuration, multiplier };
  }, [timeSignature]);

  const getTimingInfo = useCallback(() => getTimingForBpm(tempo), [getTimingForBpm, tempo]);
  const getScaleTimingInfo = useCallback(() => getTimingForBpm(scaleTempo), [getTimingForBpm, scaleTempo]);

  // ── 오디오 전체 ABC 생성 (스케일 + 메트로놈 묵음 + 본 악보) ──────────
  const buildCombinedAbc = useCallback(() => {
    const { multiplier } = getTimingInfo();
    const lines = abcString.split('\n');
    const isHeader = (l: string) => (/^[A-Z]:/.test(l) && !/^V:/.test(l)) || /^%%/.test(l);
    const headerLines = lines.filter(isHeader);
    const bodyLines = lines.filter(l => !isHeader(l));
    const headerStr = headerLines.join('\n');

    // 큰보표(grand staff) 여부 감지
    const isGrandStaff = abcString.includes('V:V1') || abcString.includes('V:V2');

    // 스케일 프리픽스 문자열 생성
    let scalePrepend = '';
    if (prependBasePitch) {
      const m = multiplier;
      const ascending = SCALE_NOTES[keySignature] || SCALE_NOTES['C'];
      const descending = [...ascending].slice(0, -1).reverse();
      const allNotes = [...ascending, ...descending, 'z'];

      const [topStr, bottomStr] = timeSignature.split('/');
      const bottom = parseInt(bottomStr, 10) || 4;
      const sixteenthsPerBar = parseInt(topStr, 10) * (16 / bottom);
      let barPos = 0;

      scalePrepend += `[Q:${scaleTempo}] `;
      for (const n of allNotes) {
        scalePrepend += `${n}${m} `;
        barPos += m;
        if (barPos >= sixteenthsPerBar) {
          scalePrepend += '| ';
          barPos = 0;
        }
      }
      if (barPos > 0) scalePrepend += '| ';
      scalePrepend += `[Q:${tempo}] `;
    }

    // 메트로놈 묵음 프리픽스 문자열 생성
    let metronomePrepend = '';
    if (prependMetronome) {
      const m = multiplier;
      const { top } = getTimingInfo();
      for (let i = 0; i < top; i++) {
        metronomePrepend += `z${m} `;
      }
      metronomePrepend += '| ';
    }

    const prepends = scalePrepend + metronomePrepend;

    if (!isGrandStaff) {
      return headerStr + '\n' + prepends + bodyLines.join('\n');
    }

    // 큰보표: V:V1 보이스 앞에만 스케일/메트로놈 삽입,
    // V:V2(bass)는 같은 길이의 묵음으로 채워줌
    const bodyStr = bodyLines.join('\n');
    const v1Match = bodyStr.match(/^(V:V1[^\n]*\n)([\s\S]*?)(?=\nV:V2|\n*$)/m);
    const v2Match = bodyStr.match(/(\nV:V2[^\n]*\n)([\s\S]*)$/m);

    if (!v1Match || !v2Match) {
      // fallback: 파싱 실패시 단순 삽입
      return headerStr + '\n' + prepends + bodyStr;
    }

    const v1Header = v1Match[1];
    const v1Body = v1Match[2];
    const v2Header = v2Match[1];
    const v2Body = v2Match[2];

    // bass 보이스용 묵음 계산 (스케일 + 메트로놈 길이만큼)
    let bassSilence = '';
    if (prependBasePitch) {
      const m = multiplier;
      const [topStr, bottomStr] = timeSignature.split('/');
      const bottom = parseInt(bottomStr, 10) || 4;
      const sixteenthsPerBar = parseInt(topStr, 10) * (16 / bottom);
      // 16음표(상행8+하행7+쉼표1) = 16박
      let barPos = 0;
      for (let i = 0; i < 16; i++) {
        bassSilence += `z${m} `;
        barPos += m;
        if (barPos >= sixteenthsPerBar) {
          bassSilence += '| ';
          barPos = 0;
        }
      }
      if (barPos > 0) bassSilence += '| ';
    }
    if (prependMetronome) {
      const m = multiplier;
      const { top } = getTimingInfo();
      for (let i = 0; i < top; i++) {
        bassSilence += `z${m} `;
      }
      bassSilence += '| ';
    }

    return (
      headerStr + '\n' +
      v1Header + prepends + v1Body +
      v2Header + bassSilence + v2Body
    );
  }, [abcString, prependBasePitch, prependMetronome, getTimingInfo, getScaleTimingInfo, scaleTempo, tempo, keySignature, timeSignature]);

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      if (playEndTimeoutRef.current) {
        clearTimeout(playEndTimeoutRef.current);
        playEndTimeoutRef.current = null;
      }
      if (synthRef.current) {
        try { synthRef.current.stop(); } catch { /* ignore */ }
      }
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);

    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const { top, actualBeatDuration } = getTimingInfo();
      const { actualBeatDuration: scaleBeatDuration } = getScaleTimingInfo();
      const combinedAbc = buildCombinedAbc();
      const parsed = abcjs.renderAbc("*", combinedAbc, { responsive: 'resize' });
      const visualObj = parsed?.[0];

      if (visualObj && (visualObj as any).lines?.length) {
        const synth = new abcjs.synth.CreateSynth();
        synthRef.current = synth;
        await synth.init({ audioContext: audioCtx, visualObj });
        await synth.prime();

        if (prependMetronome) {
          const metronomeStartTime = prependBasePitch ? 16 * scaleBeatDuration : 0;
          for (let i = 0; i < top; i++) {
            createMetronomeClick(
              audioCtx,
              audioCtx.currentTime + metronomeStartTime + i * actualBeatDuration,
              i === 0,
              metronomeFreq
            );
          }
        }

        synth.start();

        // 재생 종료 시 버튼을 재생으로 복귀
        let totalDuration = (visualObj as any).getTotalTime ? (visualObj as any).getTotalTime() : 0;
        if (!totalDuration || isNaN(totalDuration)) {
          // 큰보표에서는 | 개수가 V1+V2로 중복되어 잘못 계산되므로 parseAbcParts로 실제 마디 수 사용
          const { treble } = parseAbcParts(abcString);
          const measureCount = treble.length;
          totalDuration =
            (prependBasePitch ? 16 * scaleBeatDuration : 0) +
            (prependMetronome ? top * actualBeatDuration : 0) +
            measureCount * top * actualBeatDuration;
        }
        const endMs = (totalDuration + 0.5) * 1000;
        playEndTimeoutRef.current = setTimeout(() => {
          playEndTimeoutRef.current = null;
          setIsPlaying(false);
        }, Math.min(endMs, 120000)); // 최대 2분
      } else {
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Playback error:', err);
      setIsPlaying(false);
    }
  }, [isPlaying, abcString, buildCombinedAbc, prependBasePitch, prependMetronome, getTimingInfo, getScaleTimingInfo, metronomeFreq]);

  // ── 마디연주 (segmented playback) ────────────────────────────────
  // durationSec: 예상 재생 시간(초). 이 시간만큼 기다린 후 resolve.
  const playSingleAbc = useCallback(async (
    audioCtx: AudioContext,
    abc: string,
    durationSec: number
  ): Promise<void> => {
    try {
      const parsed = abcjs.renderAbc("*", abc, { responsive: 'resize' });
      const vo = parsed?.[0];
      if (!vo) { console.warn('[playSingleAbc] renderAbc returned nothing'); return; }

      const synth = new abcjs.synth.CreateSynth();
      synthRef.current = synth;
      await synth.init({ audioContext: audioCtx, visualObj: vo });
      await synth.prime();
      synth.start();

      // 실제 재생 시간만큼 대기 (100ms 단위로 취소 여부 체크)
      const waitMs = durationSec * 1000 + 200; // 200ms 여유
      const step = 100;
      let elapsed = 0;
      while (elapsed < waitMs) {
        if (cancelRef.current) {
          try { synth.stop(); } catch { /* ignore */ }
          return;
        }
        await sleep(step);
        elapsed += step;
      }
    } catch { /* ignore */ }
  }, []);

  const handleExamPlay = useCallback(async () => {
    if (isPlaying) {
      cancelRef.current = true;
      if (synthRef.current) try { synthRef.current.stop(); } catch { /* ignore */ }
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    cancelRef.current = false;

    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const { top, actualBeatDuration, multiplier } = getTimingInfo();
      const { actualBeatDuration: scaleBeatDuration } = getScaleTimingInfo();
      const measureDurationSec = top * actualBeatDuration;

      const cancelled = () => cancelRef.current;
      const rest = () => sleep(examWaitSeconds * 1000);

      const playMetro = async () => {
        for (let j = 0; j < top; j++) {
          createMetronomeClick(audioCtx, audioCtx.currentTime + j * actualBeatDuration, j === 0, metronomeFreq);
        }
        await sleep(measureDurationSec * 1000);
      };

      const { header, isGrand, treble, bass } = parseAbcParts(abcString);
      const N = treble.length;

      const playRange = async (from: number, to: number) => {
        const end = Math.min(to, N);
        const count = end - from;
        if (count <= 0) return;
        const segAbc = rebuildSegmentAbc(header, isGrand, treble.slice(from, end), isGrand ? bass.slice(from, end) : []);
        await playSingleAbc(audioCtx, segAbc, count * measureDurationSec);
      };

      // ── 1) 스케일 ──
      if (prependBasePitch && !cancelled()) {
        const cleanHeader = header
          .split('\n')
          .filter(l => l.trim() !== '' && !/^%%staves/.test(l) && !/^%%barsperstaff/.test(l))
          .join('\n');

        const ascending = SCALE_NOTES[keySignature] || SCALE_NOTES['C'];
        const descending = [...ascending].slice(0, -1).reverse();
        const allNotes = [...ascending, ...descending, 'z'];
        const [topStr, bottomStr] = timeSignature.split('/');
        const bottom = parseInt(bottomStr, 10) || 4;
        const sixteenthsPerBar = parseInt(topStr, 10) * (16 / bottom);
        let barPos = 0;
        let scaleBody = `[Q:${scaleTempo}] `;
        for (const n of allNotes) {
          scaleBody += `${n}${multiplier} `;
          barPos += multiplier;
          if (barPos >= sixteenthsPerBar) { scaleBody += '| '; barPos = 0; }
        }
        const trimmedBody = scaleBody.trimEnd().replace(/\|$/, '').trimEnd();
        const scaleAbc = cleanHeader + '\n' + trimmedBody + ' |]';
        await playSingleAbc(audioCtx, scaleAbc, 16 * scaleBeatDuration);
        if (cancelled()) { setIsPlaying(false); return; }
      }

      // ── 2) 메트로놈 → 전체 → 휴식 ──
      if (!cancelled()) { await playMetro(); }
      if (!cancelled()) { await playRange(0, N); }
      if (!cancelled()) { await rest(); }

      // ── 3) 2마디 단위 반복 패턴 ──
      // 시퀀스:
      //   (메트로놈 → pair → 휴식) × 2
      //   다음 pair가 있으면: 메트로놈 → 4마디(현재pair+다음pair) → 휴식
      for (let s = 0; s < N && !cancelled(); s += 2) {
        const pairEnd = Math.min(s + 2, N);

        // (메트로놈 → m[s..pairEnd) → 휴식) × 2
        for (let rep = 0; rep < 2 && !cancelled(); rep++) {
          await playMetro();
          if (cancelled()) break;
          await playRange(s, pairEnd);
          if (cancelled()) break;
          await rest();
        }

        // 다음 pair가 있으면 4마디 누적 블록
        if (s + 2 < N && !cancelled()) {
          const cumEnd = Math.min(s + 4, N);
          await playMetro();
          if (!cancelled()) await playRange(s, cumEnd);
          if (!cancelled()) await rest();
        }
      }

      // ── 4) 메트로놈 → 전체 (마지막) ──
      if (!cancelled()) { await playMetro(); }
      if (!cancelled()) { await playRange(0, N); }

    } catch (err) {
      console.error('Exam playback error:', err);
    }

    setIsPlaying(false);
  }, [isPlaying, abcString, prependBasePitch, getTimingInfo, getScaleTimingInfo,
      playSingleAbc, keySignature, timeSignature, scaleTempo, metronomeFreq, examWaitSeconds]);

  const onPlayClick = useCallback(() => {
    if (examMode) return handleExamPlay();
    return handlePlay();
  }, [examMode, handleExamPlay, handlePlay]);

  // ── 개별 ABC → AudioBuffer 오프라인 렌더링 ──
  const renderAbcOffline = useCallback(async (
    abc: string, durationSec: number, sampleRate: number
  ): Promise<AudioBuffer> => {
    const frames = Math.max(1, Math.floor(sampleRate * (durationSec + 0.5)));
    const offCtx = new OfflineAudioContext(2, frames, sampleRate);
    (offCtx as any).resume = () => Promise.resolve();
    (offCtx as any).suspend = () => Promise.resolve();

    const parsed = abcjs.renderAbc("*", abc, { responsive: 'resize' });
    const vo = parsed?.[0];
    if (!vo) throw new Error('renderAbc failed');

    const synth = new abcjs.synth.CreateSynth();
    await synth.init({ audioContext: offCtx as any, visualObj: vo });
    await synth.prime();
    synth.start();
    return await offCtx.startRendering();
  }, []);

  const handleDownloadAudio = useCallback(async (title: string) => {
    setIsExporting(true);
    try {
      const { top, actualBeatDuration } = getTimingInfo();
      const { actualBeatDuration: scaleBeatDuration } = getScaleTimingInfo();
      const sampleRate = 44100;
      const combinedAbc = buildCombinedAbc();
      const parsed = abcjs.renderAbc("*", combinedAbc, { responsive: 'resize' });
      const visualObj = parsed?.[0];

      if (!visualObj || !(visualObj as any).lines?.length) throw new Error('Could not render ABC for export');

      let totalDuration = (visualObj as any).getTotalTime ? (visualObj as any).getTotalTime() : 0;
      if (!totalDuration || isNaN(totalDuration)) {
        const { treble } = parseAbcParts(abcString);
        const measureCount = treble.length;
        totalDuration =
          (prependBasePitch ? 16 * scaleBeatDuration : 0) +
          (prependMetronome ? top * actualBeatDuration : 0) +
          measureCount * top * actualBeatDuration;
      }
      totalDuration += 2;

      const numFrames = Math.max(1, Math.floor(sampleRate * totalDuration));
      if (isNaN(numFrames)) throw new Error('Invalid audio duration calculated');

      const offlineCtx = new OfflineAudioContext(2, numFrames, sampleRate);
      (offlineCtx as any).resume = () => Promise.resolve();
      (offlineCtx as any).suspend = () => Promise.resolve();

      const synth = new abcjs.synth.CreateSynth();
      await synth.init({ audioContext: offlineCtx as any, visualObj });
      await synth.prime();

      if (prependMetronome) {
        const metronomeStartTime = prependBasePitch ? 16 * scaleBeatDuration : 0;
        for (let i = 0; i < top; i++) {
          createMetronomeClick(offlineCtx, metronomeStartTime + i * actualBeatDuration, i === 0, metronomeFreq);
        }
      }

      synth.start();

      const renderedBuffer = await offlineCtx.startRendering();
      downloadWav(renderedBuffer, title);
    } catch (err) {
      console.error('Export error:', err);
      alert('음원 내보내기 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  }, [abcString, buildCombinedAbc, prependBasePitch, prependMetronome, getTimingInfo, getScaleTimingInfo, metronomeFreq]);

  // ── 시험용 전체 시퀀스 음원 저장 ──
  const handleExamDownload = useCallback(async (title: string) => {
    setIsExporting(true);
    try {
      const sampleRate = 44100;
      const { top, actualBeatDuration, multiplier } = getTimingInfo();
      const { actualBeatDuration: scaleBeatDuration } = getScaleTimingInfo();
      const measureDur = top * actualBeatDuration;
      const metroDur = measureDur;
      const restDur = examWaitSeconds;

      const { header, isGrand, treble, bass } = parseAbcParts(abcString);
      const N = treble.length;

      const buildRange = (from: number, to: number) => {
        const end = Math.min(to, N);
        return rebuildSegmentAbc(header, isGrand, treble.slice(from, end), isGrand ? bass.slice(from, end) : []);
      };

      // ── 1단계: 시퀀스 전체 타임라인 계산 ──
      type Step =
        | { kind: 'scale'; dur: number }
        | { kind: 'metro'; dur: number }
        | { kind: 'range'; from: number; to: number; dur: number }
        | { kind: 'rest'; dur: number };

      const steps: Step[] = [];

      // 스케일
      if (prependBasePitch) {
        const scaleDur = 16 * scaleBeatDuration;
        steps.push({ kind: 'scale', dur: scaleDur });
      }

      // 메트로놈 → 전체 → 휴식
      steps.push({ kind: 'metro', dur: metroDur });
      steps.push({ kind: 'range', from: 0, to: N, dur: N * measureDur });
      steps.push({ kind: 'rest', dur: restDur });

      // 2마디 단위 패턴
      for (let s = 0; s < N; s += 2) {
        const pairEnd = Math.min(s + 2, N);
        const pairCount = pairEnd - s;
        const pairDur = pairCount * measureDur;

        for (let rep = 0; rep < 2; rep++) {
          steps.push({ kind: 'metro', dur: metroDur });
          steps.push({ kind: 'range', from: s, to: pairEnd, dur: pairDur });
          steps.push({ kind: 'rest', dur: restDur });
        }

        if (s + 2 < N) {
          const cumEnd = Math.min(s + 4, N);
          const cumCount = cumEnd - s;
          steps.push({ kind: 'metro', dur: metroDur });
          steps.push({ kind: 'range', from: s, to: cumEnd, dur: cumCount * measureDur });
          steps.push({ kind: 'rest', dur: restDur });
        }
      }

      // 메트로놈 → 전체 (마지막)
      steps.push({ kind: 'metro', dur: metroDur });
      steps.push({ kind: 'range', from: 0, to: N, dur: N * measureDur });

      // ── 2단계: 각 ABC 세그먼트를 오프라인 렌더링 ──
      // 동일 범위는 캐시하여 재사용
      const bufferCache = new Map<string, AudioBuffer>();
      const getBuffer = async (abc: string, dur: number): Promise<AudioBuffer> => {
        const key = abc;
        if (bufferCache.has(key)) return bufferCache.get(key)!;
        const buf = await renderAbcOffline(abc, dur, sampleRate);
        bufferCache.set(key, buf);
        return buf;
      };

      // 스케일 ABC 빌드
      let scaleAbc = '';
      if (prependBasePitch) {
        const cleanHdr = header
          .split('\n')
          .filter(l => l.trim() !== '' && !/^%%staves/.test(l) && !/^%%barsperstaff/.test(l))
          .join('\n');
        const ascending = SCALE_NOTES[keySignature] || SCALE_NOTES['C'];
        const descending = [...ascending].slice(0, -1).reverse();
        const allNotes = [...ascending, ...descending, 'z'];
        const [topStr, bottomStr] = timeSignature.split('/');
        const bottom = parseInt(bottomStr, 10) || 4;
        const sixteenthsPerBar = parseInt(topStr, 10) * (16 / bottom);
        let barPos = 0;
        let body = `[Q:${scaleTempo}] `;
        for (const n of allNotes) {
          body += `${n}${multiplier} `;
          barPos += multiplier;
          if (barPos >= sixteenthsPerBar) { body += '| '; barPos = 0; }
        }
        const trimmed = body.trimEnd().replace(/\|$/, '').trimEnd();
        scaleAbc = cleanHdr + '\n' + trimmed + ' |]';
      }

      // 타임라인 구성: offset 계산 + 버퍼 준비
      type Scheduled = { offset: number; buffer?: AudioBuffer; metro?: true };
      const scheduled: Scheduled[] = [];
      let cursor = 0;

      for (const step of steps) {
        if (step.kind === 'scale') {
          const buf = await getBuffer(scaleAbc, step.dur);
          scheduled.push({ offset: cursor, buffer: buf });
          cursor += step.dur;
        } else if (step.kind === 'metro') {
          scheduled.push({ offset: cursor, metro: true });
          cursor += step.dur;
        } else if (step.kind === 'range') {
          const abc = buildRange(step.from, step.to);
          const buf = await getBuffer(abc, step.dur);
          scheduled.push({ offset: cursor, buffer: buf });
          cursor += step.dur;
        } else {
          cursor += step.dur;
        }
      }

      // ── 3단계: 최종 OfflineAudioContext에 모두 스케줄링 ──
      const totalDuration = cursor + 1;
      const totalFrames = Math.max(1, Math.floor(sampleRate * totalDuration));
      const finalCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

      for (const item of scheduled) {
        if (item.buffer) {
          const src = finalCtx.createBufferSource();
          src.buffer = item.buffer;
          src.connect(finalCtx.destination);
          src.start(item.offset);
        }
        if (item.metro) {
          for (let j = 0; j < top; j++) {
            createMetronomeClick(finalCtx, item.offset + j * actualBeatDuration, j === 0, metronomeFreq);
          }
        }
      }

      const finalBuffer = await finalCtx.startRendering();
      downloadWav(finalBuffer, title);
    } catch (err) {
      console.error('Exam export error:', err);
      alert('시험용 음원 내보내기 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  }, [abcString, prependBasePitch, getTimingInfo, getScaleTimingInfo, renderAbcOffline,
      keySignature, timeSignature, scaleTempo, metronomeFreq, examWaitSeconds]);

  useEffect(() => {
    const handler = (e: any) => {
      const t = e.detail?.title;
      if (examMode) handleExamDownload(t);
      else handleDownloadAudio(t);
    };
    window.addEventListener('abcjs-download-audio', handler);
    return () => window.removeEventListener('abcjs-download-audio', handler);
  }, [examMode, handleDownloadAudio, handleExamDownload]);

  return (
    <div className="w-full flex flex-col gap-4 pb-4">
      <div ref={paperRef} className="abcjs-paper w-full min-h-[200px] bg-white text-black p-4 rounded-xl border border-border shadow-sm overflow-x-auto" style={{ touchAction: 'pan-y' }} />
      <div className="flex items-center gap-3 bg-slate-100 p-3 rounded-xl max-w-md mx-auto w-full">
        <button
          onClick={onPlayClick}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm ${
            isPlaying ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-indigo-500 text-white hover:bg-indigo-600'
          }`}
        >
          {isPlaying ? <Square size={16} /> : <Play size={16} />}
          {isPlaying ? '정지' : '재생'}
        </button>
        {isExporting && (
          <span className="text-xs text-slate-500 animate-pulse flex items-center gap-1">
            <Volume2 size={14} /> 음원 생성 중...
          </span>
        )}
      </div>
    </div>
  );
}
